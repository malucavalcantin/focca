// Serviço de Frequência: implementa a interface IServicoFrequencia, com rotas Express.
// Casos de uso: UC06 Registrar e acompanhar faltas (inclui Calcular resumo de frequência).
import http from 'node:http';
import express from 'express';
import { ErroHttp, validar, identificador, inteiroPositivo, booleano, data, tratarErros } from './validacao.js';
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

  const app = express();
  app.use(express.json());

  app.get('/saude', (req, res) => res.json({ servico: 'frequencia', status: 'ok', banco: repositorio.tipo }));

  // Visão geral: resumo de todas as disciplinas do estudante.
  app.get('/estudantes/:estudanteId/frequencia', async (req, res) => {
    validarIds(req.params);
    const disciplinas = await repositorio.listarDisciplinas(req.params.estudanteId);
    res.json({ estudanteId: req.params.estudanteId, disciplinas: await Promise.all(disciplinas.map(frequenciaDa)) });
  });

  // Cadastra/atualiza a disciplina no controle de faltas (carga horária e se tem chamada).
  app.put('/estudantes/:estudanteId/disciplinas/:disciplinaId', async (req, res) => {
    validarIds(req.params);
    const { cargaHoraria, temChamada = true } = req.body ?? {};
    validar([inteiroPositivo(cargaHoraria, 'cargaHoraria'), booleano(temChamada, 'temChamada')]);
    const { estudanteId, disciplinaId } = req.params;
    res.json(await frequenciaDa(await repositorio.salvarDisciplina({ estudanteId, disciplinaId, cargaHoraria, temChamada })));
  });

  app.get('/estudantes/:estudanteId/disciplinas/:disciplinaId/frequencia', async (req, res) => {
    validarIds(req.params);
    res.json(await frequenciaDa(await disciplinaOu404(req.params.estudanteId, req.params.disciplinaId)));
  });

  app.delete('/estudantes/:estudanteId/disciplinas/:disciplinaId', async (req, res) => {
    validarIds(req.params);
    if (!(await repositorio.removerDisciplina(req.params.estudanteId, req.params.disciplinaId))) {
      throw new ErroHttp(404, 'Disciplina não cadastrada no controle de frequência deste estudante');
    }
    res.status(204).end();
  });

  // Registra falta(s) em uma data. Responde com a falta criada e o resumo atualizado.
  app.post('/estudantes/:estudanteId/disciplinas/:disciplinaId/faltas', async (req, res) => {
    validarIds(req.params);
    const { data: dia, quantidade = 1 } = req.body ?? {};
    validar([data(dia, 'data'), inteiroPositivo(quantidade, 'quantidade')]);
    const { estudanteId, disciplinaId } = req.params;
    const disciplina = await disciplinaOu404(estudanteId, disciplinaId);
    const falta = await repositorio.registrarFalta({ estudanteId, disciplinaId, data: dia, quantidade });
    res.status(201).json({ falta, resumo: (await frequenciaDa(disciplina)).resumo });
  });

  app.delete('/estudantes/:estudanteId/faltas/:faltaId', async (req, res) => {
    validarIds(req.params);
    const id = Number(req.params.faltaId);
    if (!Number.isInteger(id) || !(await repositorio.removerFalta(id, req.params.estudanteId))) {
      throw new ErroHttp(404, 'Falta não encontrada');
    }
    res.status(204).end();
  });

  tratarErros(app, 'frequencia');
  return http.createServer(app);
}
