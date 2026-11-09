// RepositorioFrequencia: banco de dados próprio do Serviço de Frequência.
// Nenhum outro serviço acessa este banco (database per service).
//
// Com DATABASE_URL definida (Docker), usa o servidor PostgreSQL exclusivo do
// serviço (contêiner db-frequencia). Sem ela (desenvolvimento e testes), usa um
// arquivo SQLite local do próprio serviço. As duas versões têm a mesma interface.
import { DatabaseSync } from 'node:sqlite';

const disciplinaObj = l => l && ({
  estudanteId: l.estudante_id, disciplinaId: l.disciplina_id,
  cargaHoraria: Number(l.carga_horaria), temChamada: l.tem_chamada === true || l.tem_chamada === 1,
});
const faltaObj = l => ({ id: Number(l.id), data: l.data, quantidade: Number(l.quantidade) });

export async function abrirRepositorio({ databaseUrl, caminhoSqlite = ':memory:' } = {}) {
  return databaseUrl ? abrirPostgres(databaseUrl) : abrirSqlite(caminhoSqlite);
}

async function abrirPostgres(databaseUrl) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS disciplinas (
      estudante_id  TEXT NOT NULL,
      disciplina_id TEXT NOT NULL,
      carga_horaria INTEGER NOT NULL,
      tem_chamada   BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (estudante_id, disciplina_id)
    );
    CREATE TABLE IF NOT EXISTS faltas (
      id            SERIAL PRIMARY KEY,
      estudante_id  TEXT NOT NULL,
      disciplina_id TEXT NOT NULL,
      data          TEXT NOT NULL,
      quantidade    INTEGER NOT NULL,
      FOREIGN KEY (estudante_id, disciplina_id)
        REFERENCES disciplinas (estudante_id, disciplina_id) ON DELETE CASCADE
    );`);
  const linhas = async (sql, args) => (await pool.query(sql, args)).rows;

  return {
    tipo: 'postgresql',
    salvarDisciplina: async ({ estudanteId, disciplinaId, cargaHoraria, temChamada }) => disciplinaObj((await linhas(`
      INSERT INTO disciplinas (estudante_id, disciplina_id, carga_horaria, tem_chamada) VALUES ($1, $2, $3, $4)
      ON CONFLICT (estudante_id, disciplina_id) DO UPDATE SET
        carga_horaria = EXCLUDED.carga_horaria, tem_chamada = EXCLUDED.tem_chamada
      RETURNING *`, [estudanteId, disciplinaId, cargaHoraria, temChamada]))[0]),
    buscarDisciplina: async (e, d) => disciplinaObj((await linhas('SELECT * FROM disciplinas WHERE estudante_id = $1 AND disciplina_id = $2', [e, d]))[0]) ?? null,
    listarDisciplinas: async e => (await linhas('SELECT * FROM disciplinas WHERE estudante_id = $1 ORDER BY disciplina_id', [e])).map(disciplinaObj),
    removerDisciplina: async (e, d) => (await pool.query('DELETE FROM disciplinas WHERE estudante_id = $1 AND disciplina_id = $2', [e, d])).rowCount > 0,
    registrarFalta: async ({ estudanteId, disciplinaId, data, quantidade }) => faltaObj((await linhas(
      'INSERT INTO faltas (estudante_id, disciplina_id, data, quantidade) VALUES ($1, $2, $3, $4) RETURNING *',
      [estudanteId, disciplinaId, data, quantidade]))[0]),
    listarFaltas: async (e, d) => (await linhas('SELECT * FROM faltas WHERE estudante_id = $1 AND disciplina_id = $2 ORDER BY data, id', [e, d])).map(faltaObj),
    removerFalta: async (id, e) => (await pool.query('DELETE FROM faltas WHERE id = $1 AND estudante_id = $2', [id, e])).rowCount > 0,
    fechar: () => pool.end(),
  };
}

function abrirSqlite(caminho) {
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS disciplinas (
      estudante_id  TEXT NOT NULL,
      disciplina_id TEXT NOT NULL,
      carga_horaria INTEGER NOT NULL,
      tem_chamada   INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (estudante_id, disciplina_id)
    );
    CREATE TABLE IF NOT EXISTS faltas (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      estudante_id  TEXT NOT NULL,
      disciplina_id TEXT NOT NULL,
      data          TEXT NOT NULL,
      quantidade    INTEGER NOT NULL,
      FOREIGN KEY (estudante_id, disciplina_id)
        REFERENCES disciplinas (estudante_id, disciplina_id) ON DELETE CASCADE
    );
  `);

  const q = {
    salvarDisciplina: db.prepare(`
      INSERT INTO disciplinas (estudante_id, disciplina_id, carga_horaria, tem_chamada) VALUES (?, ?, ?, ?)
      ON CONFLICT (estudante_id, disciplina_id) DO UPDATE SET
        carga_horaria = excluded.carga_horaria, tem_chamada = excluded.tem_chamada`),
    buscarDisciplina: db.prepare('SELECT * FROM disciplinas WHERE estudante_id = ? AND disciplina_id = ?'),
    listarDisciplinas: db.prepare('SELECT * FROM disciplinas WHERE estudante_id = ? ORDER BY disciplina_id'),
    removerDisciplina: db.prepare('DELETE FROM disciplinas WHERE estudante_id = ? AND disciplina_id = ?'),
    inserirFalta: db.prepare('INSERT INTO faltas (estudante_id, disciplina_id, data, quantidade) VALUES (?, ?, ?, ?)'),
    listarFaltas: db.prepare('SELECT * FROM faltas WHERE estudante_id = ? AND disciplina_id = ? ORDER BY data, id'),
    removerFalta: db.prepare('DELETE FROM faltas WHERE id = ? AND estudante_id = ?'),
  };

  return {
    tipo: 'sqlite',
    async salvarDisciplina({ estudanteId, disciplinaId, cargaHoraria, temChamada }) {
      q.salvarDisciplina.run(estudanteId, disciplinaId, cargaHoraria, temChamada ? 1 : 0);
      return disciplinaObj(q.buscarDisciplina.get(estudanteId, disciplinaId));
    },
    buscarDisciplina: async (e, d) => disciplinaObj(q.buscarDisciplina.get(e, d)) ?? null,
    listarDisciplinas: async e => q.listarDisciplinas.all(e).map(disciplinaObj),
    removerDisciplina: async (e, d) => q.removerDisciplina.run(e, d).changes > 0,
    async registrarFalta({ estudanteId, disciplinaId, data, quantidade }) {
      const { lastInsertRowid } = q.inserirFalta.run(estudanteId, disciplinaId, data, quantidade);
      return { id: Number(lastInsertRowid), data, quantidade };
    },
    listarFaltas: async (e, d) => q.listarFaltas.all(e, d).map(faltaObj),
    removerFalta: async (id, e) => q.removerFalta.run(id, e).changes > 0,
    fechar: async () => db.close(),
  };
}
