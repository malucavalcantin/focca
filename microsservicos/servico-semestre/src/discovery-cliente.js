// Cliente do Discovery (interface IRegistroServicos).
// - registrar(): o serviço se registra ao iniciar e renova a cada 10 s.
// - localizar(): descobre o endereço de outro serviço pelo nome. Nenhum
//   endereço de outro serviço fica fixo no código: tudo passa pelo Discovery.

const INTERVALO_RENOVACAO_MS = 10_000;

export function criarClienteDiscovery(discoveryUrl) {
  const proxima = new Map(); // nome -> índice do rodízio (round-robin)

  async function localizar(nome) {
    if (!discoveryUrl) return null;
    try {
      const resp = await fetch(`${discoveryUrl}/servicos/${encodeURIComponent(nome)}`, { signal: AbortSignal.timeout(2000) });
      if (!resp.ok) return null;
      const { instancias } = await resp.json();
      const i = (proxima.get(nome) ?? 0) % instancias.length;
      proxima.set(nome, i + 1);
      return instancias[i];
    } catch {
      return null;
    }
  }

  async function registrar({ nome, url }) {
    if (!discoveryUrl) return async () => {};
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

  return { localizar, registrar };
}
