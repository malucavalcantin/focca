// Cálculos acadêmicos puros (sem DOM e sem Firebase), usados pelo app.js
// e cobertos pelos testes em tests/academic.test.js.

export const DONE_STATUSES = new Set(['approved', 'approved_final', 'exempt']);

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const hoursOf = s => Number(s.hours || 0);
const sumHours = list => list.reduce((total, s) => total + hoursOf(s), 0);

/** Carga horária total, concluída e projetada (concluídas + cursando). */
export function calcProgress(subjects) {
  const eligible = subjects.filter(s => Number(s.hours) > 0);
  const total = sumHours(eligible);
  const done = sumHours(eligible.filter(s => DONE_STATUSES.has(s.status)));
  const projected = sumHours(eligible.filter(s => DONE_STATUSES.has(s.status) || s.status === 'current'));
  return {
    total,
    done,
    projected,
    pct: total ? done / total * 100 : 0,
    projectedPct: total ? projected / total * 100 : 0,
  };
}

/** Quantidade de disciplinas concluídas, cursando, reprovadas e pendentes. */
export function countStatuses(subjects) {
  const isDone = s => DONE_STATUSES.has(s.status);
  return {
    done: subjects.filter(isDone).length,
    current: subjects.filter(s => s.status === 'current').length,
    failed: subjects.filter(s => s.status === 'failed').length,
    pending: subjects.filter(s => !isDone(s) && s.status !== 'current' && s.status !== 'failed').length,
  };
}

/** Média simples das notas válidas de uma disciplina, ou null sem notas. */
export function subjectAverage(assessments, subjectId) {
  const values = assessments
    .filter(a => a.subjectId === subjectId)
    .map(a => Number(a.grade))
    .filter(Number.isFinite);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** 30.84 -> "30,8%" */
export function percentLabel(value) {
  return `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
}

/**
 * Regra de aprovação: média das duas VAs >= 7 aprova; a 3ª VA substitui a
 * menor nota se for maior; abaixo de 7, (média + Final) / 2 precisa ser >= 5.
 * Retorna a etapa e os números (afterVA3 é sempre a "média base" exibida);
 * o texto exibido fica no app.js.
 */
export function approvalSituation({ va1, va2, va3 = null, final = null }) {
  if (va1 == null || va2 == null) return { stage: 'missing' };

  const initial = (va1 + va2) / 2;
  let effective1 = va1, effective2 = va2, replaced = false;
  const lower = Math.min(va1, va2);
  if (va3 != null && va3 > lower) {
    if (va1 <= va2) effective1 = va3; else effective2 = va3;
    replaced = true;
  }
  const afterVA3 = (effective1 + effective2) / 2;

  if (initial >= 7) return { stage: 'approved', initial, afterVA3 };
  if (va3 == null) {
    return { stage: 'needs-va3', initial, afterVA3, needed: Math.max(0, 14 - Math.max(va1, va2)) };
  }
  if (afterVA3 >= 7) return { stage: 'approved-va3', afterVA3, replaced };
  if (final == null) {
    return { stage: 'needs-final', afterVA3, needed: Math.max(0, 10 - afterVA3) };
  }
  const finalAverage = (afterVA3 + final) / 2;
  return { stage: finalAverage >= 5 ? 'approved-final' : 'failed', afterVA3, finalAverage };
}

/**
 * Próxima aula a partir de `now`. Olha até 7 dias à frente (inclusive), para
 * achar a aula da semana que vem no mesmo dia quando a de hoje já passou.
 */
export function findNextClass(schedule, now = new Date()) {
  let best = null, bestDate = null;
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    const day = DAY_NAMES[d.getDay()];
    schedule.filter(x => x.day === day && x.start).forEach(x => {
      const [h, m] = x.start.split(':').map(Number);
      const when = new Date(d);
      when.setHours(h, m, 0, 0);
      if (when >= now && (!bestDate || when < bestDate)) { best = x; bestDate = when; }
    });
  }
  return best ? { item: best, date: bestDate } : null;
}

/**
 * Situação de faltas de uma disciplina. O limite é 25% da carga horária
 * (frequência mínima de 75%), contando cada falta como 1 hora-aula.
 * Disciplinas sem chamada ficam com nível 'no-calls'.
 */
export function absenceStatus({ hours, absences, calls = true }) {
  const used = Number(absences || 0);
  if (!calls) return { level: 'no-calls', used, limit: null, remaining: null, pct: 0 };
  const limit = Math.floor(Number(hours || 0) * 0.25);
  if (!limit) return { level: 'unknown', used, limit: null, remaining: null, pct: 0 };
  const pct = Math.min(100, used / limit * 100);
  const level = used > limit ? 'over' : pct >= 75 ? 'risk' : pct >= 50 ? 'warning' : 'ok';
  return { level, used, limit, remaining: Math.max(0, limit - used), pct };
}

/** Situações que entram no CRA (com nota final). Dispensadas não entram. */
export const GRADED_STATUSES = new Set(['approved', 'approved_final', 'failed']);

const isGrade = v => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10;

/**
 * CRA: média das notas finais ponderada pela carga horária, considerando
 * aprovadas e reprovadas com nota lançada. `missing` conta as que faltam nota.
 */
export function calcCRA(subjects) {
  const counted = subjects.filter(s => GRADED_STATUSES.has(s.status) && Number(s.hours) > 0);
  const graded = counted.filter(s => isGrade(s.finalGrade));
  const hours = sumHours(graded);
  const points = graded.reduce((total, s) => total + hoursOf(s) * Number(s.finalGrade), 0);
  return { cra: hours ? points / hours : null, hours, points, count: graded.length, missing: counted.length - graded.length };
}

/**
 * CRA projetado se as disciplinas cursando terminarem com as médias atuais
 * (`averages`: id -> média ou null; sem média, a disciplina fica de fora).
 */
export function projectedCRA(subjects, averages) {
  const base = calcCRA(subjects);
  const current = subjects.filter(s => s.status === 'current' && Number(s.hours) > 0 && isGrade(averages[s.id]));
  const hours = base.hours + sumHours(current);
  if (!hours) return null;
  return (base.points + current.reduce((t, s) => t + hoursOf(s) * Number(averages[s.id]), 0)) / hours;
}

/**
 * Média necessária nas disciplinas cursando (todas com a mesma nota) para o
 * CRA chegar a `goal` ao fim do semestre. null se não há disciplinas cursando.
 */
export function craGoalNeeded(subjects, goal) {
  if (!isGrade(goal)) return null;
  const base = calcCRA(subjects);
  const currentHours = sumHours(subjects.filter(s => s.status === 'current' && Number(s.hours) > 0));
  if (!currentHours) return null;
  const needed = (Number(goal) * (base.hours + currentHours) - base.points) / currentHours;
  return { needed, reachable: needed <= 10, alreadyMet: needed <= 0, currentHours };
}
