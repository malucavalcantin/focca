// API Gateway Focca: implementa a interface IApiGateway e é a FACHADA do sistema.
// Rotas feitas com Express; o encaminhamento usa a biblioteca http-proxy-middleware.
//
//   /api/autenticacao/...  -> Serviço de Autenticação (público: criar conta, entrar)
//   /api/notas/...         -> Serviço de Notas
//   /api/frequencia/...    -> Serviço de Frequência
//   /api/agenda/...        -> Serviço de Agenda Acadêmica
//   /api/semestre/...      -> Serviço de Semestre e Matriz Curricular
//   /api/estudantes/:id/resumo -> fachada que junta os quatro serviços de domínio
//
// Fora da autenticação, toda chamada precisa de "Authorization: Bearer <token>".
// O gateway confere o token no Serviço de Autenticação e só deixa o estudante
// acessar os próprios dados (/estudantes/<id do token>/...).
// Nenhum endereço é fixo: a cada chamada o gateway pergunta ao Discovery.
// O CORS (corsDoGateway) deixa a interface web do Focca chamar o gateway pelo navegador.
import http from 'node:http';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { criarClienteDiscovery } from './discovery-cliente.js';

/** Prefixo público na URL -> nome do serviço registrado no Discovery. */
export const ROTAS = { autenticacao: 'autenticacao', notas: 'notas', frequencia: 'frequencia', agenda: 'agenda', semestre: 'semestre' };
const PUBLICAS = new Set(['autenticacao']);

/**
 * CORS: libera o navegador para chamar o gateway a partir da interface do Focca
 * (public/), que roda em outra origem (ex.: http://localhost:5500).
 * `origens` vem de CORS_ORIGENS (lista separada por vírgula); "*" libera todas.
 * O login usa token no cabeçalho Authorization (sem cookies), então "*" é seguro.
 */
export function corsDoGateway(origens = '*') {
  const lista = String(origens).split(',').map(o => o.trim()).filter(Boolean);
  const todas = lista.includes('*');
  return (req, res, next) => {
    const origem = req.get('origin');
    if (origem && (todas || lista.includes(origem))) {
      res.setHeader('Access-Control-Allow-Origin', todas ? '*' : origem);
      if (!todas) res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Expose-Headers', 'X-Servico-Atendente');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    // Pré-voo (preflight) do navegador: responde aqui, antes do login e do encaminhamento.
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

export function criarGateway({ discoveryUrl, corsOrigens = process.env.CORS_ORIGENS ?? '*' }) {
  const { localizar } = criarClienteDiscovery(discoveryUrl);
  const app = express();
  app.use(corsDoGateway(corsOrigens));

  app.get('/saude', async (req, res) => {
    const resp = await fetch(`${discoveryUrl}/servicos`).catch(() => null);
    const servicos = resp?.ok ? await resp.json() : null;
    res.json({ servico: 'gateway', status: 'ok', discovery: servicos ? 'ok' : 'indisponível', servicos });
  });

  // Confere o token no Serviço de Autenticação (localizado pelo Discovery).
  async function exigirLogin(req, res, next) {
    const autorizacao = req.get('authorization');
    if (!autorizacao) return res.status(401).json({ erro: 'Faça login: envie Authorization: Bearer <token>' });
    const instancia = await localizar('autenticacao');
    if (!instancia) return res.status(503).json({ erro: 'Serviço "autenticacao" indisponível no momento' });
    try {
      const resp = await fetch(`${instancia}/sessoes/atual`, { headers: { Authorization: autorizacao }, signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada' });
      req.usuario = (await resp.json()).usuario;
    } catch {
      return res.status(503).json({ erro: 'Serviço "autenticacao" indisponível no momento' });
    }
    // Cada estudante só acessa os próprios dados.
    const alvo = req.originalUrl.match(/\/estudantes\/([^/?]+)/)?.[1];
    if (alvo && decodeURIComponent(alvo) !== req.usuario.id) return res.status(403).json({ erro: 'Acesso permitido só aos dados do próprio estudante' });
    next();
  }

  // Fachada: uma chamada do cliente vira uma chamada a cada serviço de domínio,
  // todos localizados pelo Discovery. Um serviço fora do ar não derruba os outros.
  app.get('/api/estudantes/:estudanteId/resumo', exigirLogin, async (req, res) => {
    const id = encodeURIComponent(req.params.estudanteId);
    const consultar = async (nome, caminho) => {
      const instancia = await localizar(nome);
      if (!instancia) return { disponivel: false };
      try {
        const resp = await fetch(`${instancia}${caminho}`, { signal: AbortSignal.timeout(3000) });
        return { disponivel: true, atendidoPor: instancia, status: resp.status, dados: await resp.json() };
      } catch {
        return { disponivel: false };
      }
    };
    const [semestre, notas, frequencia, agenda] = await Promise.all([
      consultar('semestre', `/estudantes/${id}/semestre`),
      consultar('notas', `/estudantes/${id}/notas`),
      consultar('frequencia', `/estudantes/${id}/frequencia`),
      consultar('agenda', `/estudantes/${id}/atividades?pendentes=true`),
    ]);
    res.json({ estudante: req.usuario, semestre, notas, frequencia, agenda });
  });

  // Encaminhamento: localiza a instância no Discovery e repassa a chamada.
  const encaminhar = createProxyMiddleware({
    target: 'http://localhost', // substituído a cada chamada pelo endereço vindo do Discovery
    router: req => req.alvo,
    changeOrigin: true,
    on: {
      error: (erro, req, res) => {
        console.error('[gateway] falha ao encaminhar:', erro.message);
        if (!res.headersSent) res.writeHead?.(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ erro: 'Falha ao encaminhar a requisição ao serviço' }));
      },
    },
  });

  for (const [publico, nome] of Object.entries(ROTAS)) {
    const etapas = PUBLICAS.has(publico) ? [] : [exigirLogin];
    app.use(`/api/${publico}`, ...etapas, async (req, res, next) => {
      const instancia = await localizar(nome);
      if (!instancia) return res.status(503).json({ erro: `Serviço "${nome}" indisponível no momento` });
      req.alvo = instancia;
      res.setHeader('X-Servico-Atendente', instancia);
      next();
    }, encaminhar);
  }

  app.use((req, res) => res.status(404).json({ erro: `Rota não encontrada. Prefixos: ${Object.keys(ROTAS).map(r => `/api/${r}`).join(', ')}, /api/estudantes/{id}/resumo` }));

  return http.createServer(app);
}
