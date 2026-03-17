const express = require('express');
const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP = '/tmp/yt-dlp';

// ── Baixa yt-dlp se não existir ──────────────────────────────
function ensureYtDlp() {
  if (fs.existsSync(YTDLP)) return;
  console.log('Baixando yt-dlp...');
  execSync(
    `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${YTDLP} && chmod +x ${YTDLP}`,
    { timeout: 60000 }
  );
  console.log('yt-dlp pronto!');
}

// ── CORS — permite qualquer origem ──────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Serve o site estático (pasta public) ────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API: busca URL do stream de áudio ───────────────────────
app.get('/api/stream', async (req, res) => {
  const { id } = req.query;

  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    ensureYtDlp();

    const url = execSync(
      `${YTDLP} -f "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio" --get-url "https://www.youtube.com/watch?v=${id}"`,
      { timeout: 25000, encoding: 'utf8' }
    ).trim().split('\n')[0];

    if (!url || !url.startsWith('http')) {
      return res.status(404).json({ error: 'Stream não encontrado' });
    }

    res.json({ url });
  } catch (err) {
    console.error('Erro:', err.message);
    res.status(500).json({ error: 'Erro ao buscar stream' });
  }
});

// ── Fallback: serve index.html para qualquer rota ───────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`WAVR rodando na porta ${PORT}`);
  ensureYtDlp(); // pré-baixa na inicialização
});
