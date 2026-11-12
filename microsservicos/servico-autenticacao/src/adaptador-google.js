// Adaptador de Autenticação (PortaAutenticacao) para "Entrar com conta Google".
// - Modo real: valida o ID token no Google (endpoint tokeninfo) e confere se
//   ele foi emitido para o Client ID do Focca (GOOGLE_CLIENT_ID).
// - Modo simulado (AUTENTICACAO_GOOGLE=simulado), para demonstração sem
//   navegador: aceita tokens no formato "simulado:<email>:<nome>".
// O serviço só conhece esta interface: trocar de provedor não muda o serviço.

export function criarAdaptadorGoogle({ modo = process.env.AUTENTICACAO_GOOGLE, clientId = process.env.GOOGLE_CLIENT_ID } = {}) {
  return {
    disponivel: () => modo === 'simulado' || Boolean(clientId),
    async verificar(idToken) {
      if (modo === 'simulado') {
        const [prefixo, email, nome] = String(idToken).split(':');
        if (prefixo !== 'simulado' || !email) return null;
        return { email, nome: nome || email.split('@')[0] };
      }
      if (!clientId) return null;
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return null;
      const dados = await resp.json();
      if (dados.aud !== clientId || dados.email_verified !== 'true') return null;
      return { email: dados.email, nome: dados.name || dados.email };
    },
  };
}
