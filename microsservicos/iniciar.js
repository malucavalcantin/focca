// Sobe todos os componentes, cada um em seu próprio processo:
// Serviço de Descoberta, Serviço de Notas, Serviço de Frequência e API Gateway.
// Ctrl+C encerra todos.
import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';

const componentes = [
  ['descoberta', 'descoberta/src/index.js'],
  ['notas', 'servico-notas/src/index.js'],
  ['frequencia', 'servico-frequencia/src/index.js'],
  ['gateway', 'gateway/src/index.js'],
];

const processos = [];
for (const [nome, arquivo] of componentes) {
  // Só o gateway usa a porta pública (PORT); os demais ficam nas portas internas padrão.
  const env = { ...process.env };
  if (nome !== 'gateway') delete env.PORT;
  const filho = spawn(process.execPath, [arquivo], { stdio: 'inherit', env });
  filho.on('exit', codigo => { if (codigo) console.error(`[${nome}] terminou com código ${codigo}`); });
  processos.push(filho);
  if (nome === 'descoberta') await esperar(500); // a descoberta precisa estar no ar antes dos registros
}

const encerrar = () => {
  for (const p of processos) p.kill();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

await esperar(1000);
console.log(`\nTudo no ar. Gateway: http://localhost:${process.env.PORT ?? 8080}  (Ctrl+C para encerrar)\n`);
