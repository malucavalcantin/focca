// Ponto de entrada do Serviço de Notas.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirRepositorio } from './repositorio.js';
import { criarServicoNotas } from './app.js';
import { registrarNaDescoberta } from '../../compartilhado/registro.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const porta = Number(process.env.PORTA ?? 3001);
const host = process.env.HOST ?? 'localhost';
const caminhoBd = process.env.BD ?? join(raiz, 'dados', 'notas.db');
const descobertaUrl = process.env.DESCOBERTA_URL ?? 'http://localhost:3000';

if (caminhoBd !== ':memory:') mkdirSync(dirname(caminhoBd), { recursive: true });
const repositorio = abrirRepositorio(caminhoBd);
const servidor = criarServicoNotas(repositorio);

servidor.listen(porta, async () => {
  const url = `http://${host}:${porta}`;
  console.log(`[notas] ouvindo em ${url} (BD: ${caminhoBd})`);
  const cancelarRegistro = await registrarNaDescoberta({ nome: 'notas', url, descobertaUrl });

  const encerrar = async () => {
    await cancelarRegistro();
    servidor.close(() => { repositorio.fechar(); process.exit(0); });
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
});
