// Estratégia de cálculo de notas da UFRPE (EstrategiaCalculoNotas).
// Mesma regra usada no app Focca (public/academic.js), agora no serviço:
//  - média das duas VAs >= 7 aprova direto;
//  - a 3ª VA substitui a menor nota, se for maior;
//  - abaixo de 7 após a 3ª VA, vai para a Final e (média + Final) / 2 >= 5 aprova.

const MEDIA_APROVACAO = 7;
const MEDIA_FINAL = 5;

const arred = v => Math.round(v * 100) / 100;

const DESCRICOES = {
  'notas-incompletas': 'Lance VA1 e VA2 para calcular a situação.',
  aprovado: 'Aprovado por média.',
  'precisa-va3': 'Média abaixo de 7: precisa fazer a 3ª VA.',
  'aprovado-va3': 'Aprovado após a 3ª VA.',
  'precisa-final': 'Média abaixo de 7 após a 3ª VA: precisa fazer a Final.',
  'aprovado-final': 'Aprovado na Final.',
  reprovado: 'Reprovado.',
};

/**
 * Calcula a situação acadêmica de uma disciplina a partir das notas.
 * Retorna sempre { etapa, descricao } e os números que se aplicam à etapa.
 */
export function calcularSituacao({ va1 = null, va2 = null, va3 = null, final = null } = {}) {
  const resultado = etapa => ({ etapa, descricao: DESCRICOES[etapa] });

  if (va1 == null || va2 == null) return resultado('notas-incompletas');

  const mediaInicial = (va1 + va2) / 2;
  if (mediaInicial >= MEDIA_APROVACAO) {
    return { ...resultado('aprovado'), mediaInicial: arred(mediaInicial) };
  }

  if (va3 == null) {
    // nota na 3ª VA que, substituindo a menor, leva a média a 7
    const notaNecessaria = Math.max(0, 2 * MEDIA_APROVACAO - Math.max(va1, va2));
    return { ...resultado('precisa-va3'), mediaInicial: arred(mediaInicial), notaNecessaria: arred(notaNecessaria) };
  }

  const substituiu = va3 > Math.min(va1, va2);
  const mediaAposVA3 = substituiu ? (Math.max(va1, va2) + va3) / 2 : mediaInicial;
  if (mediaAposVA3 >= MEDIA_APROVACAO) {
    return { ...resultado('aprovado-va3'), mediaInicial: arred(mediaInicial), mediaAposVA3: arred(mediaAposVA3), substituiu };
  }

  if (final == null) {
    const notaNecessaria = Math.max(0, 2 * MEDIA_FINAL - mediaAposVA3);
    return { ...resultado('precisa-final'), mediaInicial: arred(mediaInicial), mediaAposVA3: arred(mediaAposVA3), substituiu, notaNecessaria: arred(notaNecessaria) };
  }

  const mediaFinal = (mediaAposVA3 + final) / 2;
  return {
    ...resultado(mediaFinal >= MEDIA_FINAL ? 'aprovado-final' : 'reprovado'),
    mediaInicial: arred(mediaInicial),
    mediaAposVA3: arred(mediaAposVA3),
    substituiu,
    mediaFinal: arred(mediaFinal),
  };
}
