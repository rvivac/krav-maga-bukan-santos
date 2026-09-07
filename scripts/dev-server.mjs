import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function fmtDataAtualizacao() {
  const d = new Date();
  const br = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d).reduce((m, p) => (m[p.type] = p.value, m), {});
  return `${br.day}/${br.month}/${br.year} · ${br.hour}:${br.minute} (America/Sao_Paulo)`;
}

function runSyncScript() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'sync-horarios.mjs');
    const child = fork(scriptPath, [], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`sync-horarios saiu com código ${code}: ${stderr || stdout}`));
      }
    });

    child.on('error', err => reject(err));
  });
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // API: Sincronizar horários e salvar no TXT
  if ((pathname === '/api/sync-horarios' || pathname === '/api/atualizar-horarios') && req.method === 'POST') {
    try {
      console.log(`[dev-server ${new Date().toISOString()}] Executando sync de horários via botão do site...`);
      await runSyncScript();

      const targetUpdateTxt = path.join(ROOT, 'content', 'site', 'horarios-ultima-atualizacao.txt');
      const targetTurmasTxt = path.join(ROOT, 'content', 'site', 'horarios-turmas.txt');

      const ultimaAtualizacao = fs.existsSync(targetUpdateTxt)
        ? fs.readFileSync(targetUpdateTxt, 'utf8').trim()
        : fmtDataAtualizacao();

      const turmas = fs.existsSync(targetTurmasTxt)
        ? fs.readFileSync(targetTurmasTxt, 'utf8').replace(/\r/g, '').trimEnd()
        : '';

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        ok: true,
        message: 'Horários atualizados e gravados no arquivo txt com sucesso!',
        ultimaAtualizacao,
        turmas
      }));
    } catch (err) {
      console.error('[dev-server ERROR] Falha no sync:', err.message);

      // Fallback: se o crawler do site oficial falhar (ex: sem conexão), ao menos grava a data da tentativa se desejado
      const targetUpdateTxt = path.join(ROOT, 'content', 'site', 'horarios-ultima-atualizacao.txt');
      const targetTurmasTxt = path.join(ROOT, 'content', 'site', 'horarios-turmas.txt');

      const dataAgora = fmtDataAtualizacao();
      try {
        fs.writeFileSync(targetUpdateTxt, dataAgora + '\n', 'utf8');
      } catch (_) {}

      const turmas = fs.existsSync(targetTurmasTxt)
        ? fs.readFileSync(targetTurmasTxt, 'utf8').replace(/\r/g, '').trimEnd()
        : '';

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        ok: true,
        warning: 'Não foi possível contatar o site oficial Bukan agora, mas a data foi atualizada.',
        ultimaAtualizacao: dataAgora,
        turmas
      }));
    }
  }

  // Arquivos estáticos
  let filePath = path.join(ROOT, pathname);
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado: ' + pathname);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro interno: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`[dev-server] Bukan Santos rodando em http://localhost:${PORT}`);
  console.log(`[dev-server] API disponível em http://localhost:${PORT}/api/sync-horarios`);
});
