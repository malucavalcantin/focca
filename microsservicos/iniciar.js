// Sobe todos os componentes sem Docker, cada um em seu próprio processo e
// a partir da sua própria pasta: Discovery, Serviço de Notas, Serviço de
// Frequência e API Gateway. Ctrl+C encerra todos. Antes: `npm install`.
import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';

const componentes = ['discovery', 'servico-notas', 'servico-frequencia', 'gateway'];

const processos = [];
for (const pasta of componentes) {
  // Só o gateway usa a porta pública (PORT); os demais ficam nas portas internas padrão.
  const env = { ...process.env };
  if (pasta !== 'gateway') delete env.PORT;
  const filho = spawn(process.execPath, ['src/index.js'], { cwd: pasta, stdio: 'inherit', env });
  filho.on('exit', codigo => { if (codigo) console.error(`[${pasta}] terminou com código ${codigo}`); });
  processos.push(filho);
  if (pasta === 'discovery') await esperar(500); // o Discovery precisa estar no ar antes dos registros
}

const encerrar = () => {
  for (const p of processos) p.kill();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

await esperar(1000);
console.log(`\nTudo no ar. Gateway: http://localhost:${process.env.PORT ?? 8080}  (Ctrl+C para encerrar)\n`);
