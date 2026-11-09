// Cálculo do resumo de frequência (mesma regra do app Focca, public/academic.js):
// frequência mínima de 75%, ou seja, o limite de faltas é 25% da carga horária,
// contando cada falta como 1 hora-aula.

const PERCENTUAL_LIMITE = 0.25;

const DESCRICOES = {
  'sem-chamada': 'Disciplina sem controle de chamada.',
  ok: 'Frequência em dia.',
  atencao: 'Já usou metade ou mais do limite de faltas.',
  risco: 'Já usou 75% ou mais do limite de faltas.',
  'reprovado-por-falta': 'Passou do limite de faltas.',
};

export function calcularResumoFrequencia({ cargaHoraria, temChamada = true, faltas = 0 }) {
  const usadas = Number(faltas || 0);
  if (!temChamada) {
    return { nivel: 'sem-chamada', descricao: DESCRICOES['sem-chamada'], faltas: usadas, limite: null, restantes: null, percentualUsado: 0, frequencia: null };
  }
  const limite = Math.floor(cargaHoraria * PERCENTUAL_LIMITE);
  const percentualUsado = limite ? Math.min(100, usadas / limite * 100) : 100;
  const nivel = usadas > limite ? 'reprovado-por-falta'
    : percentualUsado >= 75 ? 'risco'
    : percentualUsado >= 50 ? 'atencao'
    : 'ok';
  const frequencia = Math.max(0, (cargaHoraria - usadas) / cargaHoraria * 100);
  return {
    nivel,
    descricao: DESCRICOES[nivel],
    faltas: usadas,
    limite,
    restantes: Math.max(0, limite - usadas),
    percentualUsado: Math.round(percentualUsado * 10) / 10,
    frequencia: Math.round(frequencia * 10) / 10,
  };
}
