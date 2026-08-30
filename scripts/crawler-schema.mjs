import { createHash } from 'node:crypto';
import { z } from './_vendor/node_modules/zod/index.js';

const DIAS_ORDENADOS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
const WEEKDAY_MAP = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 7:'Domingo' };

const horaRegex = /^\d{2}:\d{2}–\d{2}:\d{2}$/;
const slotRegex = /^\d{2}:\d{2}$/;

const TurmaSchema = z.object({
  dia: z.enum(['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']),
  hora: z.string().regex(horaRegex, 'Hora deve ter formato HH:MM–HH:MM'),
  turma: z.string().trim().min(2).max(80),
  professor: z.string().trim().min(3).max(120)
}).strict();

const TurmasSchema = z.array(TurmaSchema).min(12).max(40);

function validateTurmas(arr) {
  const parsed = TurmasSchema.safeParse(arr);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i, idx) =>
      `  [${idx+1}] caminho="${i.path.join('.')}" msg="${i.message}" valor=${JSON.stringify(i.code)}`
    ).join('\n');
    return { ok:false, issues, errors: parsed.error.issues };
  }
  return { ok:true, data: parsed.data };
}

function sortTurmas(turmas) {
  return [...turmas].sort((a,b) => {
    const da = DIAS_ORDENADOS.indexOf(a.dia);
    const db = DIAS_ORDENADOS.indexOf(b.dia);
    if (da !== db) return da - db;
    const ha = a.hora.split('–')[0];
    const hb = b.hora.split('–')[0];
    return ha.localeCompare(hb);
  });
}

function serializarTXT(turmasOrdenadas) {
  return turmasOrdenadas.map(t =>
    `${t.dia}\n${t.hora}\n${t.turma}\n${t.professor}`
  ).join('\n\n') + '\n';
}

function hashSHA256(txt) {
  return createHash('sha256').update(txt, 'utf8').digest('hex');
}

export {
  DIAS_ORDENADOS,
  WEEKDAY_MAP,
  horaRegex,
  slotRegex,
  TurmaSchema,
  TurmasSchema,
  validateTurmas,
  sortTurmas,
  serializarTXT,
  hashSHA256
};
