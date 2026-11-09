// Serviço de Frequência: implementa a interface IServicoFrequencia.
// Casos de uso: UC06 Registrar e acompanhar faltas (inclui Calcular resumo de frequência).
import { criarServidor, ErroHttp } from '../../compartilhado/http.js';
import { validar, identificador, inteiroPositivo, booleano, data } from '../../compartilhado/validacao.js';
import { calcularResumoFrequencia } from './regras.js';

export function criarServicoFrequencia(repositorio) {
  const validarIds = ({ estudanteId, disciplinaId }) => validar([
    identificador(estudanteId, 'estudanteId'),
    disciplinaId !== undefined ? identificador(disciplinaId, 'disciplinaId') : null,
  ]);

  const disciplinaOu404 = async (e, d) => {
    const disciplina = await repositorio.buscarDisciplina(e, d);
    if (!disciplina) throw new ErroHttp(404, 'Disciplina não cadastrada no controle de frequência deste estudante');
    return disciplina;
  };

  const frequenciaDa = async disciplina => {
    const faltas = await repositorio.listarFaltas(disciplina.estudanteId, disciplina.disciplinaId);
    const total = faltas.reduce((s, f) => s + f.quantidade, 0);
    return { ...disciplina, faltas, resumo: calcularResumoFrequencia({ ...disciplina, faltas: total }) };
  };

  return criarServidor({
    'GET /saude': () => ({ servico: 'frequencia', status: 'ok', banco: repositorio.tipo }),

    // Visão geral: resumo de todas as disciplinas do estudante.
    'GET /estudantes/:estudanteId/frequencia': async ({ params }) => {
      validarIds(params);
      const disciplinas = await repositorio.listarDisciplinas(params.estudanteId);
      return { estudanteId: params.estudanteId, disciplinas: await Promise.all(disciplinas.map(frequenciaDa)) };
    },

    // Cadastra/atualiza a disciplina no controle de faltas (carga horária e se tem chamada).
    'PUT /estudantes/:estudanteId/disciplinas/:disciplinaId': async ({ params, corpo }) => {
      validarIds(params);
      const { cargaHoraria, temChamada = true } = corpo;
      validar([inteiroPositivo(cargaHoraria, 'cargaHoraria'), booleano(temChamada, 'temChamada')]);
      return frequenciaDa(await repositorio.salvarDisciplina({ ...params, cargaHoraria, temChamada }));
    },

    'GET /estudantes/:estudanteId/disciplinas/:disciplinaId/frequencia': async ({ params }) => {
      validarIds(params);
      return frequenciaDa(await disciplinaOu404(params.estudanteId, params.disciplinaId));
    },

    'DELETE /estudantes/:estudanteId/disciplinas/:disciplinaId': async ({ params }) => {
      validarIds(params);
      if (!(await repositorio.removerDisciplina(params.estudanteId, params.disciplinaId))) {
        throw new ErroHttp(404, 'Disciplina não cadastrada no controle de frequência deste estudante');
      }
      return { status: 204, corpo: undefined };
    },

    // Registra falta(s) em uma data. Responde com a falta criada e o resumo atualizado.
    'POST /estudantes/:estudanteId/disciplinas/:disciplinaId/faltas': async ({ params, corpo }) => {
      validarIds(params);
      const { data: dia, quantidade = 1 } = corpo;
      validar([data(dia, 'data'), inteiroPositivo(quantidade, 'quantidade')]);
      const disciplina = await disciplinaOu404(params.estudanteId, params.disciplinaId);
      const falta = await repositorio.registrarFalta({ ...params, data: dia, quantidade });
      return { status: 201, corpo: { falta, resumo: (await frequenciaDa(disciplina)).resumo } };
    },

    'DELETE /estudantes/:estudanteId/faltas/:faltaId': async ({ params }) => {
      validarIds(params);
      const id = Number(params.faltaId);
      if (!Number.isInteger(id) || !(await repositorio.removerFalta(id, params.estudanteId))) {
        throw new ErroHttp(404, 'Falta não encontrada');
      }
      return { status: 204, corpo: undefined };
    },
  }, { nome: 'frequencia' });
}
