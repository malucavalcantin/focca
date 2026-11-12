// Ponto de entrada do Serviço de Agenda Acadêmica.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as esperar } from 'node:timers/promises';
import { abrirRepositorio } from './repositorio.js';
import { criarServicoAgenda } from './app.js';
import { criarClienteDiscovery } from './discovery-cliente.js';

const NOME = 'agenda';
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const porta = Number(process.env.PORTA ?? 3004);
const host = process.env.HOST ?? 'localhost';
const databaseUrl = process.env.DATABASE_URL; // PostgreSQL exclusivo do serviço (Docker)
const caminhoSqlite = process.env.BD ?? join(raiz, 'dados', `${NOME}.db`);
const discovery = criarClienteDiscovery(process.env.DISCOVERY_URL ?? 'http://localhost:3000');

async function conectar() {
  if (!databaseUrl && caminhoSqlite !== ':memory:') mkdirSync(dirname(caminhoSqlite), { recursive: true });
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await abrirRepositorio({ databaseUrl, caminhoSqlite });
    } catch (erro) {
      if (!databaseUrl || tentativa >= 15) throw erro;
      console.warn(`[${NOME}] banco ainda indisponível (${erro.message}), nova tentativa em 2 s`);
      await esperar(2000);
    }
  }
}

const repositorio = await conectar();
const servidor = criarServicoAgenda(repositorio);

servidor.listen(porta, async () => {
  const url = `http://${host}:${porta}`;
  console.log(`[${NOME}] ouvindo em ${url} (banco: ${databaseUrl ? `PostgreSQL db-${NOME}` : caminhoSqlite})`);
  const cancelarRegistro = await discovery.registrar({ nome: NOME, url });
  const encerrar = async () => {
    await cancelarRegistro();
    servidor.close(async () => { await repositorio.fechar(); process.exit(0); });
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
});
