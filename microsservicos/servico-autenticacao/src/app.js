// Serviço de Autenticação: implementa a interface IServicoAutenticacao, com rotas Express.
// Casos de uso: UC01 Autenticar no sistema (estendido por Criar conta e Entrar
// com conta Google) e Encerrar sessão.
// O gateway usa GET /sessoes/atual para validar o token de cada requisição.
import http from 'node:http';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { ErroHttp, validar, texto, email as validarEmail, tratarErros } from './validacao.js';
import { criarAdaptadorGoogle } from './adaptador-google.js';

const scrypt = promisify(scryptCb);
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000; // 8 horas

async function gerarHash(senha) {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, 32);
  return `scrypt:${sal.toString('hex')}:${hash.toString('hex')}`;
}

async function conferirSenha(senha, guardado) {
  const [, salHex, hashHex] = String(guardado ?? '').split(':');
  if (!salHex || !hashHex) return false;
  const hash = await scrypt(senha, Buffer.from(salHex, 'hex'), 32);
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

const tokenDe = req => (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();

export function criarServicoAutenticacao(repositorio, { adaptadorGoogle = criarAdaptadorGoogle() } = {}) {
  async function abrirSessao(usuario) {
    const token = randomBytes(32).toString('hex');
    const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS).toISOString();
    await repositorio.criarSessao({ token, usuarioId: usuario.id, expiraEm });
    return { token, expiraEm, usuario };
  }

  const app = express();
  app.use(express.json());

  app.get('/saude', (req, res) => res.json({ servico: 'autenticacao', status: 'ok', banco: repositorio.tipo, google: adaptadorGoogle.disponivel() }));

  // Criar conta (e-mail e senha).
  app.post('/contas', async (req, res) => {
    const { nome, email, senha } = req.body ?? {};
    validar([texto(nome, 'nome', { max: 100 }), validarEmail(email), texto(senha, 'senha', { max: 200 }),
      typeof senha === 'string' && senha.length < 6 ? 'senha deve ter pelo menos 6 caracteres' : null]);
    const normalizado = email.trim().toLowerCase();
    if (await repositorio.buscarPorEmail(normalizado)) throw new ErroHttp(409, 'Já existe uma conta com este e-mail');
    const usuario = await repositorio.criarUsuario({ nome: nome.trim(), email: normalizado, senhaHash: await gerarHash(senha), provedor: 'senha' });
    res.status(201).json({ usuario });
  });

  // Entrar com e-mail e senha.
  app.post('/sessoes', async (req, res) => {
    const { email, senha } = req.body ?? {};
    validar([validarEmail(email), texto(senha, 'senha', { max: 200 })]);
    const encontrado = await repositorio.buscarPorEmail(email.trim().toLowerCase());
    if (!encontrado || !(await conferirSenha(senha, encontrado.senhaHash))) throw new ErroHttp(401, 'E-mail ou senha incorretos');
    const { senhaHash, ...usuario } = encontrado;
    res.status(201).json(await abrirSessao(usuario));
  });

  // Entrar com conta Google (pelo adaptador PortaAutenticacao).
  app.post('/sessoes/google', async (req, res) => {
    if (!adaptadorGoogle.disponivel()) throw new ErroHttp(501, 'Login com Google não configurado neste ambiente');
    validar([texto(req.body?.idToken, 'idToken', { max: 5000 })]);
    const perfil = await adaptadorGoogle.verificar(req.body.idToken);
    if (!perfil) throw new ErroHttp(401, 'Token do Google inválido');
    const email = perfil.email.toLowerCase();
    const existente = await repositorio.buscarPorEmail(email);
    let usuario;
    if (existente) {
      const { senhaHash, ...dados } = existente;
      usuario = dados;
    } else {
      usuario = await repositorio.criarUsuario({ nome: perfil.nome, email, provedor: 'google' });
    }
    res.status(201).json(await abrirSessao(usuario));
  });

  // Validar a sessão do token enviado (usado pelo gateway).
  app.get('/sessoes/atual', async (req, res) => {
    const token = tokenDe(req);
    const sessao = token && await repositorio.buscarSessao(token);
    if (!sessao || Date.parse(sessao.expiraEm) < Date.now()) throw new ErroHttp(401, 'Sessão inválida ou expirada');
    res.json(sessao);
  });

  // Encerrar sessão.
  app.delete('/sessoes/atual', async (req, res) => {
    const token = tokenDe(req);
    if (!token || !(await repositorio.removerSessao(token))) throw new ErroHttp(401, 'Sessão inválida ou expirada');
    res.status(204).end();
  });

  tratarErros(app, 'autenticacao');
  return http.createServer(app);
}
