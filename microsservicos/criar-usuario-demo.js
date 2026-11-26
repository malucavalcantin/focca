// Cria (ou recria) o usuário de demonstração "Lucas" com dados prontos para
// mostrar na interface do Focca. Tudo passa pelo API Gateway, então cada dado
// vai para o banco do serviço dono dele:
//   conta e senha ......... banco da Autenticação (tabela usuarios)
//   matriz e semestre ...... banco do Semestre (disciplinas, semestres)
//   notas .................. banco do Notas (avaliacoes)
//   faltas ................. banco da Frequência (disciplinas, faltas)
//   atividades ............. banco da Agenda (atividades)
// Uso, com os serviços no ar:  npm run usuario-demo
// Login na interface: lucas@focca.dev / focca2026

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8080';
const USUARIO = { nome: 'Lucas', email: 'lucas@focca.dev', senha: 'focca2026' };
let token = null;

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(GATEWAY + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).catch(() => { throw new Error(`Gateway fora do ar em ${GATEWAY}. Suba os serviços antes (docker compose up -d).`); });
  const texto = await resp.text();
  const dados = texto ? JSON.parse(texto) : null;
  return { status: resp.status, dados };
}
async function exigir(metodo, caminho, corpo) {
  const r = await chamar(metodo, caminho, corpo);
  if (r.status >= 400) throw new Error(`${metodo} ${caminho} -> ${r.status} ${JSON.stringify(r.dados)}`);
  return r.dados;
}

// Datas relativas a hoje, para as atividades ficarem sempre "próximas".
const pad = n => String(n).padStart(2, '0');
const dia = deslocamento => {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 1. Conta (se já existir, só entra).
const conta = await chamar('POST', '/api/autenticacao/contas', USUARIO);
console.log(conta.status === 201 ? '1. Conta do Lucas criada (Serviço de Autenticação)' : '1. Conta do Lucas já existia: refazendo os dados');
const sessao = await exigir('POST', '/api/autenticacao/sessoes', { email: USUARIO.email, senha: USUARIO.senha });
token = sessao.token;
const eu = sessao.usuario.id;

// 2. Matriz base de Computação + histórico (1º e 2º períodos aprovados).
await exigir('POST', `/api/semestre/estudantes/${eu}/matriz/base`);
const { disciplinas } = await exigir('GET', `/api/semestre/estudantes/${eu}/matriz`);
const porNome = nome => disciplinas.find(d => d.nome === nome);
for (const d of disciplinas.filter(x => x.periodo <= 2)) {
  await exigir('PATCH', `/api/semestre/estudantes/${eu}/disciplinas/${d.id}`, { status: 'aprovada' });
}
console.log(`2. Matriz base com ${disciplinas.length} disciplinas; 1º e 2º períodos aprovados (Serviço de Semestre)`);

// 3. Semestre atual 2026.2 com o 3º período. O Semestre cadastra as disciplinas na Frequência.
const atuais = ['Didática', 'Algoritmos e Estruturas de Dados', 'Cálculo NII', 'Circuitos Digitais', 'Programação II'].map(porNome);
const semestre = await exigir('PUT', `/api/semestre/estudantes/${eu}/semestre`, { rotulo: '2026.2', disciplinas: atuais.map(d => d.id) });
console.log(`3. Semestre 2026.2 com ${atuais.length} disciplinas; ${semestre.frequencia.cadastradas} cadastradas na Frequência pelo próprio Semestre`);
const [didatica, aed, calculo, circuitos, prog2] = atuais;

// 4. Notas (Serviço de Notas, regra da UFRPE).
const notas = [
  [aed, { va1: 8, va2: 9 }],               // aprovado por média
  [prog2, { va1: 6, va2: 5 }],             // precisa da 3ª VA (na demonstração, lançar 3ª VA = 8)
  [calculo, { va1: 4, va2: 5, va3: 6 }],   // precisa da Final
  [circuitos, { va1: 8, va2: 9 }],         // notas boas, mas vai reprovar por falta
];
for (const [d, n] of notas) await exigir('PUT', `/api/notas/estudantes/${eu}/disciplinas/${d.id}/notas`, n);
console.log('4. Notas lançadas em 4 disciplinas (Serviço de Notas)');

// 5. Faltas (Serviço de Frequência). Didática: professor não faz chamada.
await exigir('PUT', `/api/frequencia/estudantes/${eu}/disciplinas/${didatica.id}`, { cargaHoraria: didatica.cargaHoraria, temChamada: false });
const faltas = [[circuitos, -20, 4], [circuitos, -13, 4], [circuitos, -6, 4], [circuitos, -3, 4], [calculo, -12, 2], [calculo, -5, 2], [calculo, -2, 2], [prog2, -4, 2]];
for (const [d, quando, quantidade] of faltas) {
  await exigir('POST', `/api/frequencia/estudantes/${eu}/disciplinas/${d.id}/faltas`, { data: dia(quando), quantidade });
}
console.log('5. Faltas registradas: Circuitos Digitais passou do limite (16 de 15) (Serviço de Frequência)');

// 6. Atividades (Serviço de Agenda). Apaga as antigas do Lucas para não duplicar.
const { atividades: antigas } = await exigir('GET', `/api/agenda/estudantes/${eu}/atividades`);
for (const a of antigas) await exigir('DELETE', `/api/agenda/estudantes/${eu}/atividades/${a.id}`);
const novas = [
  { titulo: '2ª prova de Cálculo NII', disciplina: 'Cálculo NII', tipo: 'prova', data: dia(2), hora: '10:00', sincronizar: true },
  { titulo: 'Lista 4 de AED', disciplina: 'Algoritmos e Estruturas de Dados', tipo: 'lista', data: dia(5), hora: '23:59' },
  { titulo: 'Projeto final de Programação II', disciplina: 'Programação II', tipo: 'trabalho', data: dia(9), hora: '18:00' },
  { titulo: 'Seminário de Didática', disciplina: 'Didática', tipo: 'apresentacao', data: dia(-3), hora: '14:00', concluida: true },
];
for (const { sincronizar, concluida, ...a } of novas) {
  const criada = await exigir('POST', `/api/agenda/estudantes/${eu}/atividades`, a);
  if (sincronizar) await exigir('POST', `/api/agenda/estudantes/${eu}/atividades/${criada.id}/sincronizar`, {});
  if (concluida) await exigir('PATCH', `/api/agenda/estudantes/${eu}/atividades/${criada.id}`, { concluida: true });
}
console.log('6. 4 atividades criadas, 1 sincronizada com o Google Agenda simulado (Serviço de Agenda)');

console.log(`\nPronto. Entre na interface (npm run ui -> http://localhost:5500) com ${USUARIO.email} / ${USUARIO.senha}`);
