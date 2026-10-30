import { pgTable, serial, integer, text, boolean, unique, index, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { TZ_PADRAO } from '../lib/timezone.js';

/**
 * Passo 3 de docs/ARQUITETURA-MULTI-TENANT-V1.md §9.
 * Uma linha por barbearia. Toda tabela de dados aponta para cá.
 */
export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  /** Vira o subdomínio: {slug}.<DOMINIO_BASE> */
  slug: text('slug').notNull().unique(),
  /** Domínio próprio, quando o cliente paga por um. Nulo é o padrão. */
  domain: text('domain').unique(),
  businessName: text('business_name').notNull(),
  /**
   * trial | active | past_due | suspended (tirada do ar à mão) | cancelled.
   * ⚠️ Não é a fase de agora: teste vencido e carência vencida saem do TEMPO, em
   * `lib/situacao.ts` (migration 0007).
   */
  status: text('status', { enum: ['trial', 'active', 'past_due', 'suspended', 'cancelled'] }).notNull().default('active'),
  /** Fim do teste de 7 dias; a carência começa aqui. Obrigatório quando `trial`. */
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  /** Quando a cobrança falhou; a carência começa aqui. Obrigatório quando `past_due`. */
  pastDueSince: timestamp('past_due_since', { withTimezone: true }),
  /**
   * O fim da carência estendido pelo operador (migration 0016). Vale para o atraso
   * de `pastDueSince`: um gatilho do banco o apaga quando ele muda — pagou, ou
   * atrasou de novo. Lido por `situacaoDe`, em `lib/situacao.ts`.
   */
  carenciaAte: timestamp('carencia_ate', { withTimezone: true }),
  /**
   * A cobrança na Asaas (migration 0010, `lib/cobranca.ts`): o cliente, a assinatura
   * em vigor e os últimos 20 Checkouts. São as chaves com que os eventos do webhook
   * acham a barbearia — cada evento traz uma diferente. A assinatura é única; o
   * cliente não: o mesmo dono pode ter duas barbearias. Os Checkouts são lista: o
   * dono pode pagar num que não é o último que abriu.
   */
  asaasCustomerId: text('asaas_customer_id'),
  asaasSubscriptionId: text('asaas_subscription_id').unique(),
  asaasCheckoutIds: text('asaas_checkout_ids').array().notNull().default(sql`'{}'::text[]`),
  /** Assinatura cancelada: no ar até aqui, fora do ar depois. Nulo é o normal. */
  subscriptionEndsAt: timestamp('subscription_ends_at', { withTimezone: true }),
  /**
   * O fuso da barbearia (migration 0013): um dos 16 do Brasil, de
   * `FUSOS_DO_BRASIL` em `lib/timezone.ts`, que o banco também confere. Nasce do
   * estado no cadastro. Lido por `fusoDe(tenant)`, nunca direto.
   */
  timezone: text('timezone').notNull().default(TZ_PADRAO),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Os eventos do webhook da Asaas, crus, gravados antes de processar (migration
 * 0010). A `UNIQUE` em `(gateway, gatewayEventId)` é a idempotência.
 *
 * ⚠️ `tenantId` aceita nulo — a única tabela assim: o evento que não acha
 * barbearia fica guardado para alguém olhar. O papel do app não tem acesso; quem
 * lê e grava é o webhook, como dono (`lib/cobranca.ts`).
 */
export const webhookEvents = pgTable('webhook_events', {
  tenantId: integer('tenant_id').references(() => tenants.id),
  id: serial('id').primaryKey(),
  gateway: text('gateway').notNull().default('asaas'),
  gatewayEventId: text('gateway_event_id').notNull(),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  outcome: text('outcome'),
}, (t) => [
  unique('webhook_events_uma_vez').on(t.gateway, t.gatewayEventId),
]);

/**
 * O que o operador fez no painel `/operador` (migration 0012): entrou, estendeu o
 * teste, tirou do ar, reativou. O reativar lê daqui o status de antes da
 * suspensão — `tenants.status` já foi sobrescrito.
 *
 * ⚠️ `tenantId` aceita nulo, como em `webhookEvents`: a entrada no painel não é de
 * barbearia nenhuma. O papel do app não tem acesso; quem lê e grava é o painel do
 * operador, como dono (`lib/operadorBarbearias.ts`).
 */
export const acoesDoOperador = pgTable('acoes_do_operador', {
  tenantId: integer('tenant_id').references(() => tenants.id),
  id: serial('id').primaryKey(),
  // 'anotou' desde a 0014 (12/10/2026): a anotação do operador na ficha da barbearia.
  acao: text('acao', { enum: ['entrou', 'estendeu-teste', 'suspendeu', 'reativou', 'anotou'] }).notNull(),
  detalhe: jsonb('detalhe').notNull().default(sql`'{}'::jsonb`),
  ip: text('ip'),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
});

export const barbers = pgTable('barbers', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  role: text('role', { enum: ['admin', 'barber'] }).notNull(),
  passwordHash: text('password_hash').notNull(),
  /**
   * Telefone de login do painel — só dígitos, normalizado por `lib/phone.ts`.
   *
   * ⚠️ Único NO MUNDO, não por tenant (migration 0002). É o oposto do `slug`
   * logo acima, e de propósito: o painel é central, então é a unicidade global
   * do telefone que permite descobrir a barbearia a partir do login.
   *
   * Anulável porque os barbeiros que já existem não têm telefone cadastrado.
   */
  phone: text('phone'),
  /**
   * Para onde vão a recuperação de senha e os avisos do teste e da cobrança
   * (decisão de 08/10/2026). Não é login — o login é o telefone. Anulável: quem
   * entrou antes de o cadastro pedir não tem (migration 0006).
   */
  email: text('email'),
  active: boolean('active').notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
  /**
   * Última troca de senha. Sessão emitida antes disto não vale — é o que faz
   * trocar a senha tirar todo mundo de dentro (`lib/session.ts`, migration 0008).
   */
  senhaTrocadaEm: timestamp('senha_trocada_em', { withTimezone: true }),
  /**
   * Recebe e-mail quando um cliente agenda, desmarca ou remarca pelo site — o
   * barbeiro, dos horários dele; o dono, de todos (`lib/avisoDeAgenda.ts`,
   * migration 0011). Nasce ligado; o dono desliga por pessoa na tela da Equipe.
   */
  avisarAgendamentos: boolean('avisar_agendamentos').notNull().default(true),
  /**
   * Quando o e-mail de AGORA foi confirmado pelo link (migration 0019). Nulo: não
   * confirmado, e nada sai para ele além do próprio pedido de confirmação
   * (`lib/confirmacaoDeEmail.ts`). Trocar o e-mail volta para nulo.
   */
  emailConfirmadoEm: timestamp('email_confirmado_em', { withTimezone: true }),
}, (t) => [
  unique('barbers_tenant_slug_uq').on(t.tenantId, t.slug),
]);

