/**
 * O fuso horário da barbearia — fonte única.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ──────────────────────────────────────────────
 *
 * `America/Fortaleza` estava escrito **24 vezes em 20 arquivos** como constante
 * de código (`PENDENCIAS-ABERTAS.md` §2.1). Hoje isso não quebra por
 * coincidência: Fortaleza é UTC-3 sem horário de verão, igual a São Paulo,
 * Recife, Salvador e Rio.
 *
 * **Manaus e Cuiabá são UTC-4. O Acre é UTC-5.** Vender para lá com o fuso
 * cravado produz horário errado em silêncio — o pior defeito possível num
 * sistema de agendamento, porque ninguém percebe até o cliente chegar na hora
 * errada e culpar a barbearia.
 *
 * ── ⚠️ ISTO AINDA NÃO SOBREVIVE AO MULTI-TENANT ──────────────────────────────
 *
 * Uma variável de ambiente vale para o processo inteiro. Enquanto cada barbearia
 * tem a própria instância, isso está certo. Quando o mesmo processo servir várias
 * barbearias (passo 6 de `ARQUITETURA-MULTI-TENANT-V1.md` §9), uma delas em
 * Manaus e outra em Mossoró, `process.env.TZ` passa a estar errado para uma das
 * duas.
 *
 * A correção definitiva é uma coluna `timezone` em `settings` e o fuso vindo do
 * tenant, como a cor de destaque já vem. Está registrado em
 * `PENDENCIAS-ABERTAS.md` §2.1.
 *
 * Centralizar aqui é o que torna essa mudança futura um arquivo, e não vinte.
 */

/** O padrão, e o fuso onde a única barbearia em produção opera hoje. */
export const TZ_PADRAO = 'America/Fortaleza';

/**
 * O fuso em uso. Lido do ambiente, com o padrão acima.
 *
 * Um valor inválido aqui derrubaria toda formatação de data do sistema com um
 * `RangeError` no meio de uma página. Preferimos cair no padrão e avisar no log
 * — uma barbearia no fuso errado é ruim; o painel inteiro em branco é pior.
 */
export const TZ: string = (() => {
  const doAmbiente = process.env.TZ_BARBEARIA?.trim();
  if (!doAmbiente) return TZ_PADRAO;

  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: doAmbiente });
    return doAmbiente;
  } catch {
    console.error(
      `[timezone] TZ_BARBEARIA="${doAmbiente}" não é um fuso válido (IANA, ex: America/Manaus). ` +
      `Usando ${TZ_PADRAO}.`
    );
    return TZ_PADRAO;
  }
})();
