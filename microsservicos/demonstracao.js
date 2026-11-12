// Roteiro de demonstração: com tudo no ar (docker compose up ou npm start),
// rode `npm run demo` em outro terminal. Todas as chamadas passam pelo API
// Gateway, com login no Serviço de Autenticação.

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8080';
let token = null;

async function chamar(metodo, caminho, corpo, { mostrar = true } = {}) {
  const resp = await fetch(GATEWAY + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  const json = texto ? JSON.parse(texto) : null;
  console.log(`\n${metodo} ${caminho}${corpo ? ' ' + JSON.stringify(corpo) : ''}`);
  console.log(`-> ${resp.status} (atendido por ${resp.headers.get('x-servico-atendente') ?? 'gateway'})`);
  if (json && mostrar) console.log(JSON.stringify(json, null, 2));
  return json;
}

console.log('== Serviço de Autenticação ==');
const email = `maria.${Date.now()}@focca.dev`;
await chamar('POST', '/api/autenticacao/contas', { nome: 'Maria', email, senha: 'focca2026' });
const sessao = await chamar('POST', '/api/autenticacao/sessoes', { email, senha: 'focca2026' }, { mostrar: false });
token = sessao.token;
const eu = sessao.usuario.id;
console.log(`   login ok: estudante ${eu}`);
await chamar('GET', `/api/notas/estudantes/outra-pessoa/notas`); // 403: só os próprios dados

console.log('\n== Serviço de Semestre e Matriz Curricular ==');
await chamar('POST', `/api/semestre/estudantes/${eu}/matriz/base`);
const matriz = await chamar('GET', `/api/semestre/estudantes/${eu}/matriz`, null, { mostrar: false });
const es = matriz.disciplinas.find(d => d.nome === 'Engenharia de Software');
const redes = matriz.disciplinas.find(d => d.nome === 'Redes de Computadores');
await chamar('PUT', `/api/semestre/estudantes/${eu}/semestre`, { rotulo: '2026.2', disciplinas: [es.id, redes.id] });

console.log('\n== Serviço de Notas ==');
await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/${es.id}/notas`, { va1: 8, va2: 9 });
await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/${redes.id}/notas`, { va1: 4, va2: 6, va3: 7 });
await chamar('PUT', `/api/notas/estudantes/${eu}/disciplinas/${es.id}/notas`, { va1: 11 });

console.log('\n== Serviço de Frequência (disciplinas cadastradas pelo Serviço de Semestre) ==');
await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/${es.id}/faltas`, { data: '2026-11-03', quantidade: 2 });
await chamar('POST', `/api/frequencia/estudantes/${eu}/disciplinas/${es.id}/faltas`, { data: '2026-11-05', quantidade: 6 });

console.log('\n== Comunicação entre serviços: Notas consulta Frequência pelo Discovery ==');
await chamar('GET', `/api/notas/estudantes/${eu}/disciplinas/${es.id}/notas`);

console.log('\n== Serviço de Agenda Acadêmica ==');
const atividade = await chamar('POST', `/api/agenda/estudantes/${eu}/atividades`, { titulo: 'Entrega 3 de APSOO', disciplina: 'Engenharia de Software', tipo: 'trabalho', data: '2026-11-25', hora: '23:59' });
await chamar('POST', `/api/agenda/estudantes/${eu}/atividades/${atividade.id}/sincronizar`, {});

console.log('\n== Gateway como fachada: uma chamada, quatro serviços ==');
await chamar('GET', `/api/estudantes/${eu}/resumo`, null, { mostrar: false });
console.log('   (resposta com semestre, notas, frequência e agenda do estudante)');

console.log('\n== Encerrar sessão ==');
await chamar('DELETE', '/api/autenticacao/sessoes/atual');
await chamar('GET', `/api/notas/estudantes/${eu}/notas`); // 401 depois do logout

console.log('\n== Gateway e Discovery ==');
token = null;
await chamar('GET', '/saude');
