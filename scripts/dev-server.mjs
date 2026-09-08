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

// Live Reload via Server-Sent Events (SSE)
const liveReloadClients = new Set();

function broadcastReload() {
  console.log(`[dev-server ${new Date().toLocaleTimeString('pt-BR')}] Alteração detectada! Recarregando navegador...`);
  for (const client of liveReloadClients) {
    try {
      client.write('data: reload\n\n');
    } catch (_) {
      liveReloadClients.delete(client);
    }
  }
}

let reloadTimer = null;
function scheduleReload(filename) {
  if (filename) {
    const fn = filename.toLowerCase();
    if (fn.includes('.git') || fn.includes('node_modules') || fn.endsWith('.tmp') || fn.endsWith('~')) {
      return;
    }
  }
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(broadcastReload, 150);
}

// Watch nas pastas principais (content, assets, scripts, index.html)
try {
  fs.watch(ROOT, { recursive: true }, (eventType, filename) => {
    scheduleReload(filename);
  });
} catch (err) {
  console.warn('[dev-server] fs.watch recursive não disponível:', err.message);
}

const LIVE_RELOAD_SNIPPET = `
<!-- [dev-server] Live Reload Automático -->
<script>
(() => {
  try {
    const es = new EventSource('/__livereload');
    es.onmessage = (e) => {
      if (e.data === 'reload') {
        console.log('[dev-server] Atualização recebida, recarregando com cache limpo...');
        const url = new URL(window.location.href);
        url.searchParams.set('_r', Date.now());
        window.location.replace(url.toString());
      }
    };
    es.onerror = () => { /* reconexão automática pelo navegador */ };
  } catch (_) {}
})();
</script>
`;

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
  // CORS e Anti-Cache Geral
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Clear-Site-Data', '"cache"');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // SSE Live Reload Endpoint
  if (pathname === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 1500\n\n');
    liveReloadClients.add(res);
    req.on('close', () => {
      liveReloadClients.delete(res);
    });
    return;
  }

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

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end(JSON.stringify({
        ok: true,
        message: 'Horários atualizados e gravados no arquivo txt com sucesso!',
        ultimaAtualizacao,
        turmas
      }));
    } catch (err) {
      console.error('[dev-server ERROR] Falha no sync:', err.message);

      const targetUpdateTxt = path.join(ROOT, 'content', 'site', 'horarios-ultima-atualizacao.txt');
      const targetTurmasTxt = path.join(ROOT, 'content', 'site', 'horarios-turmas.txt');

      const dataAgora = fmtDataAtualizacao();
      try {
        fs.writeFileSync(targetUpdateTxt, dataAgora + '\n', 'utf8');
      } catch (_) {}

      const turmas = fs.existsSync(targetTurmasTxt)
        ? fs.readFileSync(targetTurmasTxt, 'utf8').replace(/\r/g, '').trimEnd()
        : '';

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
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
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end('Arquivo não encontrado: ' + pathname);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Para HTML, injeta o script de Live Reload antes de </body>
    if (ext === '.html') {
      let html = fs.readFileSync(filePath, 'utf8');
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${LIVE_RELOAD_SNIPPET}\n</body>`);
      } else {
        html += LIVE_RELOAD_SNIPPET;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Clear-Site-Data': '"cache"'
      });
      return res.end(html);
    }

    // Para outros arquivos estáticos (JSON, TXT, imagens, etc.)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Clear-Site-Data': '"cache"'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro interno: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`  Bukan Santos - Dev Server Local Ativo!`);
  console.log(`  URL Local:   http://localhost:${PORT}`);
  console.log(`  Live Reload: ATIVADO (qualquer arquivo salvo atualiza o navegador)`);
  console.log(`  Sem Cache:   ATIVADO (Cache-Control: no-store)`);
  console.log(`  API Sync:    http://localhost:${PORT}/api/sync-horarios`);
  console.log(`========================================================\n`);
});
