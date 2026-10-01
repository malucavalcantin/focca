// Montagem dos eventos do Google Agenda (funções puras, testadas em tests/).

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// O Google exige UNTIL em UTC: usa o fim do último dia de aula no horário local.
export function untilUtc(until) {
  const [y, m, d] = until.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Primeira data em `from` ou depois dele que cai no dia da semana pedido. */
export function nextDateForWeekday(dayName, from = new Date()) {
  const target = WEEKDAYS.indexOf(dayName);
  if (target < 0) throw new Error(`Dia da semana inválido: ${dayName}`);
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return d;
}

/**
 * Evento semanal de uma aula, do próximo dia da aula até `until` (AAAA-MM-DD,
 * último dia de aula, inclusive). Horários em hora local no fuso `timeZone`.
 */
export function buildClassEvent(item, { subjectName, until, from = new Date(), timeZone = 'America/Recife' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until || '')) throw new Error('Informe o último dia de aula do semestre.');
  const first = nextDateForWeekday(item.day, from);
  if (isoDate(first) > until) throw new Error('O último dia de aula já passou. Atualize a data do fim do semestre.');
  const day = isoDate(first);
  return {
    summary: subjectName || item.subjectName || 'Aula',
    location: item.location || '',
    description: 'Aula semanal criada pelo Focca.',
    start: { dateTime: `${day}T${item.start}:00`, timeZone },
    end: { dateTime: `${day}T${item.end}:00`, timeZone },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAYS[WEEKDAYS.indexOf(item.day)]};UNTIL=${untilUtc(until)}`],
    extendedProperties: { private: { source: 'focca-app', scheduleId: item.id || '' } },
  };
}

/** Alterações no evento de uma atividade ao concluir ou reabrir. */
export function taskEventPatch(task, completed) {
  const base = `${task.title} — ${task.subject || task.subjectName || ''}`.replace(/ — $/, '');
  return completed
    ? { summary: `✅ ${base}`, transparency: 'transparent', colorId: '8' }
    : { summary: base, transparency: 'opaque', colorId: null };
}
