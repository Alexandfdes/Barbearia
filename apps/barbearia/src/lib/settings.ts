/**
 * Camada de leitura da configuração da barbearia (tabela `settings`, uma linha
 * por barbearia).
 *
 * Substitui o `src/config.ts`, que era hardcoded em código e é o que fazia este
 * repositório ser "o site do Bayron" em vez de um produto.
 * Ver docs/ARQUITETURA-PRODUTO-V1.md §6.
 *
 * ⚠️ CACHE (D3.1): o resultado é memoizado numa variável de módulo. Com o adapter
 * node standalone existe UM processo, então isso é trivialmente correto. Se algum
 * dia isto rodar em múltiplos workers, cada worker terá o próprio cache e um deles
 * servirá valor velho até reiniciar — nesse dia, troque por leitura direta ou por
 * invalidação via pub/sub. Todo endpoint que ESCREVE settings precisa chamar
 * invalidateSettings().
 *
 * ⚠️ PRERENDER (D3): qualquer rota que leia daqui precisa ser SSR. Se
 * `prerender = true`, o valor é congelado no build e o painel vira decoração.
 */
import { eq } from 'drizzle-orm';
import { db, first } from '../db/index.js';
import { settings as settingsTable } from '../db/schema.js';
import { tenantAtual, type Tenant } from './tenant.js';
import { waPhone } from './whatsapp.js';
import { ACCENT_PADRAO } from './accent.js';

export interface BusinessHour {
  label: string;
  hours: string;
  closed: boolean;
}

export interface Settings {
  businessName: string;
  shortName: string;
  tagline: string;
  heroSubtitle: string;
  aboutText: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  instagramUrl: string;
  instagramHandle: string;
  addressStreet: string;
  addressCity: string;
  mapsUrl: string;
  mapsEmbedQuery: string;
  businessHours: BusinessHour[];
  seoTitle: string;
  seoDescription: string;
  accentColor: string;
  accentHover: string;
  accentLight: string;
  logoPath: string | null;
  heroPath: string | null;
  ogPath: string | null;
  faviconPath: string | null;
  googleReviewsUrl: string;
  googleRating: string;
  googleReviewCount: number;
  productsSectionTitle: string;
}

/**
 * Defaults do template. Só entram em cena se a barbearia não tiver linha em
 * `settings` — o `getSettings` avisa no log quando isso acontece. Existem para o
 * site nunca cair por causa de configuração ausente.
 *
 * ⚠️ Até 09/10/2026 este comentário dizia que "a migration 0009" impedia a linha
 * de sumir: era a numeração do SQLite, que não existe mais. A `0009` de hoje
 * (`drizzle/0009_hover_padrao.sql`) é outra coisa.
 *
 * A cor é o par padrão do produto, `ACCENT_PADRAO` — até 09/10/2026 o hover daqui
 * era #0d9488, que reprova com o texto branco (`PENDENCIAS-ABERTAS.md` §4.12).
 */
export const TEMPLATE_DEFAULTS: Settings = {
  businessName: 'Barbearia',
  shortName: 'Barbearia',
  tagline: '',
  heroSubtitle: '',
  aboutText: '',
  whatsappNumber: '',
  whatsappDisplay: '',
  instagramUrl: '',
  instagramHandle: '',
  addressStreet: '',
  addressCity: '',
  mapsUrl: '',
  mapsEmbedQuery: '',
  businessHours: [],
  seoTitle: 'Barbearia',
  seoDescription: '',
  accentColor: ACCENT_PADRAO.color,
  accentHover: ACCENT_PADRAO.hover,
  accentLight: ACCENT_PADRAO.light,
  logoPath: null,
  heroPath: null,
  ogPath: null,
  faviconPath: null,
  googleReviewsUrl: '',
  googleRating: '',
  googleReviewCount: 0,
  productsSectionTitle: 'Produtos',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * D5 manda sanitizar o acento antes de interpolar num <style>. Fazemos isso já na
 * LEITURA, e não só na escrita: assim nenhum consumidor futuro pode injetar CSS
 * por esquecer de validar. Valor inválido cai no default em vez de vazar.
 */
function hex(value: string | null | undefined, fallback: string): string {
  return value && HEX.test(value) ? value : fallback;
}

export function parseBusinessHours(raw: string | null | undefined): BusinessHour[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h) => h && typeof h.label === 'string' && typeof h.hours === 'string')
      .map((h) => ({ label: h.label, hours: h.hours, closed: Boolean(h.closed) }));
  } catch {
    return [];
  }
}

/**
 * Cache por tenant (§5.4 do ARQUITETURA-MULTI-TENANT-V1.md).
 *
 * Era uma variável única, quando havia uma barbearia só. Com várias, guardar uma
 * settings global serviria a marca, as cores e o WhatsApp de uma barbearia no
 * site de outra — dependendo apenas de quem carregou primeiro.
 */
