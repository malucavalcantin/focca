// Demonstração guiada da Entrega 3 (Focca em microsserviços).
//
// Como usar (no cmd, dentro da pasta microsservicos, com o Docker Desktop aberto):
//   node apresentacao.js
//
// Cada passo mostra o título, espera ENTER, roda o comando de verdade e mostra
// o resultado. Não precisa copiar token nem id. O que falar está no roteiro
// (Roteiro_Defesa_Entrega_3.md), com a mesma numeração de passos.
//
// Sem Docker (plano B): em um cmd rode `set AGENDA_GOOGLE=simulado` e `npm start`;
// em outro cmd, `node apresentacao.js --sem-docker`.

import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { setTimeout as esperar } from 'node:timers/promises';

const SEM_DOCKER = process.argv.includes('--sem-docker');
const GATEWAY = 'http://localhost:8080';
const DISCOVERY = 'http://localhost:3000';
const GH = 'https://github.com/malucavalcantin/focca/blob/main/microsservicos/';

const c = { b: s => `\x1b[1m${s}\x1b[0m`, ok: s => `\x1b[32m${s}\x1b[0m`, er: s => `\x1b[31m${s}\x1b[0m`, az: s => `\x1b[36m${s}\x1b[0m`, am: s => `\x1b[33m${s}\x1b[0m`, ci: s => `\x1b[90m${s}\x1b[0m` };
const teclado = createInterface({ input: process.stdin, output: process.stdout });
const enter = async (txt = 'ENTER para rodar') => { if (process.env.DEMO_AUTO) return; await teclado.question(c.ci(`\n   [${txt}] `)); };

let n = 0;
async function passo(titulo, falar, codigo = []) {
  n++;
  console.log('\n' + c.b('═'.repeat(78)));
  console.log(c.b(`PASSO ${n}. ${titulo}`));
  console.log(c.b('═'.repeat(78)));
  await enter();
}

function sh(cmd, { mostrarCmd = true } = {}) {
  if (mostrarCmd) console.log(c.ci(`\n> ${cmd}`));
  try { execSync(cmd, { stdio: 'inherit' }); return true; } catch { return false; }
}

