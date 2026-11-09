// Cliente da interface IRegistroServicos: cada serviço se registra no
// Serviço de Descoberta ao iniciar e renova o registro periodicamente.

const INTERVALO_RENOVACAO_MS = 10_000;

export async function registrarNaDescoberta({ nome, url, descobertaUrl }) {
  if (!descobertaUrl) return () => {};

  const enviar = async () => {
    try {
      const resp = await fetch(`${descobertaUrl}/servicos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, url }),
      });
      if (!resp.ok) console.warn(`[${nome}] descoberta respondeu ${resp.status}`);
    } catch (erro) {
      console.warn(`[${nome}] não foi possível falar com a descoberta (${descobertaUrl}): ${erro.message}`);
    }
  };

  await enviar();
  const timer = setInterval(enviar, INTERVALO_RENOVACAO_MS);
  timer.unref();

  return async () => {
    clearInterval(timer);
    try {
      await fetch(`${descobertaUrl}/servicos/${encodeURIComponent(nome)}?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
    } catch { /* descoberta fora do ar: o registro expira sozinho */ }
  };
}
