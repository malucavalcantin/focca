// Sobe o Discovery, os dois serviços (cada um com seu BD) e o gateway em portas
// livres e testa as chamadas de ponta a ponta, sempre pelo gateway.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { criarDiscovery } from '../discovery/src/app.js';
import { criarGateway } from '../gateway/src/app.js';
import { criarServicoNotas } from '../servico-notas/src/app.js';
import { abrirRepositorio as repoNotas } from '../servico-notas/src/repositorio.js';
import { criarServicoFrequencia } from '../servico-frequencia/src/app.js';
import { abrirRepositorio as repoFrequencia } from '../servico-frequencia/src/repositorio.js';
import { criarClienteDiscovery } from '../servico-notas/src/discovery-cliente.js';

const servidores = [];
const cancelamentos = [];
let gateway, discovery;

async function subir(servidor) {
  servidor.listen(0);
  await once(servidor, 'listening');
  servidores.push(servidor);
  return `http://localhost:${servidor.address().port}`;
}

before(async () => {
  discovery = await subir(criarDiscovery());
  const cliente = criarClienteDiscovery(discovery);
  const notas = await subir(criarServicoNotas(await repoNotas(), { localizar: cliente.localizar }));
  const frequencia = await subir(criarServicoFrequencia(await repoFrequencia()));
  cancelamentos.push(await cliente.registrar({ nome: 'notas', url: notas }));
  cancelamentos.push(await cliente.registrar({ nome: 'frequencia', url: frequencia }));
  gateway = await subir(criarGateway({ discoveryUrl: discovery }));
});

after(async () => {
  for (const cancelar of cancelamentos) await cancelar();
  for (const s of servidores) s.close();
});

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(gateway + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  return { status: resp.status, corpo: texto ? JSON.parse(texto) : null };
}

test('Discovery conhece os dois serviços', async () => {
  const { corpo } = await chamar('GET', '/saude');
  assert.equal(corpo.discovery, 'ok');
  assert.deepEqual(Object.keys(corpo.servicos).sort(), ['frequencia', 'notas']);
});

test('notas: lançar, consultar, listar e remover pelo gateway', async () => {
  let r = await chamar('PUT', '/api/notas/estudantes/ana/disciplinas/apsoo/notas', { va1: 5, va2: 6 });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.situacao.etapa, 'precisa-va3');

  r = await chamar('PUT', '/api/notas/estudantes/ana/disciplinas/apsoo/notas', { va1: 5, va2: 6, va3: 9 });
  assert.equal(r.corpo.situacao.etapa, 'aprovado-va3');

  r = await chamar('GET', '/api/notas/estudantes/ana/disciplinas/apsoo/notas');
  assert.equal(r.corpo.va3, 9);

  r = await chamar('GET', '/api/notas/estudantes/ana/notas');
  assert.equal(r.corpo.disciplinas.length, 1);

  r = await chamar('DELETE', '/api/notas/estudantes/ana/disciplinas/apsoo/notas');
  assert.equal(r.status, 204);
  r = await chamar('GET', '/api/notas/estudantes/ana/disciplinas/apsoo/notas');
  assert.equal(r.status, 404);
});

test('notas: validação recusa nota fora de 0 a 10 e final sem VA3', async () => {
  let r = await chamar('PUT', '/api/notas/estudantes/ana/disciplinas/x/notas', { va1: 11, va2: 5 });
  assert.equal(r.status, 400);
  assert.match(r.corpo.detalhes[0], /va1/);
  r = await chamar('PUT', '/api/notas/estudantes/ana/disciplinas/x/notas', { va1: 3, va2: 5, final: 7 });
  assert.equal(r.status, 400);
});

test('notas: simulação de situação não grava nada', async () => {
  const r = await chamar('POST', '/api/notas/situacao', { va1: 3, va2: 4, va3: 5, final: 6 });
  assert.equal(r.corpo.etapa, 'aprovado-final');
  const lista = await chamar('GET', '/api/notas/estudantes/ana/notas');
  assert.equal(lista.corpo.disciplinas.length, 0);
});

