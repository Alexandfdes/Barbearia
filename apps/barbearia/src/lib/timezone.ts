/**
 * O fuso horário — o de CADA barbearia, desde 12/10/2026.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ──────────────────────────────────────────────
 *
 * `America/Fortaleza` estava escrito **24 vezes em 20 arquivos** como constante
 * de código (`PENDENCIAS-ABERTAS.md` §2.1). Não quebrava por coincidência:
 * Fortaleza é UTC−3, igual a São Paulo, Recife, Salvador e Rio.
 *
 * **Manaus e Cuiabá são UTC−4. O Acre é UTC−5.** Horário errado num sistema de
 * agendamento não aparece em log nem em teste: aparece no cliente que chega na
 * hora errada e culpa a barbearia.
 *
 * Em 10/09/2026 o fuso foi centralizado aqui, numa variável de ambiente
 * (`TZ_BARBEARIA`). Só que variável de ambiente vale para o PROCESSO, e desde o
 * passo 6 (`ARQUITETURA-MULTI-TENANT-V1.md` §9) um processo serve todas as
 * barbearias: com uma em Manaus e outra em Mossoró, uma das duas ficava com todo
 * horário deslocado, sem aviso nenhum.
 *
 * ── COMO FICOU ───────────────────────────────────────────────────────────────
 *
 * O fuso é uma coluna de `tenants` (migration 0013). Nasce do ESTADO que o dono
 * escolhe no cadastro (`fusoDoEstado`), ele troca em Configurações, e chega a
 * toda conta de data por `fusoDe(barbearia)` — síncrona, porque a linha de
 * `tenants` já está no cache de `lib/tenant.ts`. `TZ_BARBEARIA` não é mais lida.
 *
 * Não existe mais um `TZ` exportado daqui, de propósito: sem ele, todo lugar que
 * formatava data com o fuso do processo deixou de compilar e teve de dizer de
 * qual barbearia é a data. Fuso "padrão" calado é exatamente o defeito.
 *
 * ── POR QUE A LISTA É FECHADA, E POR QUE SÃO DEZESSEIS ───────────────────────
 *
 * Os fusos do Brasil da base da IANA (`zone.tab`), e só eles: o produto vende
 * para barbearia brasileira; lista fechada vira um select na tela em vez de um
 * campo onde "America/Manus" derrubaria toda formatação de data com um
 * `RangeError`. O banco faz valer a mesma lista (o CHECK da 0013).
 *
 * Dez deles dão hoje a mesma hora (UTC−3), e mesmo assim cada estado fica com o
 * seu: se o horário de verão voltar só para o Sul e o Sudeste, o
 * `America/Sao_Paulo` muda e o `America/Fortaleza` não — e cada barbearia fica
 * certa sozinha, com a atualização do sistema, sem migration.
 */

/**
 * O fuso das linhas de antes da 0013, de quem o cadastro não soube o estado e o
 * do relógio do OPERADOR (`/operador`). Não é o fuso de barbearia nenhuma:
 * barbearia tem o dela, por `fusoDe`.
 */
export const TZ_PADRAO = 'America/Fortaleza';

/** Os 16 fusos do Brasil, na ordem do select: do leste para o oeste. */
export const FUSOS_DO_BRASIL = [
  { id: 'America/Noronha',      rotulo: 'Fernando de Noronha' },
  { id: 'America/Sao_Paulo',    rotulo: 'Brasília — SP, RJ, MG, ES, PR, SC, RS, GO e DF' },
  { id: 'America/Fortaleza',    rotulo: 'CE, RN, PB, PI e MA' },
  { id: 'America/Recife',       rotulo: 'Pernambuco' },
  { id: 'America/Maceio',       rotulo: 'Alagoas e Sergipe' },
  { id: 'America/Bahia',        rotulo: 'Bahia' },
  { id: 'America/Araguaina',    rotulo: 'Tocantins' },
  { id: 'America/Belem',        rotulo: 'Pará (leste) e Amapá' },
  { id: 'America/Santarem',     rotulo: 'Pará (oeste, Santarém)' },
  { id: 'America/Manaus',       rotulo: 'Amazonas (Manaus e leste)' },
  { id: 'America/Cuiaba',       rotulo: 'Mato Grosso' },
  { id: 'America/Campo_Grande', rotulo: 'Mato Grosso do Sul' },
  { id: 'America/Porto_Velho',  rotulo: 'Rondônia' },
  { id: 'America/Boa_Vista',    rotulo: 'Roraima' },
  { id: 'America/Rio_Branco',   rotulo: 'Acre' },
  { id: 'America/Eirunepe',     rotulo: 'Amazonas (oeste, Eirunepé)' },
] as const;

export type FusoDoBrasil = (typeof FUSOS_DO_BRASIL)[number]['id'];

/**
 * Os 27 estados e o fuso de cada um — o que a IANA dá para a capital. Os três
 * estados com mais de um fuso (AM, PA e PE, com Noronha) ficam com o da capital,
 * e o dono troca em Configurações.
 */
