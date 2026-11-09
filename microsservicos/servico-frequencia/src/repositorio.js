// RepositorioFrequencia: base de dados própria do Serviço de Frequência (SQLite).
// Nenhum outro serviço acessa este arquivo (database per service).
import { DatabaseSync } from 'node:sqlite';

export function abrirRepositorio(caminho = ':memory:') {
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

  const disciplinaObj = l => l && ({
    estudanteId: l.estudante_id, disciplinaId: l.disciplina_id,
    cargaHoraria: l.carga_horaria, temChamada: l.tem_chamada === 1,
  });
  const faltaObj = l => ({ id: l.id, data: l.data, quantidade: l.quantidade });

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
    buscarFalta: db.prepare('SELECT * FROM faltas WHERE id = ? AND estudante_id = ?'),
    removerFalta: db.prepare('DELETE FROM faltas WHERE id = ? AND estudante_id = ?'),
  };

  return {
    salvarDisciplina({ estudanteId, disciplinaId, cargaHoraria, temChamada }) {
      q.salvarDisciplina.run(estudanteId, disciplinaId, cargaHoraria, temChamada ? 1 : 0);
      return disciplinaObj(q.buscarDisciplina.get(estudanteId, disciplinaId));
    },
    buscarDisciplina: (e, d) => disciplinaObj(q.buscarDisciplina.get(e, d)) ?? null,
    listarDisciplinas: e => q.listarDisciplinas.all(e).map(disciplinaObj),
    removerDisciplina: (e, d) => q.removerDisciplina.run(e, d).changes > 0,
    registrarFalta({ estudanteId, disciplinaId, data, quantidade }) {
      const { lastInsertRowid } = q.inserirFalta.run(estudanteId, disciplinaId, data, quantidade);
      return { id: Number(lastInsertRowid), data, quantidade };
    },
    listarFaltas: (e, d) => q.listarFaltas.all(e, d).map(faltaObj),
    buscarFalta: (id, e) => {
      const l = q.buscarFalta.get(id, e);
      return l ? { ...faltaObj(l), disciplinaId: l.disciplina_id } : null;
    },
    removerFalta: (id, e) => q.removerFalta.run(id, e).changes > 0,
    fechar: () => db.close(),
  };
}
