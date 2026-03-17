const express = require('express');
const { execSync, spawn } = require('child_process');
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
  try {
    execSync(
      `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${YTDLP} && chmod +x ${YTDLP}`,
      { timeout: 60000 }
    );
    console.log('yt-dlp instalado!');
  } catch(e) { console.error('Erro ao baixar yt-dlp:', e.message); }
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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
    return res.status(503).json({ error: 'Servidor iniciando, aguarde 30s e tente novamente' });

  console.log('Buscando stream:', id);

  const args = [
    '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    '--get-url', '--no-playlist',
    '--socket-timeout', '10',
    `https://www.youtube.com/watch?v=${id}`
  ];

  let done = false;
  const child = spawn(YTDLP, args);
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });

  const timer = setTimeout(() => {
    if (done) return; done = true;
    child.kill();
    console.error('Timeout para:', id);
    res.status(504).json({ error: 'Timeout — tente novamente' });
  }, 30000);

  child.on('close', code => {
    clearTimeout(timer);
    if (done) return; done = true;
    const url = out.trim().split('\n')[0];
    if (code === 0 && url && url.startsWith('http')) {
      console.log('OK:', id);
      res.json({ url });
    } else {
      console.error(`Falha (${code}) ${id}:`, err.slice(0, 300));
      res.status(404).json({ error: 'Stream não encontrado' });
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
