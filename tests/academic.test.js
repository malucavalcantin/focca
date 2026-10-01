import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcProgress, countStatuses, subjectAverage, percentLabel, approvalSituation, findNextClass,
} from '../public/academic.js';

const subjects = [
  { name: 'A', hours: 60, status: 'approved' },
  { name: 'B', hours: 60, status: 'exempt' },
  { name: 'C', hours: 30, status: 'approved_final' },
  { name: 'D', hours: 60, status: 'current' },
  { name: 'E', hours: 60, status: 'failed' },
  { name: 'F', hours: 30, status: 'pending' },
  { name: 'G', hours: 0, status: 'approved' },   // sem carga horária: fora do cálculo de horas
  { name: 'H', hours: '45', status: 'withdrawn' }, // horas como texto, vindo do Firestore
];

test('progresso soma só as horas de disciplinas concluídas', () => {
  const p = calcProgress(subjects);
  assert.equal(p.total, 345);
  assert.equal(p.done, 150);
  assert.equal(p.projected, 210);
  assert.equal(p.pct.toFixed(4), (150 / 345 * 100).toFixed(4));
  assert.equal(p.projectedPct.toFixed(4), (210 / 345 * 100).toFixed(4));
});

test('progresso com matriz vazia não divide por zero', () => {
  assert.deepEqual(calcProgress([]), { total: 0, done: 0, projected: 0, pct: 0, projectedPct: 0 });
});

test('contagem de status trata trancada como pendente', () => {
  assert.deepEqual(countStatuses(subjects), { done: 4, current: 1, failed: 1, pending: 2 });
});

test('média ignora notas inválidas e de outras disciplinas', () => {
  const assessments = [
    { subjectId: 'x', grade: 8 },
    { subjectId: 'x', grade: '6.5' },
    { subjectId: 'x', grade: 'abc' },
    { subjectId: 'y', grade: 2 },
  ];
  assert.equal(subjectAverage(assessments, 'x'), 7.25);
  assert.equal(subjectAverage(assessments, 'z'), null);
});

test('percentual usa vírgula e uma casa decimal', () => {
  assert.equal(percentLabel(30.84), '30,8%');
  assert.equal(percentLabel(null), '0,0%');
  assert.equal(percentLabel(100), '100,0%');
});

test('aprovação: faltando notas', () => {
  assert.deepEqual(approvalSituation({ va1: 7, va2: null }), { stage: 'missing' });
});

test('aprovação por média com exatamente 7', () => {
  assert.deepEqual(approvalSituation({ va1: 6, va2: 8 }), { stage: 'approved', initial: 7, afterVA3: 7 });
});

test('3ª VA necessária informa a nota mínima', () => {
  assert.deepEqual(approvalSituation({ va1: 5, va2: 6 }), { stage: 'needs-va3', initial: 5.5, afterVA3: 5.5, needed: 8 });
  // com notas muito baixas, nem 10 na 3ª VA basta
  assert.equal(approvalSituation({ va1: 1, va2: 2 }).needed, 12);
});

test('3ª VA substitui a menor nota quando é maior', () => {
  assert.deepEqual(approvalSituation({ va1: 4, va2: 8, va3: 7 }), { stage: 'approved-va3', afterVA3: 7.5, replaced: true });
  // empate: substitui a 1ª VA
  assert.equal(approvalSituation({ va1: 5, va2: 5, va3: 9 }).afterVA3, 7);
});

test('3ª VA menor que as duas notas não substitui', () => {
  const r = approvalSituation({ va1: 6, va2: 6.5, va3: 3 });
  assert.equal(r.stage, 'needs-final');
  assert.equal(r.afterVA3, 6.25);
  assert.equal(r.needed, 3.75);
});

test('final: aprovado com média final 5 e reprovado abaixo', () => {
  assert.deepEqual(approvalSituation({ va1: 4, va2: 4, va3: 4, final: 6 }), { stage: 'approved-final', afterVA3: 4, finalAverage: 5 });
  assert.equal(approvalSituation({ va1: 4, va2: 4, va3: 4, final: 5.9 }).stage, 'failed');
});

test('próxima aula considera o horário de agora e os próximos 7 dias', () => {
  // quarta-feira, 30/09/2026, 10:30
  const now = new Date(2026, 8, 30, 10, 30);
  const schedule = [
    { id: 'manha', day: 'Quarta', start: '08:00' }, // já passou hoje
    { id: 'tarde', day: 'Quarta', start: '14:00' },
    { id: 'sexta', day: 'Sexta', start: '07:00' },
  ];
  const next = findNextClass(schedule, now);
  assert.equal(next.item.id, 'tarde');
  assert.equal(next.date.getHours(), 14);

  const onlyMorning = findNextClass([schedule[0]], now);
  assert.equal(onlyMorning.date.getDate(), 7); // próxima quarta, 07/10
  assert.equal(findNextClass([], now), null);
});
