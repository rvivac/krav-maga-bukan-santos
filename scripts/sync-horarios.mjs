import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrairTurmas, serializarTXT, hashSHA256, DEFAULT_URL } from './crawler-bukan-horarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TARGET_TXT = join(ROOT, 'content', 'site', 'horarios-turmas.txt');
const TARGET_UPDATE_TXT = join(ROOT, 'content', 'site', 'horarios-ultima-atualizacao.txt');
const CACHE_DIR = join(ROOT, '.cache');
const HASH_FILE = join(CACHE_DIR, 'horarios.sha256');

function fmtDataAtualizacao() {
  const d = new Date();
  const br = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).reduce((m,p)=>(m[p.type]=p.value,m),{});
  return `${br.day}/${br.month}/${br.year} · ${br.hour}:${br.minute} (America/Sao_Paulo)`;
}

function log(...args) { console.log(`[sync-horarios ${new Date().toISOString()}]`, ...args); }
function logWarn(...args) { console.warn(`[sync-horarios WARN ${new Date().toISOString()}]`, ...args); }
function logError(...args) { console.error(`[sync-horarios ERR ${new Date().toISOString()}]`, ...args); }

let exitCode = 0;
function setExit(code) { exitCode = code; }
function doExit() { try { process.exitCode = exitCode; } catch(_) {} }
process.on('beforeExit', doExit);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const SITE_URL = args.has('--url') ? process.argv[process.argv.indexOf('--url') + 1] : DEFAULT_URL;

async function main() {
  log('Início. DRY_RUN=' + DRY_RUN + ' URL=' + SITE_URL);
  const ext = await extrairTurmas(SITE_URL);
  if (!ext.ok) {
    logError(`Fase ${ext.fase} falhou: ${ext.error}`);
    setExit(2);
    return;
  }
  log(`Extração OK. Fonte="${ext.fonte}" QTD=${ext.qtd} crosscheck=${JSON.stringify(ext.crosscheck)}`);

  const novoConteudo = serializarTXT(ext.turmas);
  const novoHash = ext.hash;
  log(`Hash SHA-256 novo=${novoHash}`);

  if (!existsSync(TARGET_TXT)) {
    logWarn('Arquivo alvo não existe, será criado:', TARGET_TXT);
  }
  const antigoConteudo = existsSync(TARGET_TXT) ? readFileSync(TARGET_TXT, 'utf8') : '';
  const antigoHash = antigoConteudo ? hashSHA256(antigoConteudo) : '';
  log(`Hash SHA-256 existente=${antigoHash || '(novo)'}`);

  if (novoHash === antigoHash && antigoHash) {
    const strAtualizacao = fmtDataAtualizacao();
    if (!DRY_RUN) {
      writeFileSync(TARGET_UPDATE_TXT, strAtualizacao + '\n', { encoding: 'utf8', flag: 'w' });
    }
    log(`Nenhuma alteração detectada nos horários. Última verificação/sincronia atualizada → ${strAtualizacao}.`);
    setExit(0);
    return;
  }

  let linhasDiferentes = 0;
  if (antigoConteudo) {
    const antigoArr = antigoConteudo.replace(/\r/g,'').split('\n').filter(l => l.trim());
    const novoArr = novoConteudo.replace(/\r/g,'').split('\n').filter(l => l.trim());
    const min = Math.min(antigoArr.length, novoArr.length);
    for (let i = 0; i < min; i++) if (antigoArr[i] !== novoArr[i]) linhasDiferentes++;
    linhasDiferentes += Math.abs(antigoArr.length - novoArr.length);
  } else linhasDiferentes = novoConteudo.split('\n').length;

  log(`DIFERENÇA DETECTADA. Linhas divergentes estimadas=${linhasDiferentes}`);

  if (DRY_RUN) {
    console.log('\n======== DRY RUN — CONTEÚDO QUE SERIA GRAVADO ========\n');
    console.log(novoConteudo);
    console.log('======== FIM DRY RUN ===============================\n');
    log('DRY RUN. Saindo sem gravar.');
    setExit(0);
    return;
  }

  writeFileSync(TARGET_TXT, novoConteudo, { encoding: 'utf8', flag: 'w' });
  log('Arquivo gravado:', TARGET_TXT);

  const strAtualizacao = fmtDataAtualizacao();
  writeFileSync(TARGET_UPDATE_TXT, strAtualizacao + '\n', { encoding: 'utf8', flag: 'w' });
  log('Última atualização gravada:', TARGET_UPDATE_TXT, '→', strAtualizacao);

  try { mkdirSync(CACHE_DIR, { recursive:true }); } catch(_) {}
  writeFileSync(HASH_FILE, `${novoHash}\n${new Date().toISOString()}\n`, { encoding:'utf8', flag:'w' });

  const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
  if (GITHUB_OUTPUT) {
    try {
      const lines = [];
      lines.push(`atualizado=true`);
      lines.push(`turmas_qtd=${ext.qtd}`);
      lines.push(`fonte=${ext.fonte}`);
      lines.push(`hash=${novoHash}`);
      lines.push(`linhas_divergentes=${linhasDiferentes}`);
      const summaryBody = `### Sync Horários executado em ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}\n\n- **Fonte dados**: \`${ext.fonte}\`\n- **Qtd turmas**: ${ext.qtd}\n- **Hash**: \`${novoHash}\`\n- **Linhas modificadas**: ~${linhasDiferentes}\n\n\`\`\`\nArquivo atualizado: content/site/horarios-turmas.txt\n\`\`\``;
      writeFileSync(GITHUB_OUTPUT, lines.join('\n') + '\n', { encoding:'utf8', flag:'a' });
      const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;
      if (GITHUB_STEP_SUMMARY) writeFileSync(GITHUB_STEP_SUMMARY, summaryBody, { encoding:'utf8', flag:'a' });
    } catch(e) { logWarn('Falha ao escrever GITHUB_OUTPUT:', e.message); }
  }

  setExit(0);
}

main().catch(err => { logError('Exceção fatal:', err?.stack || String(err)); setExit(3); });
