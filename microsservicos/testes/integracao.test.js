// Sobe o Discovery, os cinco serviços (cada um com seu banco) e o gateway em
// portas livres e testa as chamadas de ponta a ponta, sempre pelo gateway e
// com login de verdade no Serviço de Autenticação.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { criarDiscovery } from '../discovery/src/app.js';
import { criarGateway } from '../gateway/src/app.js';
import { criarClienteDiscovery } from '../servico-notas/src/discovery-cliente.js';
import { criarServicoAutenticacao } from '../servico-autenticacao/src/app.js';
import { abrirRepositorio as repoAutenticacao } from '../servico-autenticacao/src/repositorio.js';
import { criarAdaptadorGoogle } from '../servico-autenticacao/src/adaptador-google.js';
import { criarServicoNotas } from '../servico-notas/src/app.js';
import { abrirRepositorio as repoNotas } from '../servico-notas/src/repositorio.js';
import { criarServicoFrequencia } from '../servico-frequencia/src/app.js';
import { abrirRepositorio as repoFrequencia } from '../servico-frequencia/src/repositorio.js';
import { criarServicoAgenda } from '../servico-agenda/src/app.js';
import { abrirRepositorio as repoAgenda } from '../servico-agenda/src/repositorio.js';
import { criarAdaptadorGoogleAgenda } from '../servico-agenda/src/adaptador-google-agenda.js';
import { criarServicoSemestre } from '../servico-semestre/src/app.js';
import { abrirRepositorio as repoSemestre } from '../servico-semestre/src/repositorio.js';

const servidores = [];
const cancelamentos = [];
let gateway, discovery, token, eu;

async function subir(servidor) {
  servidor.listen(0);
  await once(servidor, 'listening');
  servidores.push(servidor);
  return `http://localhost:${servidor.address().port}`;
}

