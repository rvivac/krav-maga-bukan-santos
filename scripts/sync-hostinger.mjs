import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { extrairTurmas, serializarTXT, hashSHA256, DEFAULT_URL } from './crawler-bukan-horarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TARGET_TXT = join(ROOT, 'content', 'site', 'horarios-turmas.txt');
const TARGET_UPDATE_TXT = join(ROOT, 'content', 'site', 'horarios-ultima-atualizacao.txt');

const GITHUB_REPO = process.env.GITHUB_REPOSITORY || 'rvivac/krav-maga-bukan-santos';
const GITHUB_TOKEN = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';

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
  }).formatToParts(d).reduce((m, p) => ((m[p.type] = p.value), m), {});
  return `${br.day}/${br.month}/${br.year} · ${br.hour}:${br.minute} (America/Sao_Paulo)`;
}

async function commitViaGitHubAPI(filePath, fileContent, commitMsg) {
  if (!GITHUB_TOKEN) {
    console.warn('[sync-hostinger] GITHUB_PAT ou GITHUB_TOKEN não configurado. Pulei commit via API.');
    return false;
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'BukanSantos-HostingerSync/1.0'
  };

  let sha = undefined;
  try {
    const getRes = await fetch(url, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }
  } catch (err) {
    console.warn(`[sync-hostinger] Não foi possível obter SHA de ${filePath}:`, err.message);
  }

  const body = {
    message: commitMsg,
    content: Buffer.from(fileContent, 'utf8').toString('base64'),
    branch: 'main'
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const errBody = await putRes.text();
    console.error(`[sync-hostinger] Erro ao enviar ${filePath} via GitHub API (${putRes.status}):`, errBody);
    return false;
  }

  console.log(`[sync-hostinger] Arquivo ${filePath} comitado com sucesso via GitHub API.`);
  return true;
}

function commitViaGitCLI(mensagem) {
  try {
    execSync('git config user.name "Hostinger Cron Sync"', { cwd: ROOT, stdio: 'ignore' });
    execSync('git config user.email "bot@kravmagabukansantos.com.br"', { cwd: ROOT, stdio: 'ignore' });

    if (GITHUB_TOKEN) {
      execSync(`git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`, { cwd: ROOT, stdio: 'ignore' });
    }

    execSync('git add content/site/horarios-turmas.txt content/site/horarios-ultima-atualizacao.txt', { cwd: ROOT, stdio: 'ignore' });
    execSync(`git commit -m "${mensagem}"`, { cwd: ROOT, stdio: 'ignore' });
    execSync('git push origin main', { cwd: ROOT, stdio: 'ignore' });
    console.log('[sync-hostinger] Commit e push realizados com sucesso via Git CLI.');
    return true;
  } catch (err) {
    console.warn('[sync-hostinger] Não foi possível realizar commit via Git CLI local:', err.message);
    return false;
  }
}

// Configuração para rodar na Hostinger com as credenciais do Git via variável de ambiente
async function runHostingerSync() {
  console.log('Iniciando sync na Hostinger...');
  const ext = await extrairTurmas(DEFAULT_URL);
  
  if (!ext.ok) {
    console.error(`Erro na raspagem: ${ext.error}`);
    process.exit(1);
  }

  const novoConteudo = serializarTXT(ext.turmas);
  const dataAtual = fmtDataAtualizacao();
  
  const antigoConteudo = existsSync(TARGET_TXT) ? readFileSync(TARGET_TXT, 'utf8') : '';
  const antigoHash = antigoConteudo ? hashSHA256(antigoConteudo) : '';
  const novoHash = ext.hash;

  if (novoHash === antigoHash && antigoHash) {
    console.log(`Nenhuma alteração nos horários. Data de verificação: ${dataAtual}. Finalizado.`);
    writeFileSync(TARGET_UPDATE_TXT, dataAtual + '\n', 'utf8');
    return;
  }

  writeFileSync(TARGET_TXT, novoConteudo, 'utf8');
  writeFileSync(TARGET_UPDATE_TXT, dataAtual + '\n', 'utf8');
  console.log(`Arquivo atualizado localmente na Hostinger em ${dataAtual}.`);

  const commitMsg = `sync(horarios): atualização automática de turmas — ${dataAtual}`;

  // Tenta sincronizar via Git local primeiro
  const gitOk = commitViaGitCLI(commitMsg);

  // Se o ambiente da Hostinger não tiver Git CLI configurado, tenta direto via GitHub REST API usando o PAT
  if (!gitOk && GITHUB_TOKEN) {
    console.log('[sync-hostinger] Tentando commit direto via GitHub REST API...');
    await commitViaGitHubAPI('content/site/horarios-turmas.txt', novoConteudo, commitMsg);
    await commitViaGitHubAPI('content/site/horarios-ultima-atualizacao.txt', dataAtual + '\n', commitMsg);
  }
}

runHostingerSync();