/**
 * Os pedidos de "esqueci minha senha" (migration 0008). Guarda o HASH do token,
 * nunca o token: quem lesse a tabela não trocaria a senha de ninguém.
 */
export const redefinicoesDeSenha = pgTable('redefinicoes_de_senha', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  barberId: integer('barber_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  usadaEm: timestamp('usada_em', { withTimezone: true }),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Os links de confirmação de e-mail (migration 0019). Como a senha nova: o HASH do
 * token, nunca o token. `email` é o endereço para onde o link foi — o link confirma
 * esse, e morre se o e-mail do barbeiro mudar (`lib/confirmacaoDeEmail.ts`).
 */
export const confirmacoesDeEmail = pgTable('confirmacoes_de_email', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  barberId: integer('barber_id').notNull(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  usadaEm: timestamp('usada_em', { withTimezone: true }),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Os avisos por e-mail já mandados — a trava que impede o mesmo aviso de sair a
 * cada hora (`lib/avisos.ts`, migration 0008). Um por barbearia, tipo e prazo.
 */
export const avisosEnviados = pgTable('avisos_enviados', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  tipo: text('tipo').notNull(),
  referencia: timestamp('referencia', { withTimezone: true }).notNull(),
  enviadoEm: timestamp('enviado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('avisos_enviados_uma_vez').on(t.tenantId, t.tipo, t.referencia),
]);

export const services = pgTable('services', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  priceCents: integer('price_cents').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
}, (t) => [
  unique('services_tenant_slug_uq').on(t.tenantId, t.slug),
]);

export const barberServices = pgTable('barber_services', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  serviceId: integer('service_id').notNull().references(() => services.id),
  durationMinutes: integer('duration_minutes').notNull(),
  active: boolean('active').notNull().default(true),
}, (table) => [
  unique('uniq_barber_service').on(table.barberId, table.serviceId),
]);

export const workingHours = pgTable('working_hours', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  weekday: integer('weekday').notNull(), // 0=domingo, 1=segunda...6=sábado
  startTime: text('start_time').notNull(), // "HH:MM"
  endTime: text('end_time').notNull(),     // "HH:MM"
});

export const timeOff = pgTable('time_off', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  barberId: integer('barber_id').references(() => barbers.id), // null = vale pra todos (feriado)
  startsAt: text('starts_at').notNull(), // timestamp UTC ISO string
  endsAt: text('ends_at').notNull(),
  reason: text('reason'),
  createdBy: integer('created_by').notNull().references(() => barbers.id),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
});