async function chamar(metodo, caminho, corpo, { autenticar = true, comToken = token } = {}) {
  const resp = await fetch(gateway + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(autenticar && comToken ? { Authorization: `Bearer ${comToken}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  return { status: resp.status, corpo: texto ? JSON.parse(texto) : null, atendente: resp.headers.get('x-servico-atendente') };
}

before(async () => {
  discovery = await subir(criarDiscovery());
  const cliente = criarClienteDiscovery(discovery);
  const urls = {
    autenticacao: await subir(criarServicoAutenticacao(await repoAutenticacao(), { adaptadorGoogle: criarAdaptadorGoogle({ modo: 'simulado' }) })),
    notas: await subir(criarServicoNotas(await repoNotas(), { localizar: cliente.localizar })),
    frequencia: await subir(criarServicoFrequencia(await repoFrequencia())),
    agenda: await subir(criarServicoAgenda(await repoAgenda(), { adaptadorAgenda: criarAdaptadorGoogleAgenda({ modo: 'simulado' }) })),
    semestre: await subir(criarServicoSemestre(await repoSemestre(), { localizar: cliente.localizar })),
  };
  for (const [nome, url] of Object.entries(urls)) cancelamentos.push(await cliente.registrar({ nome, url }));
  gateway = await subir(criarGateway({ discoveryUrl: discovery }));

  await chamar('POST', '/api/autenticacao/contas', { nome: 'Ana', email: 'ana@focca.dev', senha: 'segredo123' }, { autenticar: false });
  const login = await chamar('POST', '/api/autenticacao/sessoes', { email: 'ana@focca.dev', senha: 'segredo123' }, { autenticar: false });
  token = login.corpo.token;
  eu = login.corpo.usuario.id;
});

after(async () => {
  for (const cancelar of cancelamentos) await cancelar();
  for (const s of servidores) s.close();
});

// ---------- Discovery e gateway ----------

test('Discovery registra e retorna os cinco serviços', async () => {
  const { corpo } = await chamar('GET', '/saude');
  assert.equal(corpo.discovery, 'ok');
  assert.deepEqual(Object.keys(corpo.servicos).sort(), ['agenda', 'autenticacao', 'frequencia', 'notas', 'semestre']);
  assert.equal((await fetch(`${discovery}/servicos/inexistente`)).status, 404);
});

test('gateway exige login e só libera os dados do próprio estudante', async () => {
  assert.equal((await chamar('GET', `/api/notas/estudantes/${eu}/notas`, null, { autenticar: false })).status, 401);
  assert.equal((await chamar('GET', `/api/notas/estudantes/${eu}/notas`, null, { comToken: 'token-falso' })).status, 401);
  assert.equal((await chamar('GET', '/api/notas/estudantes/outra-pessoa/notas')).status, 403);
  assert.equal((await chamar('GET', `/api/notas/estudantes/${eu}/notas`)).status, 200);
});

// ---------- Autenticação ----------

test('autenticação: e-mail repetido, senha errada e validação', async () => {
  assert.equal((await chamar('POST', '/api/autenticacao/contas', { nome: 'Ana', email: 'ana@focca.dev', senha: 'outra123' }, { autenticar: false })).status, 409);
  assert.equal((await chamar('POST', '/api/autenticacao/sessoes', { email: 'ana@focca.dev', senha: 'errada' }, { autenticar: false })).status, 401);
  assert.equal((await chamar('POST', '/api/autenticacao/contas', { nome: 'X', email: 'nao-e-email', senha: '123' }, { autenticar: false })).status, 400);
});

test('autenticação: entrar com Google (adaptador simulado) e encerrar sessão', async () => {
  const google = await chamar('POST', '/api/autenticacao/sessoes/google', { idToken: 'simulado:bia@gmail.com:Bia' }, { autenticar: false });
  assert.equal(google.status, 201);
  assert.equal(google.corpo.usuario.provedor, 'google');
  const tokenBia = google.corpo.token;
  assert.equal((await chamar('GET', '/api/autenticacao/sessoes/atual', null, { comToken: tokenBia })).status, 200);
  assert.equal((await chamar('DELETE', '/api/autenticacao/sessoes/atual', null, { comToken: tokenBia })).status, 204);
  assert.equal((await chamar('GET', '/api/autenticacao/sessoes/atual', null, { comToken: tokenBia })).status, 401);
});

// ---------- Semestre e Matriz Curricular ----------

let apsoo;
test('semestre: usar matriz base, configurar semestre e cadastrar na Frequência via Discovery', async () => {
  const base = await chamar('POST', `/api/semestre/estudantes/${eu}/matriz/base`);
  assert.equal(base.status, 201);
  assert.equal(base.corpo.total, 49);
  const matriz = await chamar('GET', `/api/semestre/estudantes/${eu}/matriz`);
  apsoo = matriz.corpo.disciplinas.find(d => d.nome === 'Engenharia de Software');
  const redes = matriz.corpo.disciplinas.find(d => d.nome === 'Redes de Computadores');
  const config = await chamar('PUT', `/api/semestre/estudantes/${eu}/semestre`, { rotulo: '2026.2', disciplinas: [apsoo.id, redes.id] });
  assert.equal(config.status, 200);
  assert.equal(config.corpo.frequencia.cadastradas, 2);
  const freq = await chamar('GET', `/api/frequencia/estudantes/${eu}/disciplinas/${apsoo.id}/frequencia`);
  assert.equal(freq.corpo.resumo.limite, 15); // 25% de 60 h, cadastrado pelo Serviço de Semestre
  const atual = await chamar('GET', `/api/semestre/estudantes/${eu}/semestre`);
  assert.equal(atual.corpo.disciplinas.length, 2);
});

test('semestre: importar matriz e marcar disciplina aprovada', async () => {
  const imp = await chamar('POST', `/api/semestre/estudantes/${eu}/matriz/importacao`, { disciplinas: [{ nome: 'Cálculo I', periodo: 1, cargaHoraria: 60 }, { nome: 'Física', periodo: 1, cargaHoraria: 60 }] });
  assert.equal(imp.status, 201);
  const matriz = await chamar('GET', `/api/semestre/estudantes/${eu}/matriz`);
  const calculo = matriz.corpo.disciplinas[0];
  const pat = await chamar('PATCH', `/api/semestre/estudantes/${eu}/disciplinas/${calculo.id}`, { status: 'aprovada' });
  assert.equal(pat.corpo.status, 'aprovada');
  const depois = await chamar('GET', `/api/semestre/estudantes/${eu}/matriz`);
  assert.equal(depois.corpo.progresso.percentual, 50);
  assert.equal((await chamar('POST', `/api/semestre/estudantes/${eu}/matriz/importacao`, { disciplinas: [{ nome: '' }] })).status, 400);
});

// ---------- Notas e Frequência ----------

test('notas: lançar, consultar, listar e remover pelo gateway', async () => {
  let r = await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/apsoo/notas`, { va1: 5, va2: 6 });
  assert.equal(r.corpo.situacao.etapa, 'precisa-va3');
  assert.equal(r.atendente.includes('localhost'), true);
  r = await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/apsoo/notas`, { va1: 5, va2: 6, va3: 9 });
  assert.equal(r.corpo.situacao.etapa, 'aprovado-va3');
  r = await chamar('GET', `/api/notas/estudantes/${eu}/notas`);
  assert.equal(r.corpo.disciplinas.length, 1);
  assert.equal((await chamar('DELETE', `/api/notas/estudantes/${eu}/disciplinas/apsoo/notas`)).status, 204);
  assert.equal((await chamar('GET', `/api/notas/estudantes/${eu}/disciplinas/apsoo/notas`)).status, 404);
});

test('notas: validação recusa nota fora de 0 a 10 e final sem VA3', async () => {
  const r = await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/x/notas`, { va1: 11, va2: 5 });
  assert.equal(r.status, 400);
  assert.match(r.corpo.detalhes[0], /va1/);
  assert.equal((await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/x/notas`, { va1: 3, va2: 5, final: 7 })).status, 400);
});

test('notas: simulação de situação não grava nada', async () => {
  const r = await chamar('POST', '/api/notas/situacao', { va1: 3, va2: 4, va3: 5, final: 6 });
  assert.equal(r.corpo.etapa, 'aprovado-final');
});

test('frequência: cadastrar disciplina, registrar e remover faltas, validar data', async () => {
  assert.equal((await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/calculo/faltas`, { data: '2026-11-03' })).status, 404);
  await chamar('PUT', `/api/frequencia/estudantes/${eu}/disciplinas/calculo`, { cargaHoraria: 60 });
  let r = await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/calculo/faltas`, { data: '2026-11-03', quantidade: 2 });
  assert.equal(r.status, 201);
  const idFalta = r.corpo.falta.id;
  r = await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/calculo/faltas`, { data: '2026-11-05', quantidade: 8 });
  assert.equal(r.corpo.resumo.nivel, 'atencao');
  assert.equal((await chamar('DELETE', `/api/frequencia/estudantes/${eu}/faltas/${idFalta}`)).status, 204);
  assert.equal((await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/calculo/faltas`, { data: '03/11/2026' })).status, 400);
});

test('Notas consulta a Frequência pelo Discovery: reprovado por falta vence a nota', async () => {
  await chamar('PUT', `/api/frequencia/estudantes/${eu}/disciplinas/bd`, { cargaHoraria: 4 }); // limite: 1 falta
  await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/bd/faltas`, { data: '2026-11-03', quantidade: 2 });
  await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/bd/notas`, { va1: 8, va2: 9 });
  const r = await chamar('GET', `/api/notas/estudantes/${eu}/disciplinas/bd/notas`);
  assert.equal(r.corpo.situacao.etapa, 'aprovado');
  assert.equal(r.corpo.frequencia.resumo.nivel, 'reprovado-por-falta');
  assert.equal(r.corpo.situacaoFinal, 'reprovado-por-falta');
});

// ---------- Agenda Acadêmica ----------

test('agenda: planejar, concluir, sincronizar (adaptador simulado) e remover atividade', async () => {
  let r = await chamar('POST', `/api/agenda/estudantes/${eu}/atividades`, { titulo: 'Entrega 3 de APSOO', disciplina: 'Engenharia de Software', tipo: 'trabalho', data: '2026-11-25', hora: '23:59' });
  assert.equal(r.status, 201);
  const id = r.corpo.id;
  assert.equal((await chamar('POST', `/api/agenda/estudantes/${eu}/atividades`, { titulo: 'X', tipo: 'festa', data: '2026-11-25' })).status, 400);
  r = await chamar('POST', `/api/agenda/estudantes/${eu}/atividades/${id}/sincronizar`, {});
  assert.equal(r.corpo.sincronizacao.modo, 'simulado');
  assert.match(r.corpo.atividade.eventoExternoId, /^simulado-/);
  r = await chamar('GET', `/api/agenda/estudantes/${eu}/atividades?pendentes=true`);
  assert.equal(r.corpo.atividades.length, 1);
  await chamar('PATCH', `/api/agenda/estudantes/${eu}/atividades/${id}`, { concluida: true });
  r = await chamar('GET', `/api/agenda/estudantes/${eu}/atividades?pendentes=true`);
  assert.equal(r.corpo.atividades.length, 0);
  assert.equal((await chamar('DELETE', `/api/agenda/estudantes/${eu}/atividades/${id}`)).status, 204);
});

// ---------- Fachada e falhas ----------

test('gateway como fachada: resumo junta semestre, notas, frequência e agenda', async () => {
  const r = await chamar('GET', `/api/estudantes/${eu}/resumo`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.estudante.email, 'ana@focca.dev');
  for (const parte of ['semestre', 'notas', 'frequencia', 'agenda']) assert.equal(r.corpo[parte].disponivel, true, parte);
});

test('gateway: prefixo desconhecido dá 404 e serviço fora do ar dá 503', async () => {
  assert.equal((await chamar('GET', '/api/biblioteca/x')).status, 404);
  const lista = await (await fetch(`${discovery}/servicos`)).json();
  await fetch(`${discovery}/servicos/notas?url=${encodeURIComponent(lista.notas[0])}`, { method: 'DELETE' });
  assert.equal((await chamar('GET', `/api/notas/estudantes/${eu}/notas`)).status, 503);
});
