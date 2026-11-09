import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularSituacao } from '../servico-notas/src/regras.js';
import { calcularResumoFrequencia } from '../servico-frequencia/src/regras.js';

test('notas: sem VA1 e VA2 a situação fica incompleta', () => {
  assert.equal(calcularSituacao({ va1: 7 }).etapa, 'notas-incompletas');
});

test('notas: média exatamente 7 aprova direto', () => {
  assert.deepEqual(calcularSituacao({ va1: 6, va2: 8 }), { etapa: 'aprovado', descricao: 'Aprovado por média.', mediaInicial: 7 });
});

test('notas: abaixo de 7 pede 3ª VA e informa a nota necessária', () => {
  const s = calcularSituacao({ va1: 4, va2: 6 });
  assert.equal(s.etapa, 'precisa-va3');
  assert.equal(s.notaNecessaria, 8); // (6 + 8) / 2 = 7
});

test('notas: 3ª VA substitui a menor nota', () => {
  const s = calcularSituacao({ va1: 4, va2: 6, va3: 8 });
  assert.equal(s.etapa, 'aprovado-va3');
  assert.equal(s.mediaAposVA3, 7);
  assert.equal(s.substituiu, true);
});

test('notas: 3ª VA menor que as duas notas não substitui nada', () => {
  const s = calcularSituacao({ va1: 5, va2: 6, va3: 2 });
  assert.equal(s.etapa, 'precisa-final');
  assert.equal(s.mediaAposVA3, 5.5);
  assert.equal(s.substituiu, false);
  assert.equal(s.notaNecessaria, 4.5);
});

test('notas: final aprova com (média + final) / 2 >= 5 e reprova abaixo', () => {
  assert.equal(calcularSituacao({ va1: 3, va2: 4, va3: 5, final: 5.5 }).etapa, 'aprovado-final'); // (4.5 + 5.5) / 2 = 5
  assert.equal(calcularSituacao({ va1: 3, va2: 4, va3: 5, final: 5 }).etapa, 'reprovado');
});

test('frequência: limite é 25% da carga horária', () => {
  const r = calcularResumoFrequencia({ cargaHoraria: 60, faltas: 4 });
  assert.equal(r.limite, 15);
  assert.equal(r.restantes, 11);
  assert.equal(r.nivel, 'ok');
  assert.equal(r.frequencia, 93.3);
});

test('frequência: níveis de atenção, risco e reprovação', () => {
  assert.equal(calcularResumoFrequencia({ cargaHoraria: 60, faltas: 8 }).nivel, 'atencao');
  assert.equal(calcularResumoFrequencia({ cargaHoraria: 60, faltas: 12 }).nivel, 'risco');
  assert.equal(calcularResumoFrequencia({ cargaHoraria: 60, faltas: 15 }).nivel, 'risco');
  assert.equal(calcularResumoFrequencia({ cargaHoraria: 60, faltas: 16 }).nivel, 'reprovado-por-falta');
});

test('frequência: disciplina sem chamada não tem limite', () => {
  const r = calcularResumoFrequencia({ cargaHoraria: 60, temChamada: false, faltas: 3 });
  assert.equal(r.nivel, 'sem-chamada');
  assert.equal(r.limite, null);
});