export const appointments = pgTable('appointments', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  serviceId: integer('service_id').notNull().references(() => services.id),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerBirthdate: text('customer_birthdate'), // 'YYYY-MM-DD'; nullable pra registros antigos
  startsAt: text('starts_at').notNull(), // timestamp UTC ISO string
  endsAt: text('ends_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(), // snapshot no booking
  priceCents: integer('price_cents').notNull(),           // snapshot no booking
  status: text('status', { enum: ['confirmed', 'cancelled', 'completed', 'no_show'] })
    .notNull()
    .default('confirmed'),
  manageToken: text('manage_token').notNull().unique(),
  cancelledAt: text('cancelled_at'),
  cancelledBy: text('cancelled_by', { enum: ['customer', 'barber', 'admin'] }),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
  createdBy: text('created_by', { enum: ['customer', 'barber'] }).notNull().default('customer'),
  /** Quem fez a última modificação (cancel/reschedule/notes/customer edit) */
  lastModifiedById: integer('last_modified_by_id').references(() => barbers.id),
  lastModifiedAt:   text('last_modified_at'),
  /** Chave de idempotência pra evitar duplo booking */
  idempotencyKey:   text('idempotency_key'),
}, (table) => [
  index('appt_barber_date_idx').on(table.barberId, table.startsAt),
  index('appt_phone_idx').on(table.customerPhone),
]);

// Itens extras cobrados no fechamento do atendimento (a "comanda"): o que o
// cliente consumiu além do serviço agendado — ex.: agendou corte, fez barba também.
// priceCents e name são snapshot no momento do fechamento.
export const appointmentItems = pgTable('appointment_items', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  appointmentId: integer('appointment_id').notNull().references(() => appointments.id),
  serviceId: integer('service_id').references(() => services.id), // null = item avulso
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
}, (table) => [
  index('appt_items_appt_idx').on(table.appointmentId),
]);

// Venda de produto avulsa — produto vendido no balcão SEM estar ligado a um
// agendamento (ex.: cliente entra só pra comprar um óleo Boris). Entra no
// faturamento como "produto". priceCents é o total da linha (quantidade × unitário).
export const productSales = pgTable('product_sales', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  barberId: integer('barber_id').notNull().references(() => barbers.id),
  name: text('name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  priceCents: integer('price_cents').notNull(),
  soldAt: text('sold_at').notNull(), // timestamp UTC ISO string
  createdById: integer('created_by_id').notNull().references(() => barbers.id),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
}, (table) => [
  index('product_sales_sold_at_idx').on(table.soldAt),
  index('product_sales_barber_idx').on(table.barberId),
]);

// Catálogo de produtos (linha Boris) — gerenciável pelo barbeiro no admin.
// Alimenta os cards da landing, o combo e a venda avulsa. image é um caminho:
// /products/... (estático em public) ou /api/products/image/... (upload no volume).
export const products = pgTable('products', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  shortDesc: text('short_desc'),
  priceCents: integer('price_cents').notNull(),
  image: text('image'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
}, (table) => [
  index('products_active_idx').on(table.active),
  unique('products_tenant_slug_uq').on(table.tenantId, table.slug),
]);

// Combos do dia — gerenciáveis pelo barbeiro. Cada combo é um serviço + um produto
// fixos, com desconto próprio (discountPct), e aparece nos dias marcados em `weekdays`
// (bitmask: bit i = dia da semana i, 0=domingo … 6=sábado; 127 = todos os dias).
export const combos = pgTable('combos', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  serviceId: integer('service_id').notNull().references(() => services.id),
  productId: integer('product_id').notNull().references(() => products.id),
  discountPct: integer('discount_pct').notNull().default(10),
  weekdays: integer('weekdays').notNull().default(0),
  image: text('image'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
}, (table) => [
  index('combos_active_idx').on(table.active),
]);

