// Camada de dados da interface do Focca ligada aos MICROSSERVIÇOS.
// Tem as mesmas funções do firebase-service.js, mas cada uma chama o
// API Gateway Focca (fachada), que confere o token e encaminha ao serviço certo
// localizado pelo Discovery:
//
//   login / conta / sair      -> /api/autenticacao/...  (Serviço de Autenticação)
//   matriz e semestre atual   -> /api/semestre/...      (Serviço de Semestre)
//   notas (VA1, VA2, VA3, Final) -> /api/notas/...      (Serviço de Notas)
//   faltas e chamada          -> /api/frequencia/...    (Serviço de Frequência)
//   atividades e Google Agenda -> /api/agenda/...       (Serviço de Agenda Acadêmica)
//
// O que nenhum serviço guarda (horários das aulas, favoritos, professor, sala,
// anotações e preferências do perfil) fica no navegador (localStorage), separado
// por estudante. Toda chamada leva "Authorization: Bearer <token>" do login.
import { API_URL } from './api-config.js?v=20261126';

// ---------- chamada ao gateway ----------
export class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.code = `api/${status}`;
    this.detalhes = detalhes;
  }
}

const CHAVE_SESSAO = 'focca-sessao';
let sessao = lerSessao();
const ouvintes = new Set();

function lerSessao() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null');
    return s?.token && Date.parse(s.expiraEm) > Date.now() ? s : null;
  } catch { return null; }
}
function gravarSessao(nova) {
  const mudou = Boolean(sessao) !== Boolean(nova) || sessao?.token !== nova?.token;
  sessao = nova;
  try { nova ? localStorage.setItem(CHAVE_SESSAO, JSON.stringify(nova)) : localStorage.removeItem(CHAVE_SESSAO); } catch { /* navegador sem storage */ }
  if (mudou) ouvintes.forEach(cb => cb(usuarioAtual(), null));
}
function usuarioAtual() {
  if (!sessao) return null;
  const u = sessao.usuario;
  return { uid: u.id, email: u.email, displayName: u.nome, photoURL: null, provider: u.provedor };
}

