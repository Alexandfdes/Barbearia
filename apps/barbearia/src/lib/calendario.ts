/**
 * Contas de calendário sobre datas 'YYYY-MM-DD' que JÁ SÃO LOCAIS — o dia na
 * barbearia, convertido com o `TZ` de `lib/timezone.ts` no servidor, ou pelo
 * `Intl` com o fuso que desce pela página no navegador.
 *
 * Nenhuma função daqui recebe instante, e é isso que as deixa livres de fuso: a
 * conta é feita ao meio-dia UTC, que cai no mesmo dia do calendário em qualquer
 * fuso entre −11 e +12, e o relógio de quem roda o processo nunca entra —
 * `getUTCDay`, nunca `getDay`.
 *
 * ⚠️ Ler o dia de um INSTANTE com `getDay()` ou `setDate()` usa o fuso do
 * processo. Com o servidor em UTC, das 21h à meia-noite de Fortaleza o painel
 * achava a segunda-feira da semana errada (`PENDENCIAS-ABERTAS.md` §2.22). Primeiro
 * o dia no fuso da barbearia; depois, as contas daqui.
 *
 * Sem dependência nenhuma: serve ao servidor e ao script da página.
 */

function meioDiaUtc(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

function paraData(d: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
}

/** O dia da semana: 0 = domingo … 6 = sábado, como o `weekday` do expediente. */
export function diaDaSemana(data: string): number {
  return meioDiaUtc(data).getUTCDay();
}

/** `n` dias depois (ou antes, com `n` negativo). */
export function somarDias(data: string, n: number): string {
  const d = meioDiaUtc(data);
  d.setUTCDate(d.getUTCDate() + n);
  return paraData(d);
}

/** A segunda-feira da semana da data. Domingo é o último dia da semana dele. */
export function segundaFeiraDaSemana(data: string): string {
  const dia = diaDaSemana(data);
  return somarDias(data, dia === 0 ? -6 : 1 - dia);
}
