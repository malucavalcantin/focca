// Instala as dependências de cada componente, que é um projeto independente
// (cada pasta tem o seu package.json). Roda sozinho depois de `npm install`.
import { execSync } from 'node:child_process';

for (const pasta of ['discovery', 'gateway', 'servico-notas', 'servico-frequencia']) {
  console.log(`\n== ${pasta}`);
  execSync('npm install --no-audit --no-fund', { cwd: pasta, stdio: 'inherit' });
}
