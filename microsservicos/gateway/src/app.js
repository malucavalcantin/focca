// API Gateway Focca: implementa a interface IApiGateway.
// O cliente só conhece o gateway. Uma chamada a /api/<serviço>/<caminho> é
// encaminhada para uma instância do serviço, localizada no Serviço de Descoberta.
import http from 'node:http';
import { enviarJson } from '../../compartilhado/http.js';

/** Nomes públicos aceitos na URL -> nome do serviço registrado na descoberta. */
export const ROTAS = { notas: 'notas', frequencia: 'frequencia' };

export function criarGateway({ descobertaUrl }) {
  const proxima = new Map(); // nome -> índice para round-robin

  async function localizar(nome) {
    const resp = await fetch(`${descobertaUrl}/servicos/${encodeURIComponent(nome)}`);
    if (!resp.ok) return null;
    const { instancias } = await resp.json();
    const i = (proxima.get(nome) ?? 0) % instancias.length;
    proxima.set(nome, i + 1);
    return instancias[i];
  }

  function lerBruto(req) {
    return new Promise((resolve, reject) => {
      const partes = [];
      req.on('data', p => partes.push(p));
      req.on('end', () => resolve(Buffer.concat(partes)));
      req.on('error', reject);
    });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/saude') {
        const resp = await fetch(`${descobertaUrl}/servicos`).catch(() => null);
        const servicos = resp?.ok ? await resp.json() : null;
        return enviarJson(res, 200, { servico: 'gateway', status: 'ok', descoberta: servicos ? 'ok' : 'indisponível', servicos });
      }

      const [, prefixo, publico, ...resto] = url.pathname.split('/');
      const nome = ROTAS[publico];
      if (prefixo !== 'api' || !nome) {
        return enviarJson(res, 404, { erro: 'Rota não encontrada. Use /api/notas/... ou /api/frequencia/...' });
      }

      const instancia = await localizar(nome).catch(() => null);
      if (!instancia) return enviarJson(res, 503, { erro: `Serviço "${nome}" indisponível no momento` });

      const corpo = ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : await lerBruto(req);
      const destino = `${instancia}/${resto.join('/')}${url.search}`;
      const resposta = await fetch(destino, {
        method: req.method,
        headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
        body: corpo?.length ? corpo : undefined,
      });

      const texto = Buffer.from(await resposta.arrayBuffer());
      res.writeHead(resposta.status, {
        'Content-Type': resposta.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'X-Servico-Atendente': instancia,
      });
      res.end(texto);
    } catch (erro) {
      console.error('[gateway]', erro);
      enviarJson(res, 502, { erro: 'Falha ao encaminhar a requisição ao serviço' });
    }
  });
}
