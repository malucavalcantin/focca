// Acesso ao banco de dados próprio do serviço.
// Com DATABASE_URL (Docker): o servidor PostgreSQL exclusivo do serviço.
// Sem ela (desenvolvimento e testes): um arquivo SQLite local do serviço.
// O SQL é escrito uma vez, com parâmetros $1, $2...; no SQLite eles viram ?.
import { DatabaseSync } from 'node:sqlite';

export async function abrirBanco({ databaseUrl, caminhoSqlite = ':memory:' } = {}) {
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query('SELECT 1');
    return {
      tipo: 'postgresql',
      exec: sql => pool.query(sql),
      consultar: async (sql, args = []) => (await pool.query(sql, args)).rows,
      executar: async (sql, args = []) => ({ alteradas: (await pool.query(sql, args)).rowCount }),
      fechar: () => pool.end(),
    };
  }
  const db = new DatabaseSync(caminhoSqlite);
  const paraSqlite = sql => sql.replace(/\$\d+/g, '?');
  const valor = v => (typeof v === 'boolean' ? (v ? 1 : 0) : v);
  return {
    tipo: 'sqlite',
    exec: async sql => db.exec(sql),
    consultar: async (sql, args = []) => db.prepare(paraSqlite(sql)).all(...args.map(valor)),
    executar: async (sql, args = []) => ({ alteradas: db.prepare(paraSqlite(sql)).run(...args.map(valor)).changes }),
    fechar: async () => db.close(),
  };
}
