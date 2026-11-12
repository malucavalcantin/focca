// API Gateway Focca: implementa a interface IApiGateway e é a FACHADA do sistema.
// Rotas feitas com Express; o encaminhamento usa a biblioteca http-proxy-middleware.
//
// - /api/notas/...       -> Serviço de Notas
// - /api/frequencia/...  -> Serviço de Frequência
// - /api/estudantes/:id/resumo -> fachada que junta os dois serviços numa resposta
//
// O gateway não conhece nenhum endereço fixo: a cada chamada pergunta ao
// Discovery onde está uma instância ativa do serviço.
import http from 'node:http';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { criarClienteDiscovery } from './discovery-cliente.js';

/** Prefixo público na URL -> nome do serviço registrado no Discovery. */
export const ROTAS = { notas: 'notas', frequencia: 'frequencia' };

export function criarGateway({ discoveryUrl }) {
  const { localizar } = criarClienteDiscovery(discoveryUrl);
  const app = express();

  app.get('/saude', async (req, res) => {
    const resp = await fetch(`${discoveryUrl}/servicos`).catch(() => null);
    const servicos = resp?.ok ? await resp.json() : null;
    res.json({ servico: 'gateway', status: 'ok', discovery: servicos ? 'ok' : 'indisponível', servicos });
  });

  // Fachada: uma chamada do cliente vira duas chamadas internas, uma para cada
  // serviço, ambos localizados pelo Discovery. Se um estiver fora do ar, o outro
  // responde normalmente.
  app.get('/api/estudantes/:estudanteId/resumo', async (req, res) => {
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
    const [notas, frequencia] = await Promise.all([
      consultar('notas', `/estudantes/${id}/notas`),
      consultar('frequencia', `/estudantes/${id}/frequencia`),
    ]);
    res.json({ estudanteId: req.params.estudanteId, notas, frequencia });
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
    app.use(`/api/${publico}`, async (req, res, next) => {
      const instancia = await localizar(nome);
      if (!instancia) return res.status(503).json({ erro: `Serviço "${nome}" indisponível no momento` });
      req.alvo = instancia;
      res.setHeader('X-Servico-Atendente', instancia);
      next();
    }, encaminhar);
  }

  app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada. Use /api/notas/..., /api/frequencia/... ou /api/estudantes/{id}/resumo' }));

  return http.createServer(app);
}
