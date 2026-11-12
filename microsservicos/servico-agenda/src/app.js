// Serviço de Agenda Acadêmica: implementa a interface IServicoAgenda, com rotas Express.
// Casos de uso: UC08 Planejar atividade acadêmica, que inclui Sincronizar evento
// no Google Agenda, que por sua vez inclui Obter autorização de acesso à agenda.
import http from 'node:http';
import express from 'express';
import { ErroHttp, validar, identificador, texto, data, hora, umDe, booleano, tratarErros } from './validacao.js';
import { criarAdaptadorGoogleAgenda } from './adaptador-google-agenda.js';

export const TIPOS = ['prova', 'trabalho', 'lista', 'apresentacao', 'outro'];

export function criarServicoAgenda(repositorio, { adaptadorAgenda = criarAdaptadorGoogleAgenda() } = {}) {
  const validarIds = ({ estudanteId, atividadeId }) => validar([
    identificador(estudanteId, 'estudanteId'),
    atividadeId !== undefined ? identificador(atividadeId, 'atividadeId') : null,
  ]);

  const atividadeOu404 = async (e, id) => {
    const atividade = await repositorio.buscar(e, id);
    if (!atividade) throw new ErroHttp(404, 'Atividade não encontrada');
    return atividade;
  };

  const app = express();
  app.use(express.json());

  app.get('/saude', (req, res) => res.json({ servico: 'agenda', status: 'ok', banco: repositorio.tipo, googleAgenda: adaptadorAgenda.modo }));

  // Listar atividades (?pendentes=true para só as não concluídas).
  app.get('/estudantes/:estudanteId/atividades', async (req, res) => {
    validarIds(req.params);
    const atividades = await repositorio.listar(req.params.estudanteId, { pendentes: req.query.pendentes === 'true' });
    res.json({ estudanteId: req.params.estudanteId, atividades });
  });

  // Planejar atividade acadêmica.
  app.post('/estudantes/:estudanteId/atividades', async (req, res) => {
    validarIds(req.params);
    const { titulo, disciplina, tipo = 'outro', data: dia, hora: horario } = req.body ?? {};
    validar([texto(titulo, 'titulo'), texto(disciplina, 'disciplina', { opcional: true }), umDe(tipo, TIPOS, 'tipo'), data(dia, 'data'), hora(horario, 'hora')]);
    const atividade = await repositorio.criar({ estudanteId: req.params.estudanteId, titulo: titulo.trim(), disciplina: disciplina ?? null, tipo, data: dia, hora: horario || null });
    res.status(201).json(atividade);
  });

  app.get('/estudantes/:estudanteId/atividades/:atividadeId', async (req, res) => {
    validarIds(req.params);
    res.json(await atividadeOu404(req.params.estudanteId, req.params.atividadeId));
  });

  // Editar ou concluir/reabrir uma atividade.
  app.patch('/estudantes/:estudanteId/atividades/:atividadeId', async (req, res) => {
    validarIds(req.params);
    const { titulo, disciplina, tipo, data: dia, hora: horario, concluida } = req.body ?? {};
    validar([
      texto(titulo, 'titulo', { opcional: true }), texto(disciplina, 'disciplina', { opcional: true }),
      umDe(tipo, TIPOS, 'tipo', { opcional: true }), data(dia, 'data', { opcional: true }), hora(horario, 'hora'),
      booleano(concluida, 'concluida'),
    ]);
    const campos = Object.fromEntries(Object.entries({ titulo, disciplina, tipo, data: dia, hora: horario, concluida }).filter(([, v]) => v !== undefined));
    const atividade = await repositorio.atualizar(req.params.estudanteId, req.params.atividadeId, campos);
    if (!atividade) throw new ErroHttp(404, 'Atividade não encontrada');
    res.json(atividade);
  });

  app.delete('/estudantes/:estudanteId/atividades/:atividadeId', async (req, res) => {
    validarIds(req.params);
    if (!(await repositorio.remover(req.params.estudanteId, req.params.atividadeId))) throw new ErroHttp(404, 'Atividade não encontrada');
    res.status(204).end();
  });

  // Sincronizar evento no Google Agenda (pelo adaptador PortaAgenda).
  // Corpo: { acessoGoogle: "<token OAuth>" } = a autorização de acesso à agenda.
  app.post('/estudantes/:estudanteId/atividades/:atividadeId/sincronizar', async (req, res) => {
    validarIds(req.params);
    const atividade = await atividadeOu404(req.params.estudanteId, req.params.atividadeId);
    const evento = await adaptadorAgenda.criarEvento(atividade, req.body?.acessoGoogle);
    if (!evento) throw new ErroHttp(403, 'É preciso autorizar o acesso ao Google Agenda (envie acessoGoogle)');
    const atualizada = await repositorio.atualizar(req.params.estudanteId, req.params.atividadeId, { eventoExternoId: evento.id });
    res.json({ atividade: atualizada, sincronizacao: evento });
  });

  tratarErros(app, 'agenda');
  return http.createServer(app);
}
