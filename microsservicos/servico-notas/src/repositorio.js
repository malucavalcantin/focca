// RepositorioAvaliacao: base de dados própria do Serviço de Notas (SQLite).
// Nenhum outro serviço acessa este arquivo (database per service).
import { DatabaseSync } from 'node:sqlite';

export function abrirRepositorio(caminho = ':memory:') {
  const db = new DatabaseSync(caminho);
  db.exec(`
    CREATE TABLE IF NOT EXISTS avaliacoes (
      estudante_id  TEXT NOT NULL,
      disciplina_id TEXT NOT NULL,
      va1   REAL,
      va2   REAL,
      va3   REAL,
      final REAL,
      atualizado_em TEXT NOT NULL,
      PRIMARY KEY (estudante_id, disciplina_id)
    )
  `);

  const paraObjeto = linha => linha && {
    estudanteId: linha.estudante_id,
    disciplinaId: linha.disciplina_id,
    va1: linha.va1, va2: linha.va2, va3: linha.va3, final: linha.final,
    atualizadoEm: linha.atualizado_em,
  };

  const salvar = db.prepare(`
    INSERT INTO avaliacoes (estudante_id, disciplina_id, va1, va2, va3, final, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (estudante_id, disciplina_id) DO UPDATE SET
      va1 = excluded.va1, va2 = excluded.va2, va3 = excluded.va3, final = excluded.final,
      atualizado_em = excluded.atualizado_em
  `);
  const buscar = db.prepare('SELECT * FROM avaliacoes WHERE estudante_id = ? AND disciplina_id = ?');
  const listar = db.prepare('SELECT * FROM avaliacoes WHERE estudante_id = ? ORDER BY disciplina_id');
  const remover = db.prepare('DELETE FROM avaliacoes WHERE estudante_id = ? AND disciplina_id = ?');

  return {
    salvar({ estudanteId, disciplinaId, va1, va2, va3, final }) {
      salvar.run(estudanteId, disciplinaId, va1 ?? null, va2 ?? null, va3 ?? null, final ?? null, new Date().toISOString());
      return paraObjeto(buscar.get(estudanteId, disciplinaId));
    },
    buscar: (estudanteId, disciplinaId) => paraObjeto(buscar.get(estudanteId, disciplinaId)) ?? null,
    listar: estudanteId => listar.all(estudanteId).map(paraObjeto),
    remover: (estudanteId, disciplinaId) => remover.run(estudanteId, disciplinaId).changes > 0,
    fechar: () => db.close(),
  };
}
