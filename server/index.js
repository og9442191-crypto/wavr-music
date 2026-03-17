const express = require('express');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP = path.join(__dirname, 'yt-dlp');

function ensureYtDlp() {
  if (fs.existsSync(YTDLP)) {
    console.log('yt-dlp já existe, atualizando...');
    try { execSync(`${YTDLP} -U --no-update-messages`, { timeout: 20000 }); } catch(e) {}
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

  console.log('>>> Buscando stream:', id);

  // Tenta múltiplos formatos e sem verificação de certificado
  const args = [
    '--no-check-certificates',
    '--no-playlist',
    '--socket-timeout', '15',
    '--retries', '3',
    '-f', 'bestaudio',
    '--get-url',
    `https://www.youtube.com/watch?v=${id}`
  ];

  let done = false;
  const child = spawn(YTDLP, args);
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => {
    err += d;
    // Loga stderr em tempo real para debug
    process.stdout.write('[yt-dlp] ' + d);
  });

  const timer = setTimeout(() => {
    if (done) return; done = true;
    child.kill();
    console.error('<<< TIMEOUT para:', id);
    res.status(504).json({ error: 'Timeout' });
  }, 35000);

  child.on('close', code => {
    clearTimeout(timer);
    if (done) return; done = true;
    const url = out.trim().split('\n')[0];
    if (code === 0 && url && url.startsWith('http')) {
      console.log('<<< OK:', id, url.slice(0, 60) + '...');
      res.json({ url });
    } else {
      console.error(`<<< FALHA (code=${code}) para ${id}`);
      console.error('stderr:', err.slice(0, 500));
      res.status(404).json({ error: 'Stream não encontrado', detail: err.slice(0, 200) });
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
