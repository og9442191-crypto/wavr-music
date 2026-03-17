const express = require('express');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP = path.join(__dirname, 'yt-dlp');

function ensureYtDlp() {
  if (fs.existsSync(YTDLP)) {
    try { execSync(`${YTDLP} -U --no-update-messages`, { timeout: 20000 }); } catch(e) {}
    console.log('yt-dlp ok!');
    return;
  }
  console.log('Baixando yt-dlp...');
  execSync(
    `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${YTDLP} && chmod +x ${YTDLP}`,
    { timeout: 60000 }
  );
  console.log('yt-dlp instalado!');
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ytdlp: fs.existsSync(YTDLP) });
});

app.get('/api/stream', (req, res) => {
  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
    return res.status(400).json({ error: 'ID inválido' });
  if (!fs.existsSync(YTDLP))
    return res.status(503).json({ error: 'yt-dlp não encontrado' });

  console.log('>>> Buscando:', id);

  // User-agent de browser real + extractor-args para usar JS nativo do Node
  const args = [
    '--no-check-certificates',
    '--no-playlist',
    '--socket-timeout', '15',
    '--retries', '5',
    // Simula browser real para evitar bloqueio 429
    '--user-agent', 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    '--add-header', 'Accept-Language:pt-BR,pt;q=0.9,en;q=0.8',
    '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    // Usa o extrator javascript nativo do Node.js
    '--extractor-args', 'youtube:player_client=android',
    '-f', 'bestaudio',
    '--get-url',
    `https://www.youtube.com/watch?v=${id}`
  ];

  let done = false;
  const child = spawn(YTDLP, args);
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; process.stdout.write('[yt-dlp] ' + d); });

  const timer = setTimeout(() => {
    if (done) return; done = true;
    child.kill();
    console.error('<<< TIMEOUT:', id);
    res.status(504).json({ error: 'Timeout — tente novamente' });
  }, 40000);

  child.on('close', code => {
    clearTimeout(timer);
    if (done) return; done = true;
    const url = out.trim().split('\n')[0];
    if (code === 0 && url && url.startsWith('http')) {
      console.log('<<< OK:', id);
      res.json({ url });
    } else {
      console.error(`<<< FALHA (${code}):`, err.slice(0, 300));
      res.status(404).json({ error: 'Stream não encontrado', detail: err.slice(0, 300) });
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`WAVR na porta ${PORT}`);
  ensureYtDlp();
});