export const ESTADOS = [
  { uf: 'AC', nome: 'Acre',                fuso: 'America/Rio_Branco' },
  { uf: 'AL', nome: 'Alagoas',             fuso: 'America/Maceio' },
  { uf: 'AP', nome: 'Amapá',               fuso: 'America/Belem' },
  { uf: 'AM', nome: 'Amazonas',            fuso: 'America/Manaus' },
  { uf: 'BA', nome: 'Bahia',               fuso: 'America/Bahia' },
  { uf: 'CE', nome: 'Ceará',               fuso: 'America/Fortaleza' },
  { uf: 'DF', nome: 'Distrito Federal',    fuso: 'America/Sao_Paulo' },
  { uf: 'ES', nome: 'Espírito Santo',      fuso: 'America/Sao_Paulo' },
  { uf: 'GO', nome: 'Goiás',               fuso: 'America/Sao_Paulo' },
  { uf: 'MA', nome: 'Maranhão',            fuso: 'America/Fortaleza' },
  { uf: 'MT', nome: 'Mato Grosso',         fuso: 'America/Cuiaba' },
  { uf: 'MS', nome: 'Mato Grosso do Sul',  fuso: 'America/Campo_Grande' },
  { uf: 'MG', nome: 'Minas Gerais',        fuso: 'America/Sao_Paulo' },
  { uf: 'PA', nome: 'Pará',                fuso: 'America/Belem' },
  { uf: 'PB', nome: 'Paraíba',             fuso: 'America/Fortaleza' },
  { uf: 'PR', nome: 'Paraná',              fuso: 'America/Sao_Paulo' },
  { uf: 'PE', nome: 'Pernambuco',          fuso: 'America/Recife' },
  { uf: 'PI', nome: 'Piauí',               fuso: 'America/Fortaleza' },
  { uf: 'RJ', nome: 'Rio de Janeiro',      fuso: 'America/Sao_Paulo' },
  { uf: 'RN', nome: 'Rio Grande do Norte', fuso: 'America/Fortaleza' },
  { uf: 'RS', nome: 'Rio Grande do Sul',   fuso: 'America/Sao_Paulo' },
  { uf: 'RO', nome: 'Rondônia',            fuso: 'America/Porto_Velho' },
  { uf: 'RR', nome: 'Roraima',             fuso: 'America/Boa_Vista' },
  { uf: 'SC', nome: 'Santa Catarina',      fuso: 'America/Sao_Paulo' },
  { uf: 'SP', nome: 'São Paulo',           fuso: 'America/Sao_Paulo' },
  { uf: 'SE', nome: 'Sergipe',             fuso: 'America/Maceio' },
  { uf: 'TO', nome: 'Tocantins',           fuso: 'America/Araguaina' },
] as const satisfies readonly { uf: string; nome: string; fuso: FusoDoBrasil }[];

export type UF = (typeof ESTADOS)[number]['uf'];

const IDS = new Set<string>(FUSOS_DO_BRASIL.map((f) => f.id));

/** É um dos 16 fusos do Brasil? É a mesma lista que o banco aceita. */
export function ehFusoDoBrasil(x: unknown): x is FusoDoBrasil {
  return typeof x === 'string' && IDS.has(x);
}

/** O fuso do estado, pela sigla ("rn" vale). Sigla desconhecida: `null`. */
export function fusoDoEstado(uf: string | null | undefined): FusoDoBrasil | null {
  const sigla = (uf ?? '').trim().toUpperCase();
  return ESTADOS.find((e) => e.uf === sigla)?.fuso ?? null;
}

const avisados = new Set<string>();

/**
 * O fuso da barbearia — o que toda conta de data usa.
 *
 * Fuso fora da lista não deveria existir (o CHECK da 0013 recusa): se aparecer,
 * cai no padrão e avisa no log, uma vez. Uma barbearia no fuso errado é ruim; o
 * painel inteiro em branco por um `RangeError` é pior.
 */
export function fusoDe(barbearia: { fuso?: string | null } | null | undefined): string {
  const fuso = barbearia?.fuso;
  if (ehFusoDoBrasil(fuso)) return fuso;
  if (fuso && !avisados.has(fuso)) {
    avisados.add(fuso);
    console.error(`[timezone] fuso "${fuso}" fora da lista do Brasil — usando ${TZ_PADRAO}.`);
  }
  return TZ_PADRAO;
}

/** O nome do fuso para gente: "Amazonas (Manaus e leste)". */
export function rotuloDoFuso(fuso: string): string {
  return FUSOS_DO_BRASIL.find((f) => f.id === fuso)?.rotulo ?? fuso;
}

/**
 * A distância de agora para o UTC, como o Intl calcula: "UTC−4". Calculada, não
 * escrita na lista, porque é ela que muda se o horário de verão voltar.
 */
export function deslocamento(fuso: string, agora: Date = new Date()): string {
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'shortOffset' })
    .formatToParts(agora)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(parte);
  if (!m) return 'UTC';
  return `UTC${m[1] === '-' ? '−' : '+'}${Number(m[2])}${m[3] ? `:${m[3]}` : ''}`;
}