let token = null;
async function chamar(metodo, caminho, corpo, { base = GATEWAY, comToken = true, mostrar = true, resumir } = {}) {
  console.log(c.ci(`\n> ${metodo} ${base}${caminho}${corpo ? '  ' + JSON.stringify(corpo) : ''}`));
  let resp;
  try {
    resp = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(comToken && token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch (erro) {
    console.log(c.er(`  ✖ sem resposta (${erro.cause?.code ?? erro.name})`));
    return { status: 0 };
  }
  const texto = await resp.text();
  const json = texto ? JSON.parse(texto) : null;
  const cor = resp.status < 400 ? c.ok : c.er;
  const atendente = resp.headers.get('x-servico-atendente');
  console.log(cor(`  ← ${resp.status}`) + (atendente ? c.az(`   X-Servico-Atendente: ${atendente}`) : ''));
  if (json && mostrar) console.log(JSON.stringify(resumir && resp.ok ? resumir(json) : json, null, 2).replace(/^/gm, '  '));
  return { status: resp.status, json };
}

async function aguardarServicos(minimo, limiteS = 180) {
  process.stdout.write(c.ci('  aguardando os serviços se registrarem no Discovery'));
  for (let i = 0; i < limiteS; i += 2) {
    try {
      const lista = await (await fetch(`${DISCOVERY}/servicos`, { signal: AbortSignal.timeout(2000) })).json();
      if (Object.keys(lista).length >= minimo) { console.log(c.ok(' ✔')); return true; }
    } catch { /* ainda subindo */ }
    process.stdout.write('.');
    await esperar(2000);
  }
  console.log(c.er(' ✖ demorou demais'));
  return false;
}

// ---------------------------------------------------------------------------
console.log(c.b('\nFOCCA: DEMONSTRAÇÃO DA ENTREGA 3 (microsserviços)'));
console.log(c.ci('Em cada passo, aperte ENTER para rodar.'));

if (!SEM_DOCKER) {
  if (!sh('docker info --format "Docker OK: {{.ServerVersion}}"', { mostrarCmd: false })) {
    console.log(c.er('\nO Docker Desktop não está rodando. Abra o Docker Desktop, espere "Engine running" e rode de novo.'));
    process.exit(1);
  }

  await passo('Subir o sistema inteiro',
    '"Com um comando sobem 12 contêineres: o Discovery, o gateway, os 5 serviços de domínio (Autenticação, Semestre, Notas, Frequência, Agenda) e um banco PostgreSQL próprio para cada serviço."',
    [['docker-compose.yml', 'docker-compose.yml']]);
  sh('docker compose up --build -d');
  await aguardarServicos(5);

  await passo('Só o gateway e o Discovery têm porta para fora',
    '"Na coluna PORTS, só o Discovery (3000) e o gateway (8080) estão publicados. Os 5 serviços e os 5 bancos não têm porta exposta, ficam só na rede interna do Docker."',
    [['docker-compose.yml, linhas 20–23 (Discovery)', 'docker-compose.yml#L20-L23'], ['docker-compose.yml, linhas 198–203 (gateway)', 'docker-compose.yml#L198-L203']]);
  sh('docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"');
} else {
  await aguardarServicos(5, 20);
}

await passo('O Discovery registrou os 5 serviços',
  '"Cada serviço, ao subir, se registra no Discovery com nome e endereço, e renova a cada 10 segundos. Aqui o Discovery devolve todos os registrados."',
  [['discovery/src/app.js, linhas 27–46 (registrar e retornar)', 'discovery/src/app.js#L27-L46'], ['discovery-cliente.js, linhas 25–41 (o serviço se registra)', 'servico-notas/src/discovery-cliente.js#L25-L41']]);
await chamar('GET', '/servicos', null, { base: DISCOVERY });
await chamar('GET', '/servicos/notas', null, { base: DISCOVERY });

if (!SEM_DOCKER) {
  await passo('Serviços de domínio e bancos não são acessíveis de fora',
    '"Tentamos acessar o serviço de Notas (3001), o de Autenticação (3003) e um banco (5432) direto. Nada responde: a única entrada é o gateway."',
    [['docker-compose.yml, linhas 65–96 (db-notas e notas, sem ports)', 'docker-compose.yml#L65-L96']]);
  await chamar('GET', '/saude', null, { base: 'http://localhost:3001' });
  await chamar('GET', '/saude', null, { base: 'http://localhost:3003' });
  console.log(c.ok('  ✔ Como esperado: os serviços não respondem de fora do Docker.'));
  sh('docker compose port db-notas 5432 || echo   (nenhuma porta publicada para o banco)');
}

await passo('Criar conta e entrar pelo gateway (Serviço de Autenticação)',
  '"Toda chamada passa pelo gateway na porta 8080. Criamos uma conta e fazemos login; o serviço de Autenticação devolve um token, que o script guarda sozinho."',
  [['servico-autenticacao/src/app.js, linhas 44–62', 'servico-autenticacao/src/app.js#L44-L62']]);
const email = `ana.${Date.now()}@focca.dev`;
await chamar('POST', '/api/autenticacao/contas', { nome: 'Ana', email, senha: 'focca2026' });
const login = await chamar('POST', '/api/autenticacao/sessoes', { email, senha: 'focca2026' }, { resumir: j => ({ token: j.token.slice(0, 12) + '…', expiraEm: j.expiraEm, usuario: j.usuario }) });
token = login.json.token;
const eu = login.json.usuario.id;

await passo('Rotas com biblioteca: o gateway encaminha usando o Discovery',
  '"Não escrevemos rota por endpoint. O gateway usa a biblioteca http-proxy-middleware com uma tabela de prefixos. Para cada chamada ele confere o token, pergunta ao Discovery onde está o serviço e encaminha. O cabeçalho X-Servico-Atendente mostra o endereço que veio do Discovery."',
  [['gateway/src/app.js, linha 21 (tabela ROTAS)', 'gateway/src/app.js#L21'], ['gateway/src/app.js, linhas 77–99 (proxy + localizar no Discovery)', 'gateway/src/app.js#L77-L99']]);
await chamar('POST', `/api/semestre/estudantes/${eu}/matriz/base`);
const matriz = await chamar('GET', `/api/semestre/estudantes/${eu}/matriz`, null, { mostrar: false });
const es = matriz.json.disciplinas.find(d => d.nome === 'Engenharia de Software');
const redes = matriz.json.disciplinas.find(d => d.nome === 'Redes de Computadores');
console.log(c.ci(`  (matriz com ${matriz.json.disciplinas.length} disciplinas carregada)`));

await passo('Comunicação entre serviços via Discovery (Semestre → Frequência)',
  '"Ao configurar o semestre, o serviço de Semestre pergunta ao Discovery onde está a Frequência e cadastra lá as disciplinas. Veja o campo frequencia: atendidoPor e cadastradas."',
  [['servico-semestre/src/app.js, linhas 34–50', 'servico-semestre/src/app.js#L34-L50']]);
await chamar('PUT', `/api/semestre/estudantes/${eu}/semestre`, { rotulo: '2026.2', disciplinas: [es.id, redes.id] },
  { resumir: j => ({ rotulo: j.rotulo, disciplinas: j.disciplinas.map(d => d.nome), frequencia: j.frequencia }) });

await passo('Notas consulta a Frequência pelo Discovery',
  '"Lançamos notas boas em Engenharia de Software, mas registramos muitas faltas. Quando consultamos a nota, o serviço de Notas pergunta à Frequência, localizada pelo Discovery, e a situação final vira reprovado por falta."',
  [['servico-notas/src/app.js, linhas 34–46', 'servico-notas/src/app.js#L34-L46']]);
await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/${es.id}/notas`, { va1: 8, va2: 9 }, { mostrar: false });
await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/${es.id}/faltas`, { data: '2026-11-03', quantidade: 16 }, { mostrar: false });
await chamar('GET', `/api/notas/estudantes/${eu}/disciplinas/${es.id}/notas`, null,
  { resumir: j => ({ va1: j.va1, va2: j.va2, situacaoPelasNotas: j.situacao?.etapa, frequencia: { atendidoPor: j.frequencia?.atendidoPor, resumo: j.frequencia?.resumo }, situacaoFinal: j.situacaoFinal }) });

await passo('Agenda Acadêmica (Google Agenda em modo simulado)',
  '"O quinto serviço: planejar uma atividade e sincronizar com o Google Agenda. A sincronização usa um adaptador; aqui está em modo simulado porque não temos credencial do Google."',
  [['servico-agenda/src/app.js, linhas 36–79', 'servico-agenda/src/app.js#L36-L79']]);
const ativ = await chamar('POST', `/api/agenda/estudantes/${eu}/atividades`, { titulo: 'Entrega 3 de APSOO', disciplina: 'Engenharia de Software', tipo: 'trabalho', data: '2026-11-25', hora: '23:59' });
await chamar('POST', `/api/agenda/estudantes/${eu}/atividades/${ativ.json.id}/sincronizar`, {}, { resumir: j => j.sincronizacao });

const resumoCompacto = j => Object.fromEntries(['semestre', 'notas', 'frequencia', 'agenda'].map(k => [k, { disponivel: j[k].disponivel, atendidoPor: j[k].atendidoPor }]));
await passo('Gateway como fachada: uma chamada, quatro serviços',
  '"O cliente faz uma chamada só, e o gateway junta semestre, notas, frequência e agenda, achando cada serviço pelo Discovery."',
  [['gateway/src/app.js, linhas 55–74', 'gateway/src/app.js#L55-L74']]);
await chamar('GET', `/api/estudantes/${eu}/resumo`, null, { resumir: resumoCompacto });

await passo('Segurança no gateway: 401 e 403',
  '"Sem token, o gateway responde 401. Com token, mas pedindo dados de outro estudante, responde 403. Quem confere o token é o serviço de Autenticação."',
  [['gateway/src/app.js, linhas 35–51', 'gateway/src/app.js#L35-L51']]);
await chamar('GET', `/api/notas/estudantes/${eu}/notas`, null, { comToken: false });
await chamar('GET', '/api/notas/estudantes/outro-estudante/notas');
console.log(c.ok('  ✔ Como esperado: 401 sem token e 403 para dados de outro estudante.'));

if (!SEM_DOCKER) {
  await passo('Serviços independentes: derrubar o serviço de Notas',
    '"Paramos o serviço de Notas. Ele sai do Discovery, o gateway responde 503 para Notas, mas o resumo continua funcionando com os outros três serviços."',
    [['gateway/src/app.js, linha 94 (503 se não está no Discovery)', 'gateway/src/app.js#L94']]);
  sh('docker compose stop notas');
  await chamar('GET', '/servicos/notas', null, { base: DISCOVERY });
  await chamar('GET', `/api/notas/estudantes/${eu}/notas`);
  await chamar('GET', `/api/estudantes/${eu}/resumo`, null, { resumir: resumoCompacto });
  console.log(c.ok('  ✔ Como esperado: Notas fora (404 no Discovery, 503 no gateway) e o resto continua de pé.'));

  await passo('Religar o serviço de Notas',
    '"Ligamos de novo: ele se registra sozinho no Discovery e volta a responder, sem mexer em mais nada."');
  sh('docker compose start notas');
  await aguardarServicos(5, 60);
  await chamar('GET', `/api/notas/estudantes/${eu}/notas`, null, { resumir: j => ({ disciplinas: j.disciplinas.length }) });
}

console.log('\n' + c.ok(c.b('Fim da demonstração.')) + c.ci(' Para desligar tudo depois: docker compose down'));
teclado.close();
