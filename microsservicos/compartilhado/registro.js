// Cliente da interface IRegistroServicos: cada serviço se registra no
// Discovery ao iniciar e renova o registro periodicamente.

const INTERVALO_RENOVACAO_MS = 10_000;

export async function registrarNoDiscovery({ nome, url, discoveryUrl }) {
  if (!discoveryUrl) return () => {};

  const enviar = async () => {
    try {
      const resp = await fetch(`${discoveryUrl}/servicos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, url }),
      });
      if (!resp.ok) console.warn(`[${nome}] Discovery respondeu ${resp.status}`);
    } catch (erro) {
      console.warn(`[${nome}] não foi possível falar com o Discovery (${discoveryUrl}): ${erro.message}`);
    }
  };

  await enviar();
  const timer = setInterval(enviar, INTERVALO_RENOVACAO_MS);
  timer.unref();

  return async () => {
    clearInterval(timer);
    try {
      await fetch(`${discoveryUrl}/servicos/${encodeURIComponent(nome)}?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
    } catch { /* Discovery fora do ar: o registro expira sozinho */ }
  };
}
