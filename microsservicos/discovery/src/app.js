// Discovery: implementa a interface IRegistroServicos, com rotas Express.
// Cada serviço se registra ao iniciar (POST /servicos) e renova o registro a
// cada 10 s. Quem precisa de um serviço pergunta aqui (GET /servicos/:nome).
// Um registro sem renovação por mais de TTL_MS deixa de ser devolvido.
import http from 'node:http';
import express from 'express';

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

  const app = express();
  app.use(express.json());

  app.get('/saude', (req, res) => res.json({ servico: 'discovery', status: 'ok' }));

  // Registrar (ou renovar) uma instância.
  app.post('/servicos', (req, res) => {
    const { nome, url } = req.body ?? {};
    if (!nome || !url) return res.status(400).json({ erro: 'nome e url são obrigatórios' });
    try { new URL(url); } catch { return res.status(400).json({ erro: 'url inválida' }); }
    if (!registros.has(nome)) registros.set(nome, new Map());
    registros.get(nome).set(url, agora());
    res.status(201).json({ nome, url, ttlSegundos: ttlMs / 1000 });
  });

  // Listar todos os serviços com instâncias ativas.
  app.get('/servicos', (req, res) => {
    res.json(Object.fromEntries([...registros.keys()].map(n => [n, vivas(n)]).filter(([, urls]) => urls.length)));
  });

  // Retornar as instâncias ativas de um serviço.
  app.get('/servicos/:nome', (req, res) => {
    const instancias = vivas(req.params.nome);
    if (!instancias.length) return res.status(404).json({ erro: `Nenhuma instância ativa do serviço "${req.params.nome}"` });
    res.json({ nome: req.params.nome, instancias });
  });

  // Cancelar o registro de uma instância (ao desligar).
  app.delete('/servicos/:nome', (req, res) => {
    registros.get(req.params.nome)?.delete(req.query.url);
    res.status(204).end();
  });

  app.use((req, res) => res.status(404).json({ erro: `Rota não encontrada: ${req.path}` }));
  app.use((erro, req, res, next) => res.status(erro.status ?? 500).json({ erro: erro.status ? erro.message : 'Erro interno' }));

  return http.createServer(app);
}
