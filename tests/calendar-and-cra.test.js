import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDateForWeekday, buildClassEvent, taskEventPatch, untilUtc } from '../public/calendar-events.js';
import { calcCRA, projectedCRA, craGoalNeeded } from '../public/academic.js';

test('próxima data do dia da semana inclui hoje', () => {
  const wed = new Date(2026, 8, 30, 15, 0); // quarta
  assert.equal(nextDateForWeekday('Quarta', wed).getDate(), 30);
  assert.equal(nextDateForWeekday('Sexta', wed).getDate(), 2);    // 02/10
  assert.equal(nextDateForWeekday('Segunda', wed).getDate(), 5);  // 05/10
  assert.throws(() => nextDateForWeekday('Feriado', wed));
});

test('aula vira evento semanal até o último dia de aula', () => {
  const ev = buildClassEvent(
    { id: 's1', day: 'Terça', start: '10:00', end: '12:00', location: 'Lab 2' },
    { subjectName: 'Banco de Dados I', until: '2026-12-18', from: new Date(2026, 8, 30), timeZone: 'America/Recife' },
  );
  assert.equal(ev.summary, 'Banco de Dados I');
  assert.equal(ev.location, 'Lab 2');
  assert.deepEqual(ev.start, { dateTime: '2026-10-06T10:00:00', timeZone: 'America/Recife' });
  assert.deepEqual(ev.end, { dateTime: '2026-10-06T12:00:00', timeZone: 'America/Recife' });
  assert.deepEqual(ev.recurrence, [`RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=${untilUtc('2026-12-18')}`]);
  assert.match(untilUtc('2026-12-18'), /^2026121[89]T\d{6}Z$/);
  assert.equal(ev.extendedProperties.private.scheduleId, 's1');
});

test('aula sem data final ou com semestre encerrado gera erro claro', () => {
  const item = { day: 'Terça', start: '10:00', end: '12:00' };
  assert.throws(() => buildClassEvent(item, { until: '' }), /último dia de aula/);
  assert.throws(() => buildClassEvent(item, { until: '2026-10-01', from: new Date(2026, 9, 2) }), /já passou/);
});

test('concluir e reabrir atividade muda o evento', () => {
  const task = { title: 'Lista 3', subject: 'Cálculo' };
  assert.deepEqual(taskEventPatch(task, true), { summary: '✅ Lista 3 — Cálculo', transparency: 'transparent', colorId: '8' });
  assert.deepEqual(taskEventPatch(task, false), { summary: 'Lista 3 — Cálculo', transparency: 'opaque', colorId: null });
});

const subjects = [
  { id: 'a', hours: 60, status: 'approved', finalGrade: 8 },
  { id: 'b', hours: 30, status: 'approved_final', finalGrade: 5.5 },
  { id: 'c', hours: 60, status: 'failed', finalGrade: 3 },
  { id: 'd', hours: 60, status: 'approved' },               // sem nota lançada
  { id: 'e', hours: 60, status: 'exempt', finalGrade: 10 }, // dispensada: fora do CRA
  { id: 'f', hours: 60, status: 'current' },
  { id: 'g', hours: 30, status: 'current' },
  { id: 'h', hours: 60, status: 'pending' },
];

test('CRA pondera pela carga horária e ignora dispensadas', () => {
  const r = calcCRA(subjects);
  assert.equal(r.hours, 150);
  assert.equal(r.points, 60 * 8 + 30 * 5.5 + 60 * 3);
  assert.equal(r.cra.toFixed(4), ((480 + 165 + 180) / 150).toFixed(4)); // 5,5
  assert.equal(r.count, 3);
  assert.equal(r.missing, 1);
  assert.deepEqual(calcCRA([]), { cra: null, hours: 0, points: 0, count: 0, missing: 0 });
});

test('CRA projetado usa as médias atuais de quem já tem nota', () => {
  assert.equal(projectedCRA(subjects, { f: 9, g: null }).toFixed(4), ((825 + 540) / 210).toFixed(4));
  assert.equal(projectedCRA([], {}), null);
});

test('meta de CRA calcula a média necessária no semestre', () => {
  const r = craGoalNeeded(subjects, 6);
  assert.equal(r.currentHours, 90);
  assert.equal(r.needed.toFixed(4), ((6 * 240 - 825) / 90).toFixed(4)); // 6,83
  assert.equal(r.reachable, true);
  assert.equal(craGoalNeeded(subjects, 9.5).reachable, false);
  assert.equal(craGoalNeeded(subjects, 2).alreadyMet, true);
  assert.equal(craGoalNeeded(subjects, null), null);
  assert.equal(craGoalNeeded(subjects.filter(s => s.status !== 'current'), 7), null);
});
