// Roteiro de demonstração: com tudo no ar (npm start), rode `npm run demo`
// em outro terminal. Todas as chamadas passam pelo API Gateway.

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8080';

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(GATEWAY + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  console.log(`\n${metodo} ${caminho}${corpo ? ' ' + JSON.stringify(corpo) : ''}`);
  console.log(`-> ${resp.status} (atendido por ${resp.headers.get('x-servico-atendente') ?? 'gateway'})`);
  if (texto) console.log(JSON.stringify(JSON.parse(texto), null, 2));
}

console.log('== Serviço de Notas ==');
await chamar('PUT', '/api/notas/estudantes/maria/disciplinas/apsoo/notas', { va1: 8, va2: 9 });
await chamar('PUT', '/api/notas/estudantes/maria/disciplinas/calculo1/notas', { va1: 4, va2: 6 });
await chamar('PUT', '/api/notas/estudantes/maria/disciplinas/calculo1/notas', { va1: 4, va2: 6, va3: 7 });
await chamar('POST', '/api/notas/situacao', { va1: 3, va2: 4, va3: 5, final: 6 });
await chamar('GET', '/api/notas/estudantes/maria/notas');
await chamar('PUT', '/api/notas/estudantes/maria/disciplinas/apsoo/notas', { va1: 11 });

console.log('\n== Serviço de Frequência ==');
await chamar('PUT', '/api/frequencia/estudantes/maria/disciplinas/apsoo', { cargaHoraria: 60 });
await chamar('POST', '/api/frequencia/estudantes/maria/disciplinas/apsoo/faltas', { data: '2026-11-03', quantidade: 2 });
await chamar('POST', '/api/frequencia/estudantes/maria/disciplinas/apsoo/faltas', { data: '2026-11-05', quantidade: 6 });
await chamar('GET', '/api/frequencia/estudantes/maria/disciplinas/apsoo/frequencia');

console.log('\n== Gateway e Discovery ==');
await chamar('GET', '/saude');
