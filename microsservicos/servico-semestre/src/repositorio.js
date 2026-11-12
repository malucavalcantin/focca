// RepositorioPerfilAcademico e RepositorioDisciplina: matriz curricular e
// semestre atual de cada estudante, no banco próprio do Serviço de Semestre.
import { randomUUID } from 'node:crypto';
import { abrirBanco } from './banco.js';

const disciplinaObj = l => l && ({
  id: l.id, nome: l.nome, periodo: Number(l.periodo), cargaHoraria: Number(l.carga_horaria),
  tipo: l.tipo, status: l.status, ordem: Number(l.ordem),
});

export async function abrirRepositorio(opcoes) {
  const banco = await abrirBanco(opcoes);
  await banco.exec(`
    CREATE TABLE IF NOT EXISTS disciplinas (
      id            TEXT PRIMARY KEY,
      estudante_id  TEXT NOT NULL,
      nome          TEXT NOT NULL,
      periodo       INTEGER NOT NULL,
      carga_horaria INTEGER NOT NULL,
      tipo          TEXT NOT NULL,
      status        TEXT NOT NULL,
      ordem         INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS semestres (
      estudante_id  TEXT PRIMARY KEY,
      rotulo        TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );`);

  return {
    tipo: banco.tipo,
    /** Substitui a matriz inteira do estudante. */
    async substituirMatriz(estudanteId, disciplinas) {
      await banco.executar('DELETE FROM disciplinas WHERE estudante_id = $1', [estudanteId]);
      await banco.executar('DELETE FROM semestres WHERE estudante_id = $1', [estudanteId]);
      let ordem = 0;
      for (const d of disciplinas) {
        await banco.executar(`INSERT INTO disciplinas (id, estudante_id, nome, periodo, carga_horaria, tipo, status, ordem)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [randomUUID(), estudanteId, d.nome, d.periodo, d.cargaHoraria, d.tipo, d.status ?? 'pendente', ++ordem]);
      }
    },
    listar: async estudanteId =>
      (await banco.consultar('SELECT * FROM disciplinas WHERE estudante_id = $1 ORDER BY periodo, ordem', [estudanteId])).map(disciplinaObj),
    buscar: async (estudanteId, id) =>
      disciplinaObj((await banco.consultar('SELECT * FROM disciplinas WHERE estudante_id = $1 AND id = $2', [estudanteId, id]))[0]) ?? null,
    alterarStatus: async (estudanteId, id, status) =>
      (await banco.executar('UPDATE disciplinas SET status = $1 WHERE estudante_id = $2 AND id = $3', [status, estudanteId, id])).alteradas > 0,
    async configurarSemestre(estudanteId, rotulo, idsAtuais) {
      await banco.executar("UPDATE disciplinas SET status = 'pendente' WHERE estudante_id = $1 AND status = 'cursando'", [estudanteId]);
      for (const id of idsAtuais) {
        await banco.executar("UPDATE disciplinas SET status = 'cursando' WHERE estudante_id = $1 AND id = $2", [estudanteId, id]);
      }
      await banco.executar('DELETE FROM semestres WHERE estudante_id = $1', [estudanteId]);
      await banco.executar('INSERT INTO semestres (estudante_id, rotulo, atualizado_em) VALUES ($1, $2, $3)', [estudanteId, rotulo, new Date().toISOString()]);
    },
    buscarSemestre: async estudanteId =>
      (await banco.consultar('SELECT rotulo, atualizado_em FROM semestres WHERE estudante_id = $1', [estudanteId]))[0] ?? null,
    fechar: () => banco.fechar(),
  };
}
