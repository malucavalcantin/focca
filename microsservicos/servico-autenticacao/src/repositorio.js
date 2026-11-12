// RepositorioUsuario: usuários e sessões, no banco próprio do Serviço de Autenticação.
import { randomUUID } from 'node:crypto';
import { abrirBanco } from './banco.js';

const usuarioObj = l => l && ({ id: l.id, nome: l.nome, email: l.email, provedor: l.provedor, criadoEm: l.criado_em });

export async function abrirRepositorio(opcoes) {
  const banco = await abrirBanco(opcoes);
  await banco.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id         TEXT PRIMARY KEY,
      nome       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      senha_hash TEXT,
      provedor   TEXT NOT NULL,
      criado_em  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessoes (
      token      TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios (id),
      criado_em  TEXT NOT NULL,
      expira_em  TEXT NOT NULL
    );`);

  return {
    tipo: banco.tipo,
    async criarUsuario({ nome, email, senhaHash = null, provedor }) {
      const id = randomUUID();
      await banco.executar('INSERT INTO usuarios (id, nome, email, senha_hash, provedor, criado_em) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, nome, email, senhaHash, provedor, new Date().toISOString()]);
      return usuarioObj((await banco.consultar('SELECT * FROM usuarios WHERE id = $1', [id]))[0]);
    },
    async buscarPorEmail(email) {
      const linha = (await banco.consultar('SELECT * FROM usuarios WHERE email = $1', [email]))[0];
      return linha ? { ...usuarioObj(linha), senhaHash: linha.senha_hash } : null;
    },
    async criarSessao({ token, usuarioId, expiraEm }) {
      await banco.executar('INSERT INTO sessoes (token, usuario_id, criado_em, expira_em) VALUES ($1, $2, $3, $4)',
        [token, usuarioId, new Date().toISOString(), expiraEm]);
    },
    async buscarSessao(token) {
      const linha = (await banco.consultar(`
        SELECT s.expira_em, u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = $1`, [token]))[0];
      return linha ? { expiraEm: linha.expira_em, usuario: usuarioObj(linha) } : null;
    },
    removerSessao: async token => (await banco.executar('DELETE FROM sessoes WHERE token = $1', [token])).alteradas > 0,
    fechar: () => banco.fechar(),
  };
}
