/**
 * Preço para uma pessoa ler: "R$ 40", "R$ 39,90", "R$ 1.234,50".
 *
 * ⚠️ Nunca arredonde centavo para mostrar. Até 27/09/2026 cada tela fazia a própria
 * conta — `Math.round(c / 100)` no site, `toFixed(0)` na confirmação e na agenda —,
 * e o serviço de R$ 39,90 aparecia como R$ 40 em todas elas: o site anunciava um
 * preço que não era o cobrado (`PENDENCIAS-ABERTAS.md` §2.15). Visto ao vivo no
 * primeiro teste de ponta a ponta, no site, na confirmação do agendamento e na
 * agenda do dia.
 *
 * Valor redondo continua sem vírgula ("R$ 40", e não "R$ 40,00"): é como o site
 * sempre mostrou, e é como barbearia escreve preço.
 *
 * Roda no servidor e no navegador — não importe nada de servidor aqui.
 */
export function reais(centavos: number): string {
  const c = Math.round(Number(centavos) || 0);
  const temCentavos = c % 100 !== 0;
  const numero = (c / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: temCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `R$ ${numero}`;
}

/**
 * O que o dono digitou no campo de preço, em centavos: "39,90", "39.90" e "40"
 * valem. `NaN` quando não é número — quem chama decide a mensagem.
 *
 * ⚠️ `parseInt(valor) * 100` jogava os centavos fora: editar só o NOME de um
 * serviço de R$ 39,90 gravava R$ 39,00, sem aviso (`PENDENCIAS-ABERTAS.md` §2.15).
 */
export function centavosDoCampo(valor: string): number {
  const n = parseFloat(String(valor ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
