// Serviço de Notas: implementa a interface IServicoNotas, com rotas Express.
// Casos de uso: UC05 Registrar e acompanhar notas (inclui Calcular situação acadêmica).
// Para a situação final, consulta o Serviço de Frequência, sempre localizado
// pelo Discovery (nunca por endereço fixo).
import http from 'node:http';
import express from 'express';
import { ErroHttp, validar, nota, identificador, tratarErros } from './validacao.js';
import { calcularSituacao } from './regras.js';

function validarNotas(corpo = {}) {
  const { va1 = null, va2 = null, va3 = null, final = null } = corpo;
  validar([
    nota(va1, 'va1'), nota(va2, 'va2'), nota(va3, 'va3'), nota(final, 'final'),
    va3 != null && (va1 == null || va2 == null) ? 'va3 só pode ser lançada depois de va1 e va2' : null,
    final != null && va3 == null ? 'final só pode ser lançada depois da va3' : null,
  ]);
  return { va1, va2, va3, final };
}

function validarIds(params) {
  validar([
    identificador(params.estudanteId, 'estudanteId'),
    params.disciplinaId !== undefined ? identificador(params.disciplinaId, 'disciplinaId') : null,
  ]);
}

const comSituacao = registro => ({ ...registro, situacao: calcularSituacao(registro) });

/**
 * `localizar(nome)` vem do cliente do Discovery. Com ele, o serviço pede ao
 * Discovery o endereço do Serviço de Frequência e consulta o resumo de faltas.
 */
export function criarServicoNotas(repositorio, { localizar = async () => null } = {}) {
  async function consultarFrequencia(estudanteId, disciplinaId) {
    const instancia = await localizar('frequencia');
    if (!instancia) return { disponivel: false };
    try {
      const resp = await fetch(`${instancia}/estudantes/${estudanteId}/disciplinas/${disciplinaId}/frequencia`, { signal: AbortSignal.timeout(2000) });
      if (resp.status === 404) return { disponivel: true, cadastrada: false };
      if (!resp.ok) return { disponivel: false };
      const { resumo } = await resp.json();
      return { disponivel: true, cadastrada: true, atendidoPor: instancia, resumo };
    } catch {
      return { disponivel: false };
    }
  }

  const app = express();
  app.use(express.json());

  app.get('/saude', (req, res) => res.json({ servico: 'notas', status: 'ok', banco: repositorio.tipo }));

  // Calcular situação acadêmica sem gravar nada (simulação).
  app.post('/situacao', (req, res) => res.json(calcularSituacao(validarNotas(req.body))));

  app.get('/estudantes/:estudanteId/notas', async (req, res) => {
    validarIds(req.params);
    const disciplinas = (await repositorio.listar(req.params.estudanteId)).map(comSituacao);
    res.json({ estudanteId: req.params.estudanteId, disciplinas });
  });

  // Notas de uma disciplina + situação final, que considera a frequência
  // obtida do Serviço de Frequência (comunicação entre serviços via Discovery).
  app.get('/estudantes/:estudanteId/disciplinas/:disciplinaId/notas', async (req, res) => {
    validarIds(req.params);
    const registro = await repositorio.buscar(req.params.estudanteId, req.params.disciplinaId);
    if (!registro) throw new ErroHttp(404, 'Nenhuma nota lançada para esta disciplina');
    const resultado = comSituacao(registro);
    const frequencia = await consultarFrequencia(req.params.estudanteId, req.params.disciplinaId);
    const reprovadoPorFalta = frequencia.resumo?.nivel === 'reprovado-por-falta';
    res.json({
      ...resultado,
      frequencia,
      situacaoFinal: reprovadoPorFalta ? 'reprovado-por-falta' : resultado.situacao.etapa,
    });
  });

  // Lança ou substitui as notas da disciplina (campos ausentes ficam sem nota).
  app.put('/estudantes/:estudanteId/disciplinas/:disciplinaId/notas', async (req, res) => {
    validarIds(req.params);
    const notas = validarNotas(req.body);
    const { estudanteId, disciplinaId } = req.params;
    res.json(comSituacao(await repositorio.salvar({ estudanteId, disciplinaId, ...notas })));
  });

  app.delete('/estudantes/:estudanteId/disciplinas/:disciplinaId/notas', async (req, res) => {
    validarIds(req.params);
    if (!(await repositorio.remover(req.params.estudanteId, req.params.disciplinaId))) {
      throw new ErroHttp(404, 'Nenhuma nota lançada para esta disciplina');
    }
    res.status(204).end();
  });

  tratarErros(app, 'notas');
  return http.createServer(app);
}
