import { GOOGLE_CLIENT_ID } from './firebase-config.js';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let tokenClient = null;
let accessToken = null;

function waitForGoogleIdentity(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('A biblioteca de autorização do Google não carregou. Recarregue a página.'));
      }
    }, 100);
  });
}

async function getToken() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google Agenda ainda precisa ser conectado ao novo projeto Focca. Configure o OAuth Client ID em firebase-config.js.');
  await waitForGoogleIdentity();

  if (accessToken) return accessToken;

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: response => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        const granted = window.google.accounts.oauth2.hasGrantedAllScopes(response, CALENDAR_SCOPE);
        if (!granted) {
          reject(new Error('A permissão para criar eventos no Google Agenda não foi concedida.'));
          return;
        }
        accessToken = response.access_token;
        resolve(accessToken);
      },
      error_callback: error => reject(new Error(error?.message || 'Não foi possível abrir a autorização do Google.'))
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function reminderToMinutes(value, unit) {
  const amount = Math.max(0, Number(value || 0));
  const multipliers = { minutes: 1, hours: 60, days: 1440 };
  const minutes = Math.round(amount * (multipliers[unit] || 1));
  if (minutes > 40320) {
    throw new Error('O Google Agenda aceita lembretes personalizados de até 4 semanas antes do evento.');
  }
  return minutes;
}

export async function createCalendarEvent(task) {
  const token = await getToken();
  const start = new Date(task.dueAt);
  if (Number.isNaN(start.getTime())) throw new Error('Data/hora da atividade inválida.');
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const reminderMinutes = reminderToMinutes(task.reminderValue, task.reminderUnit);

  const body = {
    summary: `${task.title} — ${task.subject}`,
    description: task.notes ? `${task.notes}\n\nCriado pelo Focca.` : 'Criado pelo Focca.',
    start: {
      dateTime: start.toISOString(),
      timeZone: USER_TIMEZONE
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: USER_TIMEZONE
    },
    reminders: {
      useDefault: false,
      overrides: reminderMinutes > 0 ? [{ method: 'popup', minutes: reminderMinutes }] : []
    },
    extendedProperties: {
      private: {
        source: 'focca-app',
        taskId: task.id || ''
      }
    }
  };

  let response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401) {
    accessToken = null;
    const renewedToken = await getToken();
    response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${renewedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details?.error?.message || `Erro ${response.status} ao criar evento.`);
  }

  return response.json();
}
