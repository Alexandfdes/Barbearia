/**
 * Normalização canônica de telefone BR — fonte única de verdade.
 *
 * Regra: só dígitos; se vier com DDI (>11 dígitos), mantém os últimos 11.
 * Telefones válidos têm 10 (fixo) ou 11 (celular) dígitos.
 * Retorna '' quando não há dígitos suficientes — quem chama decide rejeitar.
 *
 * IMPORTANTE: a coluna appointments.customer_phone armazena SEMPRE o valor
 * normalizado (migration 0004). Toda escrita deve passar por aqui; toda
 * leitura compara com `customer_phone = ?` direto (índice appt_phone_idx).
 */
export function normalizePhone(input: string | null | undefined): string {
  let d = (input ?? '').replace(/\D/g, '');
  // DDI 55 explícito: 12 dígitos = 55+fixo, 13 = 55+celular.
  // (slice(-11) cego erraria o fixo com DDI: manteria o "5" sobrando.)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  // Formato exótico (>11 mesmo sem DDI 55): melhor esforço, últimos 11.
  if (d.length > 11) d = d.slice(-11);
  if (d.length < 10) return '';
  return d;
}

/**
 * Telefone BR para uma pessoa ler: "(84) 99665-8951" ou "(84) 3333-4444".
 *
 * O cadastro gravava o texto do jeito que o dono digitou, e "84996658951" saía
 * assim, cru, no rodapé do site (achado em 27/09/2026, testando o autoatendimento).
 * Número que não normaliza volta como veio: formatar é enfeite, não validação.
 */
export function formatarTelefone(input: string | null | undefined): string {
  const d = normalizePhone(input);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return (input ?? '').trim();
}

/**
 * Celular gravado sem o 9 da frente: 10 dígitos cujo número local começa de 6 a 9. Desde 2016 todo
 * celular do Brasil tem 9 dígitos depois do DDD; fixo começa de 2 a 5 e continua com 8.
 *
 * O cadastro aceitava "(84) 9965-8951" como fixo (25/11/2026, no teste em produção): o login procura
 * o número exatamente como foi gravado, e o dono que digitasse o certo, com o 9, não entrava — e o
 * mesmo celular virava DUAS contas, uma com e outra sem o 9, furando a trava de telefone repetido.
 */
export function celularSemONove(digitos: string): boolean {
  return /^\d{2}[6-9]\d{7}$/.test(digitos);
}

/** O mesmo celular, como ele é: com o 9 depois do DDD. Para mostrar na recusa. */
export function comONove(digitos: string): string {
  return `${digitos.slice(0, 2)}9${digitos.slice(2)}`;
}

/** A recusa de quem digitou o celular sem o 9 — o número certo, já escrito. */
export function recusaDoCelularSemONove(digitos: string): string {
  const certo = comONove(digitos);
  return `Celular tem o 9 na frente: ${formatarTelefone(certo)}.`;
}

/**
 * As formas de um telefone de login: ele mesmo e, se for celular, a outra — com ou sem o 9. É por
 * elas que o login e a senha esquecida acham quem ficou gravado sem o 9 antes de 25/11/2026, e que
 * o cadastro reconhece o mesmo celular digitado das duas formas.
 */
export function formasDoTelefone(digitos: string): string[] {
  if (celularSemONove(digitos)) return [digitos, comONove(digitos)];
  if (/^\d{2}9[6-9]\d{7}$/.test(digitos)) return [digitos, `${digitos.slice(0, 2)}${digitos.slice(3)}`];
  return digitos ? [digitos] : [];
}
