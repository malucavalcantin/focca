// Serviço de Notas: implementa a interface IServicoNotas.
// Casos de uso: UC05 Registrar e acompanhar notas (inclui Calcular situação acadêmica).
import { criarServidor, ErroHttp } from '../../compartilhado/http.js';
import { validar, nota, identificador } from '../../compartilhado/validacao.js';
import { calcularSituacao } from './regras.js';

function validarNotas(corpo) {
  const { va1 = null, va2 = null, va3 = null, final = null } = corpo;
  validar([
    nota(va1, 'va1'), nota(va2, 'va2'), nota(va3, 'va3'), nota(final, 'final'),
    va3 != null && (va1 == null || va2 == null) ? 'va3 só pode ser lançada depois de va1 e va2' : null,
    final != null && va3 == null ? 'final só pode ser lançada depois da va3' : null,
  ]);
  return { va1, va2, va3, final };
}

function validarIds(params) {
  validar([identificador(params.estudanteId, 'estudanteId'), params.disciplinaId !== undefined ? identificador(params.disciplinaId, 'disciplinaId') : null]);
}

const comSituacao = registro => ({ ...registro, situacao: calcularSituacao(registro) });

export function criarServicoNotas(repositorio) {
  return criarServidor({
    'GET /saude': () => ({ servico: 'notas', status: 'ok' }),

    // Calcular situação acadêmica sem gravar nada (simulação).
    'POST /situacao': ({ corpo }) => calcularSituacao(validarNotas(corpo)),

    'GET /estudantes/:estudanteId/notas': ({ params }) => {
      validarIds(params);
      const disciplinas = repositorio.listar(params.estudanteId).map(comSituacao);
      return { estudanteId: params.estudanteId, disciplinas };
    },

    'GET /estudantes/:estudanteId/disciplinas/:disciplinaId/notas': ({ params }) => {
      validarIds(params);
      const registro = repositorio.buscar(params.estudanteId, params.disciplinaId);
      if (!registro) throw new ErroHttp(404, 'Nenhuma nota lançada para esta disciplina');
      return comSituacao(registro);
    },

    // Lança ou substitui as notas da disciplina (campos ausentes ficam sem nota).
    'PUT /estudantes/:estudanteId/disciplinas/:disciplinaId/notas': ({ params, corpo }) => {
      validarIds(params);
      const notas = validarNotas(corpo);
      return comSituacao(repositorio.salvar({ ...params, ...notas }));
    },

    'DELETE /estudantes/:estudanteId/disciplinas/:disciplinaId/notas': ({ params }) => {
      validarIds(params);
      if (!repositorio.remover(params.estudanteId, params.disciplinaId)) {
        throw new ErroHttp(404, 'Nenhuma nota lançada para esta disciplina');
      }
      return { status: 204, corpo: undefined };
    },
  }, { nome: 'notas' });
}
