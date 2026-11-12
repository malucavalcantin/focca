// Validação «global»: regras de entrada e tratamento de erros HTTP.
// Cada serviço leva a sua cópia, para continuar independente dos outros.

export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

/** Junta os erros de vários campos e lança um 400 único, com a lista. */
export function validar(regras) {
  const erros = regras.filter(Boolean);
  if (erros.length) throw new ErroHttp(400, 'Dados inválidos', erros);
}

/** Nota entre 0 e 10. `null`/ausente é aceito quando opcional. */
export function nota(valor, campo, { opcional = true } = {}) {
  if (valor === undefined || valor === null) return opcional ? null : `${campo} é obrigatório`;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 10) {
    return `${campo} deve ser um número entre 0 e 10`;
  }
  return null;
}

export function inteiroPositivo(valor, campo, { minimo = 1, opcional = false } = {}) {
  if (valor === undefined || valor === null) return opcional ? null : `${campo} é obrigatório`;
  if (!Number.isInteger(valor) || valor < minimo) return `${campo} deve ser um inteiro maior ou igual a ${minimo}`;
  return null;
}

export function booleano(valor, campo, { opcional = true } = {}) {
  if (valor === undefined) return opcional ? null : `${campo} é obrigatório`;
  if (typeof valor !== 'boolean') return `${campo} deve ser true ou false`;
  return null;
}

/** Data no formato AAAA-MM-DD. */
export function data(valor, campo, { opcional = false } = {}) {
  if (valor === undefined || valor === null) return opcional ? null : `${campo} é obrigatório`;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor))) {
    return `${campo} deve estar no formato AAAA-MM-DD`;
  }
  return null;
}

/** Identificadores usados nas URLs: letras, números, hífen e sublinhado. */
export function identificador(valor, campo) {
  if (typeof valor !== 'string' || !/^[\w-]{1,64}$/.test(valor)) return `${campo} inválido`;
  return null;
}

/** Middlewares finais do Express: rota inexistente e erros (JSON). */
export function tratarErros(app, nome) {
  app.use((req, res) => res.status(404).json({ erro: `Rota não encontrada: ${req.path}` }));
  app.use((erro, req, res, next) => {
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Corpo da requisição não é um JSON válido' });
    const status = erro instanceof ErroHttp ? erro.status : 500;
    if (status === 500) console.error(`[${nome}]`, erro);
    res.status(status).json({ erro: status === 500 ? 'Erro interno' : erro.message, detalhes: erro.detalhes });
  });
}
