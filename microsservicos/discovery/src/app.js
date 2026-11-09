// Discovery: implementa a interface IRegistroServicos.
// Os serviços se registram ao iniciar e renovam o registro a cada 10 s;
// um registro sem renovação por mais de TTL_MS deixa de ser devolvido.
import { criarServidor, ErroHttp } from '../../compartilhado/http.js';
import { validar, obrigatorio } from '../../compartilhado/validacao.js';

export const TTL_MS = 30_000;

export function criarDiscovery({ agora = () => Date.now(), ttlMs = TTL_MS } = {}) {
  /** nome -> Map(url -> último contato em ms) */
  const registros = new Map();

  const vivas = nome => {
    const instancias = registros.get(nome);
    if (!instancias) return [];
    for (const [url, visto] of instancias) if (agora() - visto > ttlMs) instancias.delete(url);
    return [...instancias.keys()];
  };

  return criarServidor({
    'GET /saude': () => ({ servico: 'discovery', status: 'ok' }),

    'POST /servicos': ({ corpo }) => {
      const { nome, url } = corpo;
      validar([obrigatorio(nome, 'nome'), obrigatorio(url, 'url')]);
      try { new URL(url); } catch { throw new ErroHttp(400, 'url inválida'); }
      if (!registros.has(nome)) registros.set(nome, new Map());
      registros.get(nome).set(url, agora());
      return { status: 201, corpo: { nome, url, ttlSegundos: ttlMs / 1000 } };
    },

    'GET /servicos': () => Object.fromEntries([...registros.keys()].map(n => [n, vivas(n)]).filter(([, urls]) => urls.length)),

    'GET /servicos/:nome': ({ params }) => {
      const instancias = vivas(params.nome);
      if (!instancias.length) throw new ErroHttp(404, `Nenhuma instância ativa do serviço "${params.nome}"`);
      return { nome: params.nome, instancias };
    },

    'DELETE /servicos/:nome': ({ params, query }) => {
      registros.get(params.nome)?.delete(query.url);
      return { status: 204, corpo: undefined };
    },
  }, { nome: 'discovery' });
}
