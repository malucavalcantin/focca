// Serviço de Semestre e Matriz Curricular: implementa a interface IServicoSemestre, com rotas Express.
// Casos de uso: UC02 Configurar semestre atual, estendido por Importar matriz
// (PDF ou imagem) e Usar matriz base de Computação.
// Ao configurar o semestre, cadastra as disciplinas atuais no Serviço de
// Frequência, localizado pelo Discovery.
import http from 'node:http';
import express from 'express';
import { ErroHttp, validar, identificador, texto, inteiroPositivo, umDe, tratarErros } from './validacao.js';
import { MATRIZ_BASE_COMPUTACAO } from './matriz-base.js';

export const TIPOS = ['obrigatoria', 'optativa', 'estagio', 'tcc'];
export const STATUS = ['pendente', 'cursando', 'aprovada', 'reprovada', 'dispensada'];
const CONCLUIDAS = new Set(['aprovada', 'dispensada']);

function progresso(disciplinas) {
  const soma = lista => lista.reduce((t, d) => t + d.cargaHoraria, 0);
  const total = soma(disciplinas);
  const concluida = soma(disciplinas.filter(d => CONCLUIDAS.has(d.status)));
  return {
    cargaHorariaTotal: total,
    cargaHorariaConcluida: concluida,
    percentual: total ? Math.round(concluida / total * 1000) / 10 : 0,
    cursando: disciplinas.filter(d => d.status === 'cursando').length,
  };
}

export function criarServicoSemestre(repositorio, { localizar = async () => null } = {}) {
  const validarIds = ({ estudanteId, disciplinaId }) => validar([
    identificador(estudanteId, 'estudanteId'),
    disciplinaId !== undefined ? identificador(disciplinaId, 'disciplinaId') : null,
  ]);

  // Comunicação entre serviços: cadastra as disciplinas atuais no Serviço de Frequência.
  async function cadastrarNaFrequencia(estudanteId, disciplinas) {
    const instancia = await localizar('frequencia');
    if (!instancia) return { disponivel: false, cadastradas: 0 };
    let cadastradas = 0;
    for (const d of disciplinas) {
      try {
        const resp = await fetch(`${instancia}/estudantes/${estudanteId}/disciplinas/${d.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cargaHoraria: d.cargaHoraria }),
          signal: AbortSignal.timeout(3000),
        });
        if (resp.ok) cadastradas++;
      } catch { /* Frequência fora do ar: o semestre continua configurado */ }
    }
    return { disponivel: true, atendidoPor: instancia, cadastradas };
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/saude', (req, res) => res.json({ servico: 'semestre', status: 'ok', banco: repositorio.tipo }));

  // A matriz base de Computação (referência, sem estudante).
  app.get('/matriz-base', (req, res) => res.json({ curso: 'Licenciatura em Computação (UFRPE)', disciplinas: MATRIZ_BASE_COMPUTACAO }));

  // Usar matriz base de Computação.
  app.post('/estudantes/:estudanteId/matriz/base', async (req, res) => {
    validarIds(req.params);
    await repositorio.substituirMatriz(req.params.estudanteId, MATRIZ_BASE_COMPUTACAO);
    const disciplinas = await repositorio.listar(req.params.estudanteId);
    res.status(201).json({ estudanteId: req.params.estudanteId, origem: 'matriz-base', total: disciplinas.length, progresso: progresso(disciplinas) });
  });

  // Importar matriz (PDF ou imagem): o app lê o arquivo e envia as disciplinas reconhecidas.
  app.post('/estudantes/:estudanteId/matriz/importacao', async (req, res) => {
    validarIds(req.params);
    const lista = req.body?.disciplinas;
    if (!Array.isArray(lista) || lista.length === 0 || lista.length > 200) throw new ErroHttp(400, 'Envie disciplinas: uma lista com 1 a 200 itens');
    const erros = lista.flatMap((d, i) => [
      texto(d?.nome, `disciplinas[${i}].nome`), inteiroPositivo(d?.periodo, `disciplinas[${i}].periodo`),
      inteiroPositivo(d?.cargaHoraria, `disciplinas[${i}].cargaHoraria`), umDe(d?.tipo ?? 'obrigatoria', TIPOS, `disciplinas[${i}].tipo`),
    ]);
    validar(erros);
    await repositorio.substituirMatriz(req.params.estudanteId, lista.map(d => ({ ...d, tipo: d.tipo ?? 'obrigatoria' })));
    const disciplinas = await repositorio.listar(req.params.estudanteId);
    res.status(201).json({ estudanteId: req.params.estudanteId, origem: 'importacao', total: disciplinas.length, progresso: progresso(disciplinas) });
  });

  // Matriz do estudante, com o progresso da graduação.
  app.get('/estudantes/:estudanteId/matriz', async (req, res) => {
    validarIds(req.params);
    const disciplinas = await repositorio.listar(req.params.estudanteId);
    res.json({ estudanteId: req.params.estudanteId, disciplinas, progresso: progresso(disciplinas) });
  });

  // Atualizar a situação de uma disciplina na matriz.
  app.patch('/estudantes/:estudanteId/disciplinas/:disciplinaId', async (req, res) => {
    validarIds(req.params);
    validar([umDe(req.body?.status, STATUS, 'status')]);
    if (!(await repositorio.alterarStatus(req.params.estudanteId, req.params.disciplinaId, req.body.status))) {
      throw new ErroHttp(404, 'Disciplina não encontrada na matriz');
    }
    res.json(await repositorio.buscar(req.params.estudanteId, req.params.disciplinaId));
  });

  // UC02 Configurar semestre atual: { rotulo: "2026.2", disciplinas: [ids] }.
  app.put('/estudantes/:estudanteId/semestre', async (req, res) => {
    validarIds(req.params);
    const { rotulo, disciplinas: ids } = req.body ?? {};
    validar([texto(rotulo, 'rotulo', { max: 20 }), Array.isArray(ids) && ids.length > 0 ? null : 'disciplinas deve ser uma lista de ids da matriz']);
    const matriz = await repositorio.listar(req.params.estudanteId);
    const porId = new Map(matriz.map(d => [d.id, d]));
    const faltando = ids.filter(id => !porId.has(id));
    if (faltando.length) throw new ErroHttp(400, 'Disciplinas fora da matriz do estudante', faltando);
    await repositorio.configurarSemestre(req.params.estudanteId, rotulo.trim(), ids);
    const atuais = ids.map(id => porId.get(id));
    const frequencia = await cadastrarNaFrequencia(req.params.estudanteId, atuais);
    res.json({ estudanteId: req.params.estudanteId, rotulo: rotulo.trim(), disciplinas: atuais.map(d => ({ ...d, status: 'cursando' })), frequencia });
  });

  app.get('/estudantes/:estudanteId/semestre', async (req, res) => {
    validarIds(req.params);
    const semestre = await repositorio.buscarSemestre(req.params.estudanteId);
    if (!semestre) throw new ErroHttp(404, 'Semestre atual ainda não configurado');
    const disciplinas = (await repositorio.listar(req.params.estudanteId)).filter(d => d.status === 'cursando');
    res.json({ estudanteId: req.params.estudanteId, rotulo: semestre.rotulo, disciplinas });
  });

  tratarErros(app, 'semestre');
  return http.createServer(app);
}