const cache = new Map<number, Settings>();

export async function getSettings(tenant: Tenant = tenantAtual()): Promise<Settings> {
  const guardado = cache.get(tenant.id);
  if (guardado) return guardado;

  const row = await first(db.select().from(settingsTable)
    .where(eq(settingsTable.tenantId, tenant.id)));

  if (!row) {
    console.error(
      `[settings] tenant ${tenant.id} (${tenant.slug}) sem linha em \`settings\`. ` +
      'Usando TEMPLATE_DEFAULTS. Indica barbearia criada sem a linha — a carga do SQLite ' +
      '(docs/ROTEIRO-MIGRACAO-PRODUCAO.md) ou o provisionamento não rodaram inteiros.'
    );
    cache.set(tenant.id, TEMPLATE_DEFAULTS);
    return TEMPLATE_DEFAULTS;
  }

  const montado: Settings = {
    businessName: row.businessName,
    shortName: row.shortName,
    tagline: row.tagline ?? '',
    heroSubtitle: row.heroSubtitle ?? '',
    aboutText: row.aboutText ?? '',
    whatsappNumber: row.whatsappNumber,
    whatsappDisplay: row.whatsappDisplay ?? '',
    instagramUrl: row.instagramUrl ?? '',
    instagramHandle: row.instagramHandle ?? '',
    addressStreet: row.addressStreet,
    addressCity: row.addressCity,
    mapsUrl: row.mapsUrl ?? '',
    mapsEmbedQuery: row.mapsEmbedQuery ?? '',
    businessHours: parseBusinessHours(row.businessHours),
    seoTitle: row.seoTitle ?? row.businessName,
    seoDescription: row.seoDescription ?? '',
    accentColor: hex(row.accentColor, TEMPLATE_DEFAULTS.accentColor),
    accentHover: hex(row.accentHover, TEMPLATE_DEFAULTS.accentHover),
    accentLight: hex(row.accentLight, TEMPLATE_DEFAULTS.accentLight),
    logoPath: row.logoPath ?? null,
    heroPath: row.heroPath ?? null,
    ogPath: row.ogPath ?? null,
    faviconPath: row.faviconPath ?? null,
    googleReviewsUrl: row.googleReviewsUrl ?? '',
    googleRating: row.googleRating ?? '',
    googleReviewCount: row.googleReviewCount ?? 0,
    productsSectionTitle: row.productsSectionTitle,
  };

  cache.set(tenant.id, montado);
  return montado;
}

/**
 * Chamar em TODO endpoint que escreve em `settings`. Sem isto, o painel salva e o
 * site continua mostrando o valor velho.
 *
 * Sem argumento limpa tudo — é o certo para teste e para migração. Com o tenant,
 * limpa só o dele: um cliente salvando não deve derrubar o cache dos outros.
 */
export function invalidateSettings(tenant?: Tenant): void {
  if (tenant) cache.delete(tenant.id);
  else cache.clear();
}

/**
 * Link de WhatsApp da barbearia com mensagem opcional.
 *
 * `s` é obrigatório: com o banco em Postgres o `await getSettings()` virou assíncrono e
 * não serve mais como valor padrão. E é o desenho certo — isto é formatador de
 * string, não deve fazer consulta. Quem chama já tem as settings em mãos.
 * Substitui getWhatsAppUrl() do config.ts. Distinto de lib/whatsapp.ts, que monta
 * link para o telefone DO CLIENTE; aqui o destino é o número da loja.
 */
export function waUrl(message: string | undefined, s: Settings): string {
  const numero = numeroDaLojaInternacional(s);
  if (!numero) return '';
  return message
    ? `https://wa.me/${numero}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${numero}`;
}

/**
 * O número da loja no formato que o wa.me e o schema.org exigem: com o código do
 * país na frente.
 *
 * ⚠️ Não confie que o banco já traz o 55. Barbearia criada pelo cadastro antes de
 * 27/09/2026 tem o número gravado sem ele, e o campo do painel aceita 10 dígitos.
 * Sem o 55, o wa.me lê o DDD como código de país — "84…" abria uma conversa com
 * um número do Vietnã.
 *
 * `waPhone` completa o 55 quando o número é brasileiro sem DDI e o mantém quando
 * já tem. O que não passa na regra brasileira volta como está: sumir com o botão
 * de quem hoje tem um número que funciona seria trocar um defeito por outro.
 */
export function numeroDaLojaInternacional(s: Pick<Settings, 'whatsappNumber'>): string {
  if (!s.whatsappNumber) return '';
  return waPhone(s.whatsappNumber) ?? s.whatsappNumber;
}
