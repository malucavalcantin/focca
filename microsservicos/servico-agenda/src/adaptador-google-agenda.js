// Adaptador Google Agenda (PortaAgenda): cria o evento de uma atividade.
// - Modo real: recebe o token de acesso OAuth do estudante ("Obter autorização
//   de acesso à agenda") e chama a Google Calendar API.
// - Modo simulado (AGENDA_GOOGLE=simulado), para demonstração: gera um id de
//   evento local, sem sair da rede.
// O serviço só conhece esta interface: trocar de agenda não muda o serviço.
import { randomUUID } from 'node:crypto';

export function criarAdaptadorGoogleAgenda({ modo = process.env.AGENDA_GOOGLE } = {}) {
  return {
    modo: modo === 'simulado' ? 'simulado' : 'google',
    async criarEvento(atividade, acessoGoogle) {
      if (!acessoGoogle) {
        if (modo === 'simulado') return { id: `simulado-${randomUUID()}`, modo: 'simulado' };
        return null; // sem autorização de acesso à agenda
      }
      const inicio = atividade.hora ? { dateTime: `${atividade.data}T${atividade.hora}:00`, timeZone: 'America/Recife' } : { date: atividade.data };
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${acessoGoogle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: atividade.titulo, description: atividade.disciplina ?? '', start: inicio, end: inicio }),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw Object.assign(new Error(`Google Agenda respondeu ${resp.status}`), { status: 502 });
      return { id: (await resp.json()).id, modo: 'google' };
    },
  };
}
