/**
 * Camada de leitura da configuração da barbearia (tabela `settings`, linha 1).
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
import { db } from '../db/index.js';
import { settings as settingsTable } from '../db/schema.js';
import { TENANT_UNICO } from './tenant.js';

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
 * Defaults do template. Só entram em cena se a linha 1 sumir — o que a migration
 * 0009 impede. Existem para o site nunca cair por causa de configuração ausente,
 * e são o embrião do template genérico que a Fase 6 vai usar ao provisionar.
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
  accentColor: '#0f766e',
  accentHover: '#0d9488',
  accentLight: '#5eead4',
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
 * Cache por tenant. Era uma variável só quando havia uma barbearia; virou mapa
 * porque com banco único cada tenant tem a própria linha de configuração.
 *
 * ⚠️ Continua sendo cache de PROCESSO. Com o adapter node standalone há um
 * processo e isso é trivialmente correto. Em múltiplos workers, cada um teria o
 * próprio mapa e um deles serviria valor velho até reiniciar.
 */
const cache = new Map<number, Settings>();

/**
 * Lê a linha crua de `settings` do tenant. É a ÚNICA consulta a essa tabela em
 * todo o projeto — regra 1 da skill: nada de `where(eq(settings.id, 1))` espalhado.
 */
export function lerSettingsRow(tenantId: number = TENANT_UNICO.id) {
  // HOJE: a linha é identificada pelo id fixo 1. No passo 3 isto vira
  // `where(eq(settingsTable.tenantId, tenantId))`.
  return db.select().from(settingsTable).where(eq(settingsTable.id, tenantId)).get();
}

/**
 * Grava campos em `settings` e invalida o cache do tenant.
 *
 * Existe para que nenhuma rota precise montar o `where` sozinha — foi assim que
 * seis consultas diretas apareceram espalhadas por três arquivos. Devolve false
 * quando não há linha para atualizar.
 */
export function atualizarSettings(
  updates: Record<string, unknown>,
  tenantId: number = TENANT_UNICO.id,
): boolean {
  const existe = db.select({ id: settingsTable.id })
    .from(settingsTable).where(eq(settingsTable.id, tenantId)).get();
  if (!existe) return false;

  db.update(settingsTable).set(updates).where(eq(settingsTable.id, tenantId)).run();
  invalidateSettings(tenantId);
  return true;
}

export function getSettings(tenantId: number = TENANT_UNICO.id): Settings {
  const emCache = cache.get(tenantId);
  if (emCache) return emCache;

  const row = lerSettingsRow(tenantId);

  if (!row) {
    console.error(
      '[settings] linha 1 ausente na tabela `settings`. Usando TEMPLATE_DEFAULTS. ' +
      'Isso indica migration 0009 não aplicada ou banco recriado sem seed.'
    );
    cache.set(tenantId, TEMPLATE_DEFAULTS);
    return TEMPLATE_DEFAULTS;
  }

  const parsed: Settings = {
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

  cache.set(tenantId, parsed);
  return parsed;
}

/**
 * Chamar em TODO endpoint que escreve em `settings` — o `atualizarSettings()`
 * acima já faz isso. Sem tenant, limpa tudo.
 */
export function invalidateSettings(tenantId?: number): void {
  if (tenantId === undefined) cache.clear();
  else cache.delete(tenantId);
}

/**
 * Link de WhatsApp da barbearia com mensagem opcional.
 * Substitui getWhatsAppUrl() do config.ts. Distinto de lib/whatsapp.ts, que monta
 * link para o telefone DO CLIENTE; aqui o destino é o número da loja.
 */
export function waUrl(message?: string, s: Settings = getSettings()): string {
  if (!s.whatsappNumber) return '';
  return message
    ? `https://wa.me/${s.whatsappNumber}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${s.whatsappNumber}`;
}