async function api(metodo, caminho, corpo, { publica = false } = {}) {
  const headers = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (!publica) {
    if (!sessao) throw new ErroApi(401, 'Faça login para continuar.');
    headers.Authorization = `Bearer ${sessao.token}`;
  }
  let resp;
  try {
    resp = await fetch(API_URL + caminho, { method: metodo, headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  } catch {
    throw new ErroApi(0, `Não foi possível acessar o API Gateway em ${API_URL}. Os microsserviços estão no ar?`);
  }
  const texto = await resp.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }
  if (!resp.ok) {
    if (resp.status === 401 && !publica) gravarSessao(null); // sessão expirou: volta para o login
    const detalhes = Array.isArray(dados?.detalhes) ? `: ${dados.detalhes.join('; ')}` : '';
    throw new ErroApi(resp.status, (dados?.erro || `O gateway respondeu ${resp.status}`) + detalhes, dados?.detalhes);
  }
  return dados;
}

const enc = encodeURIComponent;
const eu = () => {
  if (!sessao) throw new ErroApi(401, 'Faça login para continuar.');
  return enc(sessao.usuario.id);
};
const sem404 = promessa => promessa.catch(erro => (erro.status === 404 ? null : Promise.reject(erro)));

// ---------- dados que ficam no navegador (sem serviço próprio) ----------
const chaveLocal = nome => `focca-local:${sessao?.usuario.id}:${nome}`;
function lerLocal(nome, padrao) {
  try { return JSON.parse(localStorage.getItem(chaveLocal(nome)) || 'null') ?? padrao; } catch { return padrao; }
}
function gravarLocal(nome, valor) {
  try { localStorage.setItem(chaveLocal(nome), JSON.stringify(valor)); } catch { /* navegador sem storage */ }
}
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- Serviço de Autenticação ----------
export async function loginWithEmail(email, senha) {
  gravarSessao(await api('POST', '/api/autenticacao/sessoes', { email, senha }, { publica: true }));
  return usuarioAtual();
}
export async function registerWithEmail(nome, email, senha) {
  await api('POST', '/api/autenticacao/contas', { nome: nome || 'Estudante', email, senha }, { publica: true });
  return loginWithEmail(email, senha);
}
/** Entrar com conta Google: envia o ID token ao serviço (no modo simulado, "simulado:<email>:<nome>"). */
export async function loginWithGoogle(idToken) {
  gravarSessao(await api('POST', '/api/autenticacao/sessoes/google', { idToken }, { publica: true }));
  return usuarioAtual();
}
export async function finishRedirectLogin() { return null; }
export function watchAuth(callback) {
  ouvintes.add(callback);
  (async () => {
    if (sessao) {
      try {
        const atual = await api('GET', '/api/autenticacao/sessoes/atual');
        sessao = { ...sessao, usuario: atual.usuario };
      } catch {
        gravarSessao(null);
        callback(null, null);
        return;
      }
    }
    callback(usuarioAtual(), null);
  })();
  return () => ouvintes.delete(callback);
}
export async function logout() {
  try { await api('DELETE', '/api/autenticacao/sessoes/atual'); } catch { /* já expirada */ }
  gravarSessao(null);
}

// ---------- Serviço de Semestre e Matriz Curricular ----------
const TIPO_PARA_SERVICO = { mandatory: 'obrigatoria', elective: 'optativa', internship: 'estagio', tcc: 'tcc' };
const TIPO_DO_SERVICO = Object.fromEntries(Object.entries(TIPO_PARA_SERVICO).map(([a, b]) => [b, a]));
const STATUS_PARA_SERVICO = { pending: 'pendente', current: 'cursando', approved: 'aprovada', approved_final: 'aprovada', failed: 'reprovada', withdrawn: 'pendente', exempt: 'dispensada' };
const STATUS_DO_SERVICO = { pendente: 'pending', cursando: 'current', aprovada: 'approved', reprovada: 'failed', dispensada: 'exempt' };

function paraDisciplinaDoApp(d, extras) {
  const { statusApp, ...detalhes } = extras[d.id] || {};
  // "Aprovada na final" e "Trancada" não existem no serviço: guardamos o detalhe aqui.
  const status = statusApp && STATUS_PARA_SERVICO[statusApp] === d.status ? statusApp : (STATUS_DO_SERVICO[d.status] || 'pending');
  return {
    name: d.nome, hours: d.cargaHoraria, period: String(d.periodo), type: TIPO_DO_SERVICO[d.tipo] || 'mandatory',
    ...detalhes, id: d.id, status,
  };
}
const buscarMatriz = () => api('GET', `/api/semestre/estudantes/${eu()}/matriz`);
const buscarSemestre = () => sem404(api('GET', `/api/semestre/estudantes/${eu()}/semestre`));

export async function listSubjects() {
  const { disciplinas } = await buscarMatriz();
  const extras = lerLocal('disciplinas', {});
  return disciplinas.map(d => paraDisciplinaDoApp(d, extras));
}
export async function updateSubject(id, payload) {
  const { status, ...detalhes } = payload;
  const extras = lerLocal('disciplinas', {});
  if (status !== undefined) {
    await api('PATCH', `/api/semestre/estudantes/${eu()}/disciplinas/${enc(id)}`, { status: STATUS_PARA_SERVICO[status] || 'pendente' });
    detalhes.statusApp = status;
  }
  extras[id] = { ...extras[id], ...detalhes };
  gravarLocal('disciplinas', extras);
}
const SEM_SUPORTE = 'No modo microsserviços a matriz vem do Serviço de Semestre: adicionar ou excluir uma disciplina avulsa ainda não é suportado (use "Restaurar matriz-base").';
export async function createSubject() { throw new ErroApi(501, SEM_SUPORTE); }
export async function removeSubject() { throw new ErroApi(501, SEM_SUPORTE); }

/** Importar matriz: substitui a matriz inteira do estudante no Serviço de Semestre. */
export async function replaceSubjects(items) {
  await api('POST', `/api/semestre/estudantes/${eu()}/matriz/importacao`, {
    disciplinas: items.map(i => ({
      nome: String(i.name || '').trim(), periodo: Math.max(1, parseInt(i.period, 10) || 1),
      cargaHoraria: Math.max(1, Math.round(Number(i.hours) || 0)), tipo: TIPO_PARA_SERVICO[i.type] || 'obrigatoria',
    })),
  });
  // As disciplinas ganham ids novos: guarda o código de cada uma pelo nome e período.
  const { disciplinas } = await buscarMatriz();
  const extras = {};
  for (const d of disciplinas) {
    const origem = items.find(i => String(i.name).trim() === d.nome && String(i.period) === String(d.periodo));
    if (origem?.code) extras[d.id] = { code: origem.code };
  }
  gravarLocal('disciplinas', extras);
}
/** Usar matriz base de Computação (UC02, extensão do serviço). */
export async function useBaseMatrix() {
  await api('POST', `/api/semestre/estudantes/${eu()}/matriz/base`);
  gravarLocal('disciplinas', {});
}
/** UC02 Configurar semestre atual: o Serviço de Semestre também cadastra as disciplinas no Serviço de Frequência. */
export async function configureSemester(rotulo, idsAtuais) {
  const ids = [...idsAtuais];
  const perfil = lerLocal('perfil', {});
  const nome = String(rotulo || perfil.currentTerm || 'Semestre atual').trim();
  if (ids.length) {
    await api('PUT', `/api/semestre/estudantes/${eu()}/semestre`, { rotulo: nome, disciplinas: ids });
  } else {
    // Nenhuma disciplina marcada: só tira o "cursando" das que estavam.
    const atuais = (await listSubjects()).filter(s => s.status === 'current');
    await Promise.all(atuais.map(s => updateSubject(s.id, { status: 'pending' })));
  }
  const extras = lerLocal('disciplinas', {});
  for (const id of ids) if (extras[id]) delete extras[id].statusApp;
  gravarLocal('disciplinas', extras);
  gravarLocal('perfil', { ...perfil, currentTerm: nome });
}

// ---------- Perfil (nome e semestre vêm dos serviços; preferências ficam no navegador) ----------
export async function getProfile() {
  const [semestre, matriz] = await Promise.all([buscarSemestre(), buscarMatriz()]);
  const local = lerLocal('perfil', {});
  const temMatriz = matriz.disciplinas.length > 0;
  return {
    id: sessao.usuario.id, email: sessao.usuario.email, displayName: sessao.usuario.nome,
    institution: 'UFRPE', courseName: 'Computação', coursePeriods: 9,
    ...local,
    currentTerm: semestre?.rotulo ?? local.currentTerm ?? '',
    onboardingComplete: Boolean(local.onboardingComplete || temMatriz),
    matrixConfigured: temMatriz,
  };
}
export async function saveProfile(payload) {
  const local = lerLocal('perfil', {});
  gravarLocal('perfil', { ...local, ...payload });
  // Mudou o rótulo do semestre: atualiza também no Serviço de Semestre.
  const rotulo = payload.currentTerm?.trim();
  if (rotulo) {
    const semestre = await buscarSemestre();
    if (semestre && semestre.rotulo !== rotulo && semestre.disciplinas.length) {
      await api('PUT', `/api/semestre/estudantes/${eu()}/semestre`, { rotulo, disciplinas: semestre.disciplinas.map(d => d.id) });
    }
  }
}

// ---------- Serviço de Notas (VA1, VA2, VA3 e Final, regra da UFRPE) ----------
const VAGAS = ['va1', 'va2', 'va3', 'final'];
const ROTULOS = { va1: '1ª VA', va2: '2ª VA', va3: '3ª VA', final: 'Final' };
const normalizar = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function vagaPeloTitulo(titulo) {
  const t = normalizar(titulo);
  if (/\bfinal\b/.test(t)) return 'final';
  const m = t.match(/va\s*-?\s*([123])\b/) || t.match(/\b([123])\s*[aª]?\s*va\b/);
  return m ? `va${m[1]}` : null;
}
const notasDa = async disciplinaId => (await sem404(api('GET', `/api/notas/estudantes/${eu()}/disciplinas/${enc(disciplinaId)}/notas`))) || {};
const corpoNotas = atual => Object.fromEntries(VAGAS.map(v => [v, atual[v] ?? null]));

export async function listAssessments() {
  const { disciplinas } = await api('GET', `/api/notas/estudantes/${eu()}/notas`);
  const titulos = lerLocal('titulos-notas', {});
  return disciplinas.flatMap(r => VAGAS.filter(v => r[v] != null).map(v => ({
    id: `${r.disciplinaId}~${v}`, subjectId: r.disciplinaId, slot: v,
    title: titulos[`${r.disciplinaId}~${v}`] || ROTULOS[v], grade: r[v], situacao: r.situacao,
  })));
}
export async function saveAssessment(item) {
  const atual = await notasDa(item.subjectId);
  const vaga = item.id ? item.id.split('~')[1] : (vagaPeloTitulo(item.title) || VAGAS.find(v => atual[v] == null));
  if (!vaga) throw new ErroApi(400, 'Esta disciplina já tem 1ª VA, 2ª VA, 3ª VA e Final lançadas. Exclua uma nota para lançar outra.');
  const corpo = corpoNotas(atual);
  corpo[vaga] = Number(item.grade);
  await api('PUT', `/api/notas/estudantes/${eu()}/disciplinas/${enc(item.subjectId)}/notas`, corpo);
  const titulos = lerLocal('titulos-notas', {});
  titulos[`${item.subjectId}~${vaga}`] = item.title || ROTULOS[vaga];
  gravarLocal('titulos-notas', titulos);
  return `${item.subjectId}~${vaga}`;
}
export async function removeAssessment(id) {
  const [disciplinaId, vaga] = id.split('~');
  const corpo = corpoNotas(await notasDa(disciplinaId));
  corpo[vaga] = null;
  const caminho = `/api/notas/estudantes/${eu()}/disciplinas/${enc(disciplinaId)}/notas`;
  if (VAGAS.every(v => corpo[v] == null)) await sem404(api('DELETE', caminho));
  else await api('PUT', caminho, corpo);
}

// ---------- Serviço de Frequência ----------
const frequenciaGeral = async () => (await api('GET', `/api/frequencia/estudantes/${eu()}/frequencia`)).disciplinas;

export async function listAbsences() {
  return (await frequenciaGeral()).flatMap(d => d.faltas.map(f => ({
    id: String(f.id), subjectId: d.disciplinaId, date: f.data, absences: f.quantidade,
  })));
}
export async function listSubjectSettings() {
  return (await frequenciaGeral()).map(d => ({
    id: d.disciplinaId, subjectId: d.disciplinaId, professorCalls: d.temChamada, cargaHoraria: d.cargaHoraria, resumo: d.resumo,
  }));
}
export async function saveSubjectSetting({ subjectId, professorCalls }) {
  const disciplina = (await listSubjects()).find(s => s.id === subjectId);
  if (!disciplina) throw new ErroApi(404, 'Disciplina não encontrada na sua matriz.');
  await api('PUT', `/api/frequencia/estudantes/${eu()}/disciplinas/${enc(subjectId)}`, {
    cargaHoraria: Math.max(1, Math.round(Number(disciplina.hours) || 0)), temChamada: professorCalls !== false,
  });
  return subjectId;
}
export async function addAbsence(item) {
  const registrar = () => api('POST', `/api/frequencia/estudantes/${eu()}/disciplinas/${enc(item.subjectId)}/faltas`, {
    data: item.date, quantidade: Math.max(1, Number(item.absences || 1)),
  });
  try {
    return String((await registrar()).falta.id);
  } catch (erro) {
    if (erro.status !== 404) throw erro;
    await saveSubjectSetting({ subjectId: item.subjectId, professorCalls: true }); // ainda não estava no controle de faltas
    return String((await registrar()).falta.id);
  }
}
export async function removeAbsence(id) {
  await api('DELETE', `/api/frequencia/estudantes/${eu()}/faltas/${enc(id)}`);
}

// ---------- Serviço de Agenda Acadêmica ----------
const pad = n => String(n).padStart(2, '0');
function dataHoraLocal(iso) {
  const d = new Date(iso);
  return { data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
function tipoPeloTitulo(titulo) {
  const t = normalizar(titulo);
  if (/prova|\bva\b|exame|final/.test(t)) return 'prova';
  if (/lista|exercicio/.test(t)) return 'lista';
  if (/apresenta|seminario/.test(t)) return 'apresentacao';
  if (/trabalho|projeto|relatorio/.test(t)) return 'trabalho';
  return 'outro';
}

export async function listTasks() {
  const { atividades } = await api('GET', `/api/agenda/estudantes/${eu()}/atividades`);
  const extras = lerLocal('atividades', {});
  return atividades.map(a => ({
    ...extras[a.id],
    id: a.id, title: a.titulo, subjectName: a.disciplina || '', subject: a.disciplina || '', type: a.tipo,
    dueAt: new Date(`${a.data}T${a.hora || '23:59'}:00`).toISOString(),
    completed: a.concluida, calendarEventId: a.eventoExternoId || null,
  }));
}
export async function createTask(task) {
  const { data, hora } = dataHoraLocal(task.dueAt);
  const atividade = await api('POST', `/api/agenda/estudantes/${eu()}/atividades`, {
    titulo: task.title, disciplina: task.subjectName || undefined, tipo: tipoPeloTitulo(task.title), data, hora,
  });
  const extras = lerLocal('atividades', {});
  extras[atividade.id] = { subjectId: task.subjectId, notes: task.notes || '', reminderValue: task.reminderValue, reminderUnit: task.reminderUnit };
  gravarLocal('atividades', extras);
  return atividade.id;
}
export async function updateTask(id, payload) {
  const campos = {};
  if (payload.completed !== undefined) campos.concluida = Boolean(payload.completed);
  if (payload.title !== undefined) campos.titulo = payload.title;
  if (payload.dueAt !== undefined) Object.assign(campos, dataHoraLocal(payload.dueAt));
  if (Object.keys(campos).length) await api('PATCH', `/api/agenda/estudantes/${eu()}/atividades/${enc(id)}`, campos);
  const { completed, title, dueAt, calendarEventId, ...resto } = payload; // o id do evento fica no serviço
  if (Object.keys(resto).length) {
    const extras = lerLocal('atividades', {});
    extras[id] = { ...extras[id], ...resto };
    gravarLocal('atividades', extras);
  }
}
export async function removeTask(id) {
  await api('DELETE', `/api/agenda/estudantes/${eu()}/atividades/${enc(id)}`);
  const extras = lerLocal('atividades', {});
  delete extras[id];
  gravarLocal('atividades', extras);
}
/**
 * Sincronizar evento no Google Agenda pelo Serviço de Agenda (adaptador PortaAgenda).
 * `acessoGoogle` é o token OAuth do estudante; no modo simulado do docker compose não é preciso.
 */
export async function syncTaskToCalendar(id, acessoGoogle) {
  const r = await api('POST', `/api/agenda/estudantes/${eu()}/atividades/${enc(id)}/sincronizar`, acessoGoogle ? { acessoGoogle } : {});
  return { id: r.sincronizacao.id, modo: r.sincronizacao.modo };
}

// ---------- Horários das aulas (nenhum serviço cuida deles: ficam no navegador) ----------
export async function listSchedule() { return lerLocal('horarios', []); }
export async function saveScheduleItem(item) {
  const lista = lerLocal('horarios', []);
  if (item.id) {
    const i = lista.findIndex(x => x.id === item.id);
    if (i >= 0) lista[i] = { ...lista[i], ...item };
    else lista.push(item);
    gravarLocal('horarios', lista);
    return item.id;
  }
  const id = novoId();
  lista.push({ ...item, id });
  gravarLocal('horarios', lista);
  return id;
}
export async function removeScheduleItem(id) {
  gravarLocal('horarios', lerLocal('horarios', []).filter(x => x.id !== id));
}