// Reservas de produto — cliente reserva pelo site pra retirar na barbearia
// (sem serviço). O barbeiro vê a lista no admin e marca como retirado (vira
// venda no faturamento) ou cancela. Nome/preço são snapshot do momento da reserva.
export const reservations = pgTable('reservations', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id), // null se o produto for removido depois
  productName: text('product_name').notNull(),
  priceCents: integer('price_cents').notNull(), // unitário, snapshot
  quantity: integer('quantity').notNull().default(1),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  status: text('status', { enum: ['pending', 'fulfilled', 'cancelled'] }).notNull().default('pending'),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
  handledById: integer('handled_by_id').references(() => barbers.id),
  handledAt: text('handled_at'),
}, (table) => [
  index('reservations_status_idx').on(table.status),
]);

// Galeria do site — o carrossel "Portfólio". Fotos que o dono sobe pelo painel.
// `path` é o endereço público do original (`urlDeMidia('galeria', ...)`), e
// `widths` as larguras de WebP que existem ao lado dele: o srcset só lista o que
// existe. Ver `src/lib/galeria.ts` e a migration 0005.
export const galleryImages = pgTable('gallery_images', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: serial('id').primaryKey(),
  path: text('path').notNull(),
  widths: integer('widths').array().notNull().default(sql`'{}'::integer[]`),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
}, (table) => [
  index('gallery_images_tenant_sort_idx').on(table.tenantId, table.sortOrder),
]);

// Configuração da barbearia — LINHA ÚNICA, sempre id = 1.
// Colunas tipadas em vez de chave-valor: ver ARQUITETURA-PRODUTO-V1 D2. O custo
// aceito é uma migration por configuração nova.
// A fronteira entre isto e variável de ambiente está em D7: aqui mora o que o
// dono edita no painel; em env mora o que quebra o site se ele editar errado
// (DATABASE_PATH, SESSION_SECRET, SITE_URL, TZ).
//
// businessHours é o horário de VITRINE (texto de marketing). O horário que
// manda no agendamento continua sendo a tabela workingHours — as duas divergem
// legitimamente, e o caso do Bayron prova isso.
export const settings = pgTable('settings', {
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  id: integer('id').primaryKey(),
  businessName: text('business_name').notNull(),
  shortName: text('short_name').notNull(),
  tagline: text('tagline'),
  heroSubtitle: text('hero_subtitle'),
  aboutText: text('about_text'),
  whatsappNumber: text('whatsapp_number').notNull(),
  /** Como o número aparece ESCRITO na tela. Formatação de telefone é por país;
   *  guardar o texto pronto evita um formatador que erraria fora do Brasil. */
  whatsappDisplay: text('whatsapp_display'),
  instagramUrl: text('instagram_url'),
  instagramHandle: text('instagram_handle'),
  addressStreet: text('address_street').notNull(),
  addressCity: text('address_city').notNull(),
  mapsUrl: text('maps_url'),
  mapsEmbedQuery: text('maps_embed_query'),
  /** JSON de BusinessHour[] — ver src/lib/settings.ts */
  businessHours: text('business_hours').notNull().default('[]'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  // O par padrão é o `ACCENT_PADRAO` de `lib/accent.ts`. O hover era #0d9488 até a
  // migration 0009 (09/10/2026): mais claro que o botão, reprovava com texto branco.
  accentColor: text('accent_color').notNull().default('#0f766e'),
  accentHover: text('accent_hover').notNull().default('#0b5f58'),
  accentLight: text('accent_light').notNull().default('#5eead4'),
  /** Caminhos de mídia no volume — preenchidos na Fase 2. Null = usa o asset do build. */
  logoPath: text('logo_path'),
  heroPath: text('hero_path'),
  ogPath: text('og_path'),
  faviconPath: text('favicon_path'),
  googleReviewsUrl: text('google_reviews_url'),
  /** Texto, não número: preserva o "5.0" exatamente como é exibido. */
  googleRating: text('google_rating'),
  googleReviewCount: integer('google_review_count'),
  productsSectionTitle: text('products_section_title').notNull().default('Produtos'),
  updatedAt: text('updated_at').notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`),
  /**
   * A busca do mapa que o dono confirmou no painel (`lib/mapa.ts`, migration
   * 0011). O texto, não um "sim": o endereço mudou, a busca mudou, e o painel
   * pergunta de novo. Nulo é "nunca conferiu".
   */
  mapaConferido: text('mapa_conferido'),
}, (t) => [
  unique('settings_tenant_uq').on(t.tenantId),
]);
