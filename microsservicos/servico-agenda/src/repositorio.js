// RepositorioAtividade: atividades acadêmicas, no banco próprio do Serviço de Agenda Acadêmica.
import { randomUUID } from 'node:crypto';
import { abrirBanco } from './banco.js';

const atividadeObj = l => l && ({
  id: l.id, estudanteId: l.estudante_id, titulo: l.titulo, disciplina: l.disciplina, tipo: l.tipo,
  data: l.data, hora: l.hora, concluida: l.concluida === true || l.concluida === 1,
  eventoExternoId: l.evento_externo_id, criadoEm: l.criado_em,
});

export async function abrirRepositorio(opcoes) {
  const banco = await abrirBanco(opcoes);
  await banco.exec(`
    CREATE TABLE IF NOT EXISTS atividades (
      id                TEXT PRIMARY KEY,
      estudante_id      TEXT NOT NULL,
      titulo            TEXT NOT NULL,
      disciplina        TEXT,
      tipo              TEXT NOT NULL,
      data              TEXT NOT NULL,
      hora              TEXT,
      concluida         BOOLEAN NOT NULL DEFAULT FALSE,
      evento_externo_id TEXT,
      criado_em         TEXT NOT NULL
    );`);

  const buscar = async (estudanteId, id) =>
    atividadeObj((await banco.consultar('SELECT * FROM atividades WHERE estudante_id = $1 AND id = $2', [estudanteId, id]))[0]) ?? null;

  return {
    tipo: banco.tipo,
    async criar({ estudanteId, titulo, disciplina = null, tipo, data, hora = null }) {
      const id = randomUUID();
      await banco.executar(`INSERT INTO atividades (id, estudante_id, titulo, disciplina, tipo, data, hora, concluida, criado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, estudanteId, titulo, disciplina, tipo, data, hora, false, new Date().toISOString()]);
      return buscar(estudanteId, id);
    },
    buscar,
    async listar(estudanteId, { pendentes = false } = {}) {
      const linhas = await banco.consultar(
        `SELECT * FROM atividades WHERE estudante_id = $1 ${pendentes ? 'AND concluida = $2' : ''} ORDER BY data, hora, titulo`,
        pendentes ? [estudanteId, false] : [estudanteId]);
      return linhas.map(atividadeObj);
    },
    async atualizar(estudanteId, id, campos) {
      const atual = await buscar(estudanteId, id);
      if (!atual) return null;
      const novo = { ...atual, ...campos };
      await banco.executar(`UPDATE atividades SET titulo = $1, disciplina = $2, tipo = $3, data = $4, hora = $5, concluida = $6, evento_externo_id = $7
        WHERE estudante_id = $8 AND id = $9`,
        [novo.titulo, novo.disciplina, novo.tipo, novo.data, novo.hora, novo.concluida, novo.eventoExternoId, estudanteId, id]);
      return buscar(estudanteId, id);
    },
    remover: async (estudanteId, id) => (await banco.executar('DELETE FROM atividades WHERE estudante_id = $1 AND id = $2', [estudanteId, id])).alteradas > 0,
    fechar: () => banco.fechar(),
  };
}
