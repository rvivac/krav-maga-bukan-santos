import { WEEKDAY_MAP, horaRegex, slotRegex, validateTurmas, sortTurmas, serializarTXT, hashSHA256 } from './crawler-schema.mjs';

const USER_AGENT = 'BukanSantosBot/1.0 (+https://kravmagabukansantos.com.br; sync crawler 1x/dia)';
const DEFAULT_URL = 'https://kravmaga-bukan.com/br/onde-treinar/bukan-santos';
const TIMEOUT_MS = 12000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPagina(url, { tentativas = 2 } = {}) {
  let ultimaErro;
  for (let tent = 0; tent < tentativas; tent++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS + tent * 4000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9'
        },
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (!res.ok) { ultimaErro = new Error(`HTTP ${res.status} ${res.statusText}`); if (tent<tentativas-1) await sleep(1500*(tent+1)); continue; }
      return { ok:true, html: await res.text(), status: res.status };
    } catch (e) {
      ultimaErro = e;
      if (tent < tentativas-1) await sleep(1500*(tent+1));
    }
  }
  return { ok:false, error: ultimaErro?.message || String(ultimaErro) };
}

function parseTurmasDeStateInline(html) {
  try {
    const mSched = html.match(/\$R\[[0-9]+\]=[\s\S]*?schedule:\$R\[([0-9]+)\]=\[/);
    if (!mSched) return null;
    const startIdx = html.indexOf(`schedule:$R[${mSched[1]}]=[`);
    if (startIdx < 0) return null;
    const slice = html.slice(startIdx);
    let i = slice.indexOf('[');
    let depth = 0;
    let jsonStart = -1;
    for (; i < slice.length; i++) {
      const c = slice[i];
      if (c === '[') { depth++; if (jsonStart<0) jsonStart=i; }
      else if (c === ']') { depth--; if (depth === 0 && jsonStart>=0) break; }
    }
    if (jsonStart<0) return null;
    const bracketed = slice.slice(jsonStart, i+1);
    let s = bracketed;
    s = s.replace(/\$R\[[0-9]+\]/g, (m) => {
      const idx = Number(m.slice(3,-1));
      return `"__R${idx}__"`;
    });
    s = s.replace(/,([,\]\)])/g, '$1');
    let arr;
    try { arr = JSON.parse(s); } catch(_) { return null; }
    const turmas = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const turmaNome = typeof item.name === 'string' ? item.name : null;
      const instrutor = typeof item.instructor_name === 'string' ? item.instructor_name : null;
      const slots = Array.isArray(item.slots) ? item.slots : [];
      for (const slot of slots) {
        if (!slot || typeof slot !== 'object') continue;
        const wd = typeof slot.weekday === 'number' ? slot.weekday : null;
        const st = typeof slot.start_time === 'string' && slotRegex.test(slot.start_time) ? slot.start_time : null;
        const et = typeof slot.end_time === 'string' && slotRegex.test(slot.end_time) ? slot.end_time : null;
        if (!wd || !st || !et || !turmaNome || !instrutor) continue;
        const dia = WEEKDAY_MAP[wd];
        if (!dia) continue;
        const hora = `${st}–${et}`;
        if (!horaRegex.test(hora)) continue;
        turmas.push({ dia, hora, turma: turmaNome, professor: instrutor });
      }
    }
    return turmas.length ? turmas : null;
  } catch(_) { return null; }
}