test('frequência: cadastrar disciplina, registrar e remover faltas', async () => {
  let r = await chamar('POST', '/api/frequencia/estudantes/ana/disciplinas/calculo/faltas', { data: '2026-11-03' });
  assert.equal(r.status, 404); // disciplina ainda não cadastrada

  r = await chamar('PUT', '/api/frequencia/estudantes/ana/disciplinas/calculo', { cargaHoraria: 60 });
  assert.equal(r.corpo.resumo.limite, 15);

  r = await chamar('POST', '/api/frequencia/estudantes/ana/disciplinas/calculo/faltas', { data: '2026-11-03', quantidade: 2 });
  assert.equal(r.status, 201);
  const idFalta = r.corpo.falta.id;
  r = await chamar('POST', '/api/frequencia/estudantes/ana/disciplinas/calculo/faltas', { data: '2026-11-05', quantidade: 8 });
  assert.equal(r.corpo.resumo.faltas, 10);
  assert.equal(r.corpo.resumo.nivel, 'atencao');

  r = await chamar('DELETE', `/api/frequencia/estudantes/ana/faltas/${idFalta}`);
  assert.equal(r.status, 204);
  r = await chamar('GET', '/api/frequencia/estudantes/ana/disciplinas/calculo/frequencia');
  assert.equal(r.corpo.resumo.faltas, 8);
  assert.equal(r.corpo.faltas.length, 1);
});

test('frequência: validação recusa data mal formatada', async () => {
  await chamar('PUT', '/api/frequencia/estudantes/ana/disciplinas/fisica', { cargaHoraria: 30 });
  const r = await chamar('POST', '/api/frequencia/estudantes/ana/disciplinas/fisica/faltas', { data: '03/11/2026' });
  assert.equal(r.status, 400);
});

test('Discovery registra e retorna as instâncias de cada serviço', async () => {
  const resp = await fetch(`${discovery}/servicos/frequencia`);
  assert.equal(resp.status, 200);
  const { instancias } = await resp.json();
  assert.equal(instancias.length, 1);
  assert.equal((await fetch(`${discovery}/servicos/inexistente`)).status, 404);
});

test('Notas consulta a Frequência pelo Discovery: reprovado por falta vence a nota', async () => {
  await chamar('PUT', '/api/frequencia/estudantes/bia/disciplinas/bd', { cargaHoraria: 4 }); // limite: 1 falta
  await chamar('POST', '/api/frequencia/estudantes/bia/disciplinas/bd/faltas', { data: '2026-11-03', quantidade: 2 });
  await chamar('PUT', '/api/notas/estudantes/bia/disciplinas/bd/notas', { va1: 8, va2: 9 });
  const r = await chamar('GET', '/api/notas/estudantes/bia/disciplinas/bd/notas');
  assert.equal(r.corpo.situacao.etapa, 'aprovado');
  assert.equal(r.corpo.frequencia.disponivel, true);
  assert.equal(r.corpo.frequencia.resumo.nivel, 'reprovado-por-falta');
  assert.equal(r.corpo.situacaoFinal, 'reprovado-por-falta');
});

test('gateway como fachada: resumo junta Notas e Frequência numa resposta', async () => {
  const r = await chamar('GET', '/api/estudantes/bia/resumo');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.notas.disponivel, true);
  assert.equal(r.corpo.frequencia.disponivel, true);
  assert.equal(r.corpo.notas.dados.disciplinas[0].disciplinaId, 'bd');
  assert.equal(r.corpo.frequencia.dados.disciplinas[0].disciplinaId, 'bd');
});

test('gateway: serviço desconhecido dá 404 e serviço fora do ar dá 503', async () => {
  assert.equal((await chamar('GET', '/api/agenda/x')).status, 404);
  // remove o registro real do serviço de notas e confirma que o gateway responde 503
  const lista = await (await fetch(`${discovery}/servicos`)).json();
  await fetch(`${discovery}/servicos/notas?url=${encodeURIComponent(lista.notas[0])}`, { method: 'DELETE' });
  assert.equal((await chamar('GET', '/api/notas/estudantes/ana/notas')).status, 503);
});
