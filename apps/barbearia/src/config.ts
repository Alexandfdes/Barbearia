// src/config.ts
//
// Sobrou só o destino do botão de agendar. Até 09/10/2026 moravam aqui o
// WhatsApp, o Instagram, o endereço, o mapa e o horário do Bayron — o WhatsApp
// com o número falso de teste, `15551547238` (`PENDENCIAS-ABERTAS.md` §2.6) —, que
// nada mais importava desde que cada barbearia passou a ler os dela do banco
// (`lib/settings.ts`). Constante de marca em código é o que a regra 2 do
// `CLAUDE.md` proíbe; morta, ela só esperava alguém importar de novo.
//
// Antes, aqui ficava também o `SITE_URL`, o domínio do Bayron, usado como
// canonical, og:url e imagem de prévia de TODO site. Removido em 27/09/2026: o
// endereço de cada barbearia sai de `enderecoPublico()` (`src/lib/tenant.ts`).

/** Para onde vai o botão "Reservar horário" do site. */
export const TOPSALAO_URL = '/agendar';
