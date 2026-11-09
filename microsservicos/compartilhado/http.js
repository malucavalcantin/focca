// Utilitários HTTP comuns a todos os componentes (sem dependências externas).
import http from 'node:http';

export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

/** Rotas no formato 'GET /estudantes/:estudanteId/notas'. */
function compilarRota(padrao) {
  const [metodo, caminho] = padrao.split(' ');
  const nomes = [];
  const regex = new RegExp('^' + caminho.replace(/:(\w+)/g, (_, nome) => {
    nomes.push(nome);
    return '([^/]+)';
  }) + '/?$');
  return { metodo, regex, nomes };
}

export function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', p => partes.push(p));
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto) return resolve({});
      try { resolve(JSON.parse(texto)); } catch { reject(new ErroHttp(400, 'Corpo da requisição não é um JSON válido')); }
    });
    req.on('error', reject);
  });
}

export function enviarJson(res, status, corpo) {
  const texto = corpo === undefined ? '' : JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(texto);
}

/**
 * Cria um servidor HTTP a partir de um mapa { 'MÉTODO /caminho/:param': handler }.
 * O handler recebe { params, corpo, query, req } e devolve { status, corpo }
 * ou só o corpo (status 200).
 */
export function criarServidor(rotas, { nome = 'servico' } = {}) {
  const compiladas = Object.entries(rotas).map(([padrao, handler]) => ({ ...compilarRota(padrao), handler }));

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const candidatas = compiladas.filter(r => r.regex.test(url.pathname));
      if (!candidatas.length) throw new ErroHttp(404, `Rota não encontrada: ${url.pathname}`);
      const rota = candidatas.find(r => r.metodo === req.method);
      if (!rota) throw new ErroHttp(405, `Método ${req.method} não permitido em ${url.pathname}`);

      const valores = url.pathname.match(rota.regex).slice(1).map(decodeURIComponent);
      const params = Object.fromEntries(rota.nomes.map((n, i) => [n, valores[i]]));
      const corpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await lerCorpo(req) : {};
      const resultado = await rota.handler({ params, corpo, query: Object.fromEntries(url.searchParams), req });

      if (resultado && typeof resultado === 'object' && 'status' in resultado && 'corpo' in resultado) {
        enviarJson(res, resultado.status, resultado.corpo);
      } else {
        enviarJson(res, 200, resultado);
      }
    } catch (erro) {
      const status = erro instanceof ErroHttp ? erro.status : 500;
      if (status === 500) console.error(`[${nome}]`, erro);
      enviarJson(res, status, { erro: status === 500 ? 'Erro interno' : erro.message, detalhes: erro.detalhes });
    }
  });
}
