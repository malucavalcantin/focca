// RepositorioAvaliacao: banco de dados próprio do Serviço de Notas.
// Nenhum outro serviço acessa este banco (database per service).
//
// Com DATABASE_URL definida (Docker), usa o servidor PostgreSQL exclusivo do
// serviço (contêiner db-notas). Sem ela (desenvolvimento e testes), usa um
// arquivo SQLite local do próprio serviço. As duas versões têm a mesma interface.
import { DatabaseSync } from 'node:sqlite';

const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS avaliacoes (
    estudante_id  TEXT NOT NULL,
    disciplina_id TEXT NOT NULL,
    va1   DOUBLE PRECISION,
    va2   DOUBLE PRECISION,
    va3   DOUBLE PRECISION,
    final DOUBLE PRECISION,
    atualizado_em TEXT NOT NULL,
    PRIMARY KEY (estudante_id, disciplina_id)
  )`;

const paraObjeto = linha => linha && {
  estudanteId: linha.estudante_id,
  disciplinaId: linha.disciplina_id,
  va1: linha.va1, va2: linha.va2, va3: linha.va3, final: linha.final,
  atualizadoEm: linha.atualizado_em,
};

export async function abrirRepositorio({ databaseUrl, caminhoSqlite = ':memory:' } = {}) {
  return databaseUrl ? abrirPostgres(databaseUrl) : abrirSqlite(caminhoSqlite);
}

async function abrirPostgres(databaseUrl) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query(ESQUEMA);
  const um = async (sql, args) => paraObjeto((await pool.query(sql, args)).rows[0]) ?? null;

  return {
    tipo: 'postgresql',
    salvar: ({ estudanteId, disciplinaId, va1, va2, va3, final }) => um(`
      INSERT INTO avaliacoes (estudante_id, disciplina_id, va1, va2, va3, final, atualizado_em)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (estudante_id, disciplina_id) DO UPDATE SET
        va1 = EXCLUDED.va1, va2 = EXCLUDED.va2, va3 = EXCLUDED.va3, final = EXCLUDED.final,
        atualizado_em = EXCLUDED.atualizado_em
      RETURNING *`, [estudanteId, disciplinaId, va1 ?? null, va2 ?? null, va3 ?? null, final ?? null, new Date().toISOString()]),
    buscar: (e, d) => um('SELECT * FROM avaliacoes WHERE estudante_id = $1 AND disciplina_id = $2', [e, d]),
    listar: async e => (await pool.query('SELECT * FROM avaliacoes WHERE estudante_id = $1 ORDER BY disciplina_id', [e])).rows.map(paraObjeto),
    remover: async (e, d) => (await pool.query('DELETE FROM avaliacoes WHERE estudante_id = $1 AND disciplina_id = $2', [e, d])).rowCount > 0,
    fechar: () => pool.end(),
  };
}

function abrirSqlite(caminho) {
  const db = new DatabaseSync(caminho);
  db.exec(ESQUEMA);
  const q = {
    salvar: db.prepare(`
      INSERT INTO avaliacoes (estudante_id, disciplina_id, va1, va2, va3, final, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (estudante_id, disciplina_id) DO UPDATE SET
        va1 = excluded.va1, va2 = excluded.va2, va3 = excluded.va3, final = excluded.final,
        atualizado_em = excluded.atualizado_em`),
    buscar: db.prepare('SELECT * FROM avaliacoes WHERE estudante_id = ? AND disciplina_id = ?'),
    listar: db.prepare('SELECT * FROM avaliacoes WHERE estudante_id = ? ORDER BY disciplina_id'),
    remover: db.prepare('DELETE FROM avaliacoes WHERE estudante_id = ? AND disciplina_id = ?'),
  };

  return {
    tipo: 'sqlite',
    async salvar({ estudanteId, disciplinaId, va1, va2, va3, final }) {
      q.salvar.run(estudanteId, disciplinaId, va1 ?? null, va2 ?? null, va3 ?? null, final ?? null, new Date().toISOString());
      return paraObjeto(q.buscar.get(estudanteId, disciplinaId));
    },
    buscar: async (e, d) => paraObjeto(q.buscar.get(e, d)) ?? null,
    listar: async e => q.listar.all(e).map(paraObjeto),
    remover: async (e, d) => q.remover.run(e, d).changes > 0,
    fechar: async () => db.close(),
  };
}