function parseTurmasDeJSONLD(html) {
  try {
    const m = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return null;
    let data;
    try { data = JSON.parse(m[1]); } catch(_) { return null; }
    const grafico = Array.isArray(data?.['@graph']) ? data['@graph'] : [];
    const cursos = grafico.filter(n => n && n['@type'] === 'Course');
    if (!cursos.length) return null;
    const dayMap = {
      'https://schema.org/Monday':'Segunda','https://schema.org/Tuesday':'Terça','https://schema.org/Wednesday':'Quarta',
      'https://schema.org/Thursday':'Quinta','https://schema.org/Friday':'Sexta','https://schema.org/Saturday':'Sábado','https://schema.org/Sunday':'Domingo'
    };
    const turmas = [];
    for (const curso of cursos) {
      const turmaNome = typeof curso.name === 'string' ? curso.name : null;
      const inst = curso.hasCourseInstance?.instructor?.name;
      const instrutor = typeof inst === 'string' ? inst : null;
      const schedules = Array.isArray(curso.hasCourseInstance?.courseSchedule)
        ? curso.hasCourseInstance.courseSchedule
        : (curso.hasCourseInstance?.courseSchedule ? [curso.hasCourseInstance.courseSchedule] : []);
      for (const s of schedules) {
        if (!s || typeof s !== 'object') continue;
        const dias = Array.isArray(s.byDay) ? s.byDay : (typeof s.byDay === 'string' ? [s.byDay] : []);
        const st = typeof s.startTime === 'string' && slotRegex.test(s.startTime) ? s.startTime : null;
        const et = typeof s.endTime === 'string' && slotRegex.test(s.endTime) ? s.endTime : null;
        if (!st || !et || !turmaNome || !instrutor) continue;
        const hora = `${st}–${et}`;
        if (!horaRegex.test(hora)) continue;
        for (const d of dias) {
          const dia = dayMap[d];
          if (!dia) continue;
          turmas.push({ dia, hora, turma: turmaNome, professor: instrutor });
        }
      }
    }
    return turmas.length ? turmas : null;
  } catch(_) { return null; }
}

function stripHTML(str) {
  return String(str || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
function parseTurmasDeTabela(html) {
  try {
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/i;
    const tm = html.match(tableRe);
    if (!tm) return null;
    const tb = tm[1];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const turmas = [];
    let diaAtual = null;
    let rm;
    while ((rm = rowRe.exec(tb)) !== null) {
      const row = rm[1];
      const thRe = row.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
      const tds = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(x => stripHTML(x[1]));
      if (thRe) {
        const d = stripHTML(thRe[1]);
        if (d && ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].includes(d)) diaAtual = d;
      }
      if (tds.length < 3) continue;
      let [hora, turma, professor] = tds;
      hora = hora.replace(/\s+/g,'');
      if (!horaRegex.test(hora)) continue;
      if (!turma || !professor) continue;
      if (!diaAtual) continue;
      turmas.push({ dia: diaAtual, hora, turma, professor });
    }
    return turmas.length ? turmas : null;
  } catch(_) { return null; }
}

async function extrairTurmas(url = DEFAULT_URL) {
  const fet = await fetchPagina(url);
  if (!fet.ok) return { ok:false, fase:'fetch', error: fet.error };
  const fontes = [];
  const f1 = parseTurmasDeStateInline(fet.html);
  if (f1) fontes.push({ nome:'state_inline', turmas: f1 });
  const f2 = parseTurmasDeJSONLD(fet.html);
  if (f2) fontes.push({ nome:'jsonld', turmas: f2 });
  const f3 = parseTurmasDeTabela(fet.html);
  if (f3) fontes.push({ nome:'tabela_html', turmas: f3 });
  if (!fontes.length) return { ok:false, fase:'parse', error:'Nenhuma das 3 fontes (state_inline/jsonld/tabela_html) retornou turmas.' };
  const validas = [];
  const errosPorFonte = [];
  for (const fonte of fontes) {
    const sorted = sortTurmas(fonte.turmas);
    const v = validateTurmas(sorted);
    if (v.ok) validas.push({ ...fonte, turmas: v.data, hash: hashSHA256(serializarTXT(v.data)) });
    else errosPorFonte.push({ fonte: fonte.nome, issues: v.issues });
  }
  if (!validas.length) {
    return { ok:false, fase:'validate', error:`Todas fontes falharam na validação Zod. Detalhes: ${JSON.stringify(errosPorFonte,null,2)}` };
  }
  validas.sort((a,b) => b.turmas.length - a.turmas.length);
  const campea = validas[0];
  const demais = validas.slice(1).map(v => ({fonte:v.nome, hashMatch: v.hash === campea.hash, qtd: v.turmas.length}));
  return { ok:true, fonte: campea.nome, turmas: campea.turmas, hash: campea.hash, qtd: campea.turmas.length, fontesValidas: validas.map(v=>v.nome), crosscheck: demais };
}

export {
  DEFAULT_URL,
  USER_AGENT,
  extrairTurmas,
  sortTurmas,
  serializarTXT,
  hashSHA256,
  validateTurmas
};
