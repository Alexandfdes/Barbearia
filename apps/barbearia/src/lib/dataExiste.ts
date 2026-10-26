/**
 * A data `AAAA-MM-DD` existe no calendário? `new Date('2000-02-31')` vira 02/03 em
 * silêncio — e a data de nascimento gravada assim trancava o cliente fora da área dele
 * (26/10/2026). Compara as partes, sem passar por fuso nem por `toISOString`.
 */
export function dataExiste(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}
