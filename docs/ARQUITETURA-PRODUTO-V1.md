# Arquitetura — Produtização V1 (multi-instância)

> Especificação técnica. Data: 2026-08-27.
> Status: **parcialmente substituído.**
>
> ⚠️ **A decisão D1 deste documento foi REVERTIDA em 01/09/2026.** Ele escolhia
> instância por cliente e rejeitava multi-tenant; hoje o produto é multi-tenant com
> banco único. Quem manda é `ARQUITETURA-MULTI-TENANT-V1.md`, que substitui a **D1
> inteira**, a **D3.1** (cache de settings) e o gatilho de 15–25 clientes.
>
> **O resto continua valendo** — D2 a D7 (tabela `settings`, SSR, mídia em volume,
> cor de destaque, fronteira entre env e settings) são decisões vivas.
> Decisão de negócio e go-to-market: ver `docs/PLANO-PRODUTIZACAO.md`.
> O que ainda **não** está decidido: ver `docs/PENDENCIAS-ABERTAS.md`.
>
> Todas as afirmações sobre o código atual neste documento foram verificadas
> arquivo por arquivo. Referências no formato `arquivo:linha` são literais.

## 1. Objetivo

Transformar o sistema — hoje sob medida para a Barbearia Bayron — em um produto que
atenda N barbearias, **sem fork de código**.

**Princípio inegociável:** uma base de código, uma imagem Docker, N instâncias. A
diferença entre a Barbearia X e a Barbearia Y vive em dois lugares e em nenhum outro:

1. o conteúdo do volume dela (SQLite + uploads);
2. um punhado de variáveis de ambiente do container.

Se alguma diferença entre clientes exigir tocar em `src/`, a arquitetura falhou.

## 2. O que já está pronto e não muda

Vale registrar para ninguém "refatorar por refatorar":

- `src/db/index.ts` lê `DATABASE_PATH` do ambiente e abre o SQLite no load do módulo.
  **Já é multi-instância** — um container, um volume, uma barbearia.
- `scripts/startup.mjs` aplica migrations no boot do container. Serve como está.
- `src/lib/uploads.ts` grava no mesmo volume do banco e `src/pages/api/products/image/[name].ts`
  serve o arquivo em runtime. **O padrão de mídia dinâmica já existe e funciona** — só
  precisa ser generalizado.
- Toda a lógica de negócio (slots, booking, ocupação, sessão, rate limit, relatórios)
  é agnóstica de marca. Nada disso entra no escopo.
- Backup diário + upload off-site (B2) já funciona por instância.

## 3. Auditoria — o que hoje impede a multi-instância

Levantamento completo. Nada aqui é suposição.

### 3.1 Configuração hardcoded em código

| Local | Conteúdo |
|---|---|
| `src/config.ts:6` | `WHATSAPP_NUMBER = "15551547238"` — **número de teste americano** |
| `src/config.ts:11` | `SITE_URL = "https://bayron.alexandrefdev.tech"` |
| `src/config.ts:14` | `INSTAGRAM_URL` |
| `src/config.ts:17-20` | `ADDRESS` (rua, cidade) |
| `src/config.ts:23` | `GOOGLE_MAPS_URL` |
| `src/config.ts:26-30` | `BUSINESS_HOURS` |

### 3.2 Marca hardcoded fora do config

| Local | Conteúdo |
|---|---|
| `src/layouts/Layout.astro:11-12` | title e description default |
| `src/layouts/Layout.astro:29,34` | `og:site_name`, `og:image:alt` |
| `src/layouts/Layout.astro:44-72` | JSON-LD: nome, telefone, endereço, horários |
| `src/components/Header.astro:24` | texto "Bayron" |
| `src/components/Footer.astro:33,39,160` | nome, texto institucional, copyright |
| `src/components/Gallery.astro:23` | `HANDLE = '@barbearia_bayron'` |
| `src/components/Location.astro:88-89` | embed do Google Maps com query fixa |
| `src/components/Testimonials.astro:5-7` | `GOOGLE_REVIEWS_URL`, `RATING = 5.0`, `REVIEW_COUNT = 227` |
| `src/components/Products.astro:12` | título "Produtos Boris" |
| `src/components/Services.astro:8-46` | **catálogo curado inteiro** — ver §3.4.1 |
| `src/layouts/AdminLayout.astro:24,41` | "Bayron Admin" |
| `src/pages/agendar.astro:7-8,24` | title, description, nome no cabeçalho |

> **Inconsistência encontrada:** `Layout.astro:49` tem o telefone **real**
> (`+5584999051196`) no JSON-LD, enquanto `config.ts:6` tem o número de teste. Os CTAs
> de WhatsApp do site apontam para o número errado; o schema.org aponta para o certo.

### 3.3 Assets processados em build time

Estes usam `astro:assets` / `import.meta.glob` e **não podem** ser por cliente:

| Local | Asset |
|---|---|
| `src/components/Header.astro:4` | `../assets/Logo-Bayron3.png` |
| `src/components/Footer.astro:4` | `../assets/Logo-Bayron3.png` |
| `src/components/Hero.astro:4` | `../assets/fotos-videos/foto-inicial5.png` |
| `src/components/Gallery.astro:5` | `../assets/Logo-Bayron3-256.png` |
| `src/components/Gallery.astro:7-10` | `import.meta.glob('../assets/fotos-videos/carrosel*.jpg')` |
| `public/og.jpg`, `public/favicon.svg`, `public/favicon.ico` | assados na imagem Docker |

### 3.4 Conteúdo em arquivo estático

- `src/data/depoimentos.json` — importado em build time por `Testimonials.astro:2`.
- `src/data/faq.json` — importado em build time pelo FAQ.
  (Conteúdo desatualizado: ainda cita "TopSalão". Não levar para o template default.)

### 3.4.1 O catálogo curado do `Services.astro` — o maior buraco de conteúdo

`src/components/Services.astro:8-46` carrega, **em código**, o catálogo comercial inteiro:

- 3 categorias (`Cortes Individuais`, `Barba Individual`, `Adicionais`) com 15 serviços;
- 5 "combos" com preço "de/por" (`originalPrice`);
- **nome, slug, preço de fallback e descrição** de cada um.

O comentário em `Services.astro:4-7` explica o arranjo atual: o preço é apenas fallback e
um `<script>` (`:132`) busca `/api/services/prices` para sobrescrever com o valor do
banco em runtime. Mas **categoria, descrição, ordenação e o preço-âncora dos combos não
existem no schema** — só no componente.

Verificado: os 5 "combos" exibidos (`navalhado-barba`, `social-barba`, `degrade-barba`,
`degrade-barba-hidratacao`, `navalhado-pigmentacao`) **já são linhas da tabela
`services`**. Não são os `combos` do banco (esses são serviço + produto do dia). São
serviços comuns renderizados num bloco visual separado por causa do `originalPrice`.

Consequência: não basta parametrizar strings. Falta **modelo de dados de apresentação**
para os serviços — é o item de conteúdo mais pesado da produtização, maior que
depoimentos e FAQ somados. Tratado na D6.1 e na Fase 3.

Verificado também: `/api/services/prices` tem **exatamente um consumidor**, o script do
próprio `Services.astro`. Com o componente renderizando do banco em SSR, o script e o
endpoint viram código morto e devem ser removidos na mesma fase.

### 3.5 Prerender — a armadilha central

Auditoria completa das flags:

- `src/pages/index.astro:2` → `prerender = true`
- `src/pages/agendar.astro` → `prerender = true`
- `src/pages/404.astro` → `prerender = true`
- Todas as demais rotas → `prerender = false`

**Consequência:** se as configurações forem para o banco sem mexer nisso, a landing lê o
banco **em build time**. O barbeiro mudaria o telefone no painel e o site continuaria
mostrando o antigo até um rebuild do container. Este é o erro mais fácil de cometer
neste refactor.

### 3.6 Seed engessado

`scripts/seed.mjs` hardcoda os 3 barbeiros do Bayron (`:76-78`), os 20 serviços dele
(`:89-113`) e o expediente 09:00–20:00 / sáb 09:00–18:00 (`:142-152`).

> **Observação de projeto:** o expediente real do Bayron no banco é 08:00–11:00 e
> 14:00–19:00, diferente tanto do seed quanto do `BUSINESS_HOURS` do `config.ts`. Isso
> confirma que **horário de vitrine e horário de agenda são coisas distintas** — decisão
> D7 abaixo.

## 4. Decisões de arquitetura

### D1 — Uma instância por cliente, não multi-tenant

> ⚠️ **REVERTIDA em 01/09/2026.** O produto é multi-tenant com banco único e RLS.
> Ver `ARQUITETURA-MULTI-TENANT-V1.md`. O texto abaixo fica como registro do
> raciocínio original — serve para não refazer o debate, não para orientar código novo.

Container + volume por barbearia. Sem `tenant_id`, sem refactor dos 47 endpoints,
isolamento de dados de graça. Revisar por volta de 15–25 clientes.

**Rejeitado:** multi-tenant agora (meses de trabalho, risco novo de vazamento entre
lojas, zero clientes para justificar). Fork por cliente (ver `PLANO-PRODUTIZACAO.md` §2).

### D2 — Tabela `settings` de linha única, com colunas tipadas

Uma tabela `settings` com `id = 1` fixo e uma coluna por configuração.

**Rejeitado:** chave-valor (`settings(key, value)`). Perde tipagem, tudo vira string,
chave errada falha em silêncio. O projeto inteiro é tipado (Drizzle + Zod + TS) e já
paga o custo de uma migration por mudança de schema (8 migrations até aqui). Manter a
disciplina existente.

Custo aceito: cada configuração nova exige migration.

### D3 — Landing e agendar passam a SSR

`prerender = true` → `false` em `src/pages/index.astro` e `src/pages/agendar.astro`.

Sem isso, D2 não funciona (§3.5). O custo é render no servidor a cada visita — para uma
landing de barbearia, com leitura de SQLite local em microssegundos e cache de processo
(D2.1 abaixo), é irrelevante.

`404.astro` pode continuar prerenderizado **desde que** o `Layout` tenha fallback
estático quando não houver settings — ou flipar também. Preferir flipar: mais simples,
e é a política que o `astro.config.mjs` já documenta como padrão do projeto.

#### D3.1 — Cache de settings em memória

`getSettings()` memoiza em variável de módulo; o endpoint de escrita chama
`invalidateSettings()`. Com o adapter node standalone há um único processo, então é
trivialmente correto.

⚠️ Se algum dia rodar em múltiplos workers/processos, este cache quebra (um worker
serve valor velho). Documentar no código.

### D4 — Mídia do cliente em runtime, otimizada no upload

Assets por barbearia (logo, hero, og, favicon, galeria) saem de `src/assets/` e passam a
viver no volume, servidos por rota de API — exatamente o padrão que
`api/products/image/[name].ts` já usa.

Perde-se o `<Image>` do `astro:assets` (srcset/WebP automáticos) para essas imagens.
Compensa-se gerando as variantes **no momento do upload** com `sharp`: 640/1280/1920 em
WebP, mais o original. O hero é o elemento LCP da landing — não dá para servir um JPEG
de 4 MB do celular do barbeiro.

#### D4.1 — O usuário mais frequente do upload é você, não o barbeiro

O modelo comercial cobra a **implantação** como serviço (ver
`PLANO-PRODUTIZACAO.md` §6.1): quem sobe as ~20 fotos iniciais de cada cliente é quem
está vendendo. Isso muda o requisito da tela de upload:

- **Upload em lote é obrigatório**, não conveniência. Arrastar 20 arquivos de uma vez,
  com corte e otimização automáticos. Uma-a-uma são 20 idas ao servidor por cliente,
  multiplicadas por cada barbearia — é tempo de implantação queimado, que sai do seu
  bolso.
- **O cliente também precisa conseguir.** Mesmo com a implantação assistida, trocar foto
  pelo painel tem que ser trivial: é argumento de venda ("o site é seu") e evita virar
  o gargalo de toda troca de foto às 21h de sábado.
- **Não construir importação automática do Instagram.** A API é cara de manter e a
  operação acontece poucas vezes por mês; baixar na mão é mais rápido que manter a
  integração viva. Registrado como não-objetivo na §10.

⚠️ **`sharp` está hoje em `devDependencies`** (`package.json`). Funciona em produção por
acidente: o `Dockerfile` roda `npm ci` (que instala devDeps) e copia o `node_modules`
inteiro para o estágio de runtime. Ao passar a depender dele em runtime, **mover para
`dependencies`**.

### D5 — Tema por sobrescrita de CSS variable em runtime

Uma cor de destaque configurável por cliente, injetada como `<style>` inline no
`Layout.astro`:

```html
<style set:html={`:root{--color-teal:${s.accent};--color-teal-hover:${s.accentHover};--color-teal-light:${s.accentLight}}`}></style>
```

**Verificado no build real** (`dist/client/_astro/global.*.css`): o Tailwind v4 compila
`.bg-teal{background-color:var(--color-teal)}` e emite `--color-teal:#0f766e` em
`:root`. Sobrescrever a variável depois retinge todas as utilities derivadas dela, sem
rebuild.

Escopo deliberadamente estreito: **só o acento é configurável.** A escala neutra/dark
fica fixa. Barbeiro escolhendo 12 cores produz site feio e vira suporte.

Sanitizar o valor (regex de hex) antes de interpolar — é injeção de CSS caso contrário.

### D6 — Conteúdo editorial vai para tabelas

`depoimentos.json` → tabela `testimonials`. `faq.json` → tabela `faq_items`. Galeria →
tabela `gallery_images`. Todas com CRUD no admin, no mesmo padrão de `produtos` e
`combos`, que já existe e funciona.

#### D6.1 — Apresentação dos serviços vira coluna, não tabela nova

O catálogo de §3.4.1 é resolvido **estendendo `services`**, não criando tabela. Os dados
já estão lá; falta só a camada de apresentação: `category`, `description`, `sort_order`,
`original_price_cents` e `show_on_site`.

O bloco "combos" da landing passa a ser simplesmente *os serviços com
`original_price_cents` preenchido*, e as três categorias viram agrupamento por
`category`. Os dois blocos de render colapsam num só, dirigido por dados.

**Rejeitado:** tabela `service_categories` com FK. Barbearia tem 3–5 categorias que
mudam quase nunca; uma tabela extra e um join só para guardar um título é complexidade
sem retorno. Se um dia precisar de ordenação de categoria independente, promove-se depois.

#### D5.1 — A regra deste site é o INVERSO da do site de vendas

Registrado porque copiar a regra de um para o outro produz botão ilegível:

| | Site de vendas (`C:\DEV\produto`) | Site da barbearia (este repo) |
|---|---|---|
| Preenchimento do botão | claro (verde) | **escuro** (acento) |
| Texto em cima | grafite | **branco** |
| Hover | **clareia** (aumenta contraste com grafite) | **escurece** (aumenta contraste com branco) |
| Cor de marca que "já serve" | clara | **escura** |

Consequência prática: vinho `#6b1f2a` e marinho `#1b2a5a` passam de cara aqui
(11,32:1 e 13,77:1 com branco) e reprovariam no site de vendas. Dourado `#c9a227` e
laranja `#e8721c` são o contrário — reprovam aqui (2,42:1 e 3,06:1) e precisam escurecer.

> ⚠️ O valor atual de `--color-teal-hover` (`#0d9488`) dá só **3,74:1** com branco:
> ele clareia, e clarear piora o contraste do texto branco. `src/lib/accent.ts`
> corrige isso derivando o hover para baixo.

#### D5.2 — A cor sai da logo, mas nunca é aplicada crua

`src/lib/accent.ts` deriva os três tokens (`--color-teal`, `-hover`, `-light`) de
**uma** cor de marca. A matiz é preservada; só a luminosidade é ajustada.

Três casos, todos com teste:

1. **Logo em escala de cinza** (preto, branco, cinza — comum em barbearia):
   devolve o acento padrão. **Não inventa matiz** — forçar saturação em cinza
   transforma logo preta em rosa.
2. **Cor que já passa**: mantida sem alteração.
3. **Cor clara demais**: escurecida o mínimo necessário para o branco passar.

A `light` é derivada à parte, porque ela vira **texto** sobre as superfícies escuras
— é validada contra a mais clara delas (`#222222`).

**A derivação acontece na ESCRITA, não na leitura.** O painel deriva uma vez quando a
cor é escolhida e grava os três valores; o `Layout` só lê e sanitiza. Derivar a cada
render seria custo por requisição sem ganho.

⚠️ **Limite honesto:** quanto mais clara a marca, mais o acento se afasta dela.
Dourado `#c9a227` vira `#8d721b`. Por isso a extração da logo **sugere e o operador
aprova** na implantação, com o campo editável no painel — não aplica sozinha.

### D7 — Fronteira entre env e settings

| Vai para **env** | Vai para **settings** (painel) |
|---|---|
| `DATABASE_PATH` | nome, telefone/WhatsApp, Instagram |
| `SESSION_SECRET` | endereço, link do Maps, embed |
| `TZ` | horário de vitrine, textos, SEO |
| `SITE_URL` | cor de destaque, logo, hero, og |
| vars de backup/S3 | depoimentos, FAQ, galeria |

`SITE_URL` fica em env de propósito: alimenta canonical e `og:image`, precisa bater com
o domínio real, e barbeiro editando isso quebra o SEO do próprio site sem perceber.

**Horário de vitrine ≠ horário de agenda.** `settings.businessHours` é texto de
marketing; `working_hours` continua sendo a verdade do agendamento. O caso do Bayron
(§3.6) prova que divergem legitimamente.

## 5. Schema novo

Migration `0009_settings.sql` (próximo índice livre — o journal vai até `0008_reservations`).

```sql
CREATE TABLE `settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `business_name` text NOT NULL,
  `short_name` text NOT NULL,
  `tagline` text,
  `about_text` text,
  `whatsapp_number` text NOT NULL,
  `instagram_url` text,
  `instagram_handle` text,
  `address_street` text NOT NULL,
  `address_city` text NOT NULL,
  `maps_url` text,
  `maps_embed_query` text,
  `business_hours` text NOT NULL DEFAULT '[]',
  `seo_title` text,
  `seo_description` text,
  `accent_color` text NOT NULL DEFAULT '#0f766e',
  `accent_hover` text NOT NULL DEFAULT '#0d9488',
  `accent_light` text NOT NULL DEFAULT '#5eead4',
  `logo_path` text,
  `hero_path` text,
  `og_path` text,
  `favicon_path` text,
  `google_reviews_url` text,
  `google_rating` text,
  `google_review_count` integer,
  `products_section_title` text NOT NULL DEFAULT 'Produtos',
  `updated_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `testimonials` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `rating` integer NOT NULL DEFAULT 5,
  `text` text NOT NULL,
  `date_label` text,
  `active` integer NOT NULL DEFAULT 1,
  `sort_order` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `faq_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `active` integer NOT NULL DEFAULT 1,
  `sort_order` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `gallery_images` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `path` text NOT NULL,
  `alt` text,
  `active` integer NOT NULL DEFAULT 1,
  `sort_order` integer NOT NULL DEFAULT 0
);
```

Migration `0010_services_presentation.sql`:

```sql
ALTER TABLE `services` ADD `description` text;
--> statement-breakpoint
ALTER TABLE `services` ADD `category` text;
--> statement-breakpoint
ALTER TABLE `services` ADD `original_price_cents` integer;
--> statement-breakpoint
ALTER TABLE `services` ADD `sort_order` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `services` ADD `show_on_site` integer NOT NULL DEFAULT 1;
```

`business_hours` guarda o JSON no formato já consumido pelo Footer e pela Location
(`{label, hours, closed}[]`), evitando reescrever esses componentes.

A inicial do avatar do depoimento (`initial` no JSON atual) passa a ser derivada do
`name` em render — não é dado, é apresentação.

## 6. Camada de acesso

Arquivo novo `src/lib/settings.ts`:

```ts
export interface Settings { /* espelha as colunas, com tipos */ }
export function getSettings(): Settings      // memoizado, com defaults
export function invalidateSettings(): void   // chamado no PATCH
export function waUrl(s: Settings, msg: string): string
```

`src/config.ts` **não é deletado de imediato.** Vira o arquivo de *defaults do template*
(valores usados ao provisionar uma barbearia nova) e some quando o último import cair.
Isso mantém o refactor incremental e a instância do Bayron no ar durante toda a transição.

## 7. Endpoints novos

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/admin/settings` | admin | lê a linha 1 |
| `PATCH` | `/api/admin/settings` | admin | atualiza (Zod) + `invalidateSettings()` |
| `POST` | `/api/admin/settings/media` | admin | upload de logo/hero/og/favicon |
| `GET/POST/PATCH/DELETE` | `/api/admin/testimonials[/:id]` | admin | CRUD |
| `GET/POST/PATCH/DELETE` | `/api/admin/faq[/:id]` | admin | CRUD |
| `GET/POST/PATCH/DELETE` | `/api/admin/gallery[/:id]` | admin | CRUD + reordenar |
| `GET` | `/api/media/[...path]` | público | serve mídia do volume |

⚠️ **Compatibilidade:** manter `/api/products/image/[name]` funcionando. Há 4 produtos no
banco e ao menos um arquivo em `data/uploads/products/` com caminhos nesse formato
gravados nas linhas. A rota velha vira alias da nova.

Todas as rotas de escrita só para `role === 'admin'` — barbeiro comum não edita a marca
da loja.

## 8. Fases

Cada fase termina com a instância do Bayron funcionando. Ela é o demo de vendas; não
pode ficar quebrada entre fases.

**Fase 0 — Destravar o demo (minutos)**
Corrigir `config.ts:6` para `5584999051196`.
*Aceite:* clicar em qualquer CTA de WhatsApp abre a conversa certa.

**Fase 1 — Settings sem mudança visível**
Migration 0009 (só `settings`) · `src/lib/settings.ts` · seed da linha 1 com os valores
atuais do Bayron · trocar os imports de `config.ts` por `getSettings()` nos **11 arquivos** que o
consomem hoje (lista verificada): `components/Footer.astro`, `components/Gallery.astro`,
`components/Header.astro`, `components/Hero.astro`, `components/Location.astro`,
`components/Services.astro`, `components/Testimonials.astro`, `components/WhatsAppBar.astro`,
`layouts/Layout.astro`, `pages/a/[token].astro`, `pages/api/appointments/by-token/[token].ts`
· `Layout.astro` (title, description, og, JSON-LD) · flipar prerender em `index`,
`agendar`, `404`.
*Aceite:* site pixel-a-pixel idêntico; `UPDATE settings SET business_name=...` no
sqlite muda o site sem rebuild.

**Fase 2 — Mídia em runtime**
Generalizar `uploads.ts` (`UPLOAD_ROOT` + subpastas) · `/api/media/[...path]` com alias
da rota antiga · variantes WebP com `sharp` no upload · mover `sharp` para
`dependencies` · Header/Footer/Hero passam a ler `logo_path`/`hero_path` com fallback
para o asset atual · **upload em lote** (múltiplos arquivos por vez, corte e variantes
automáticos) conforme D4.1.
*Aceite:* trocar logo e hero por upload, sem rebuild, sem regressão de LCP; subir 20
fotos de galeria numa tacada só, em menos de um minuto de trabalho manual.

**Fase 3 — Conteúdo em tabelas**
Migration 0009 (`testimonials`, `faq_items`, `gallery_images`) e 0010 (colunas de
apresentação em `services`) · migrar os JSONs para o banco · portar o catálogo curado de
`Services.astro:8-46` para as colunas novas · Gallery deixa de usar `import.meta.glob` ·
**remover** o `<script>` de `Services.astro:129-140` e o endpoint
`/api/services/prices` (código morto depois do SSR — consumidor único verificado).
*Aceite:* landing renderiza inteiramente do banco; `src/data/*.json` pode ser deletado;
mudar categoria/descrição/preço no admin reflete no site sem rebuild.

**Fase 4 — Painel de configurações**
`/admin/configuracoes` (item novo no array de nav de `AdminLayout.astro:63-74`, dentro do
bloco `role === 'admin'`) · abas: Marca, Contato, Conteúdo, SEO · estender `/admin/catalogo` com os campos
novos de apresentação (D6.1) · AdminLayout deixa de dizer "Bayron Admin".
*Aceite:* provisionar uma barbearia fictícia inteira sem abrir editor de código.

**Fase 5 — Tema** — ✅ **núcleo implementado em 01/09/2026**
`src/lib/accent.ts` (derivação + sanitização) · `tests/accent.test.ts` (13 testes) ·
`Layout.astro` injeta `<style>` com a sobrescrita dos três tokens.
*Verificado no navegador:* a cor derivada retinge o `background-color` real do botão e
o `color` real do texto — `#1b2a5a` → `rgb(27,42,90)`, `#c9a227` → `rgb(141,114,27)`.
**Falta:** campo de cor na tela `/admin/configuracoes` chamando `derivarAccent()` na
gravação, e a extração de cores candidatas a partir da logo no onboarding.

**Fase 6 — Provisionamento**
`scripts/provision.mjs --slug --name --whatsapp --domain` · parametrizar `seed.mjs`
(barbeiros, catálogo default, expediente) · catálogo de serviços genérico como template.
*Aceite:* barbearia nova no ar em menos de 15 minutos, sem tocar em `src/`.

**Fase 7 — Demo**
`demo.<dominio>` com reset noturno.

## 9. Riscos e armadilhas

**🔴 `SESSION_SECRET` precisa ser único por instância.** O cookie de sessão
(`src/lib/session.ts`) carrega só `{barberId, role}` e o nome do cookie é o mesmo em toda
instância. Se duas barbearias compartilharem o secret, um cookie emitido pela loja A é
**aceito como válido** pela loja B — o admin da A vira admin da B. O script de
provisionamento deve **gerar** o secret, nunca copiar. Este é o risco mais grave do
modelo de instância por cliente.

**🟠 Prerender.** Ver §3.5. Regra: qualquer rota que leia `settings` precisa ser SSR.

**🟠 `sharp` em `devDependencies`.** Ver D4.

**🟠 Cache de settings com múltiplos processos.** Ver D3.1.

**🟠 Compatibilidade de caminhos de mídia.** Ver §7.

**🔴 `America/Fortaleza` está escrito em 19 arquivos de `src/`** (22 ocorrências), como
constante de código e não lido de `process.env.TZ` — só `scripts/backup-daemon.mjs`
respeita o ambiente. Funciona por coincidência enquanto o cliente for UTC-3 (Nordeste,
Sudeste, Sul); Manaus e Cuiabá são UTC-4 e o Acre é UTC-5. Vender para lá gera horário
errado em silêncio. Corrigir antes de sair do UTC-3 — ver `PENDENCIAS-ABERTAS.md` §2.1.

**🟠 O wizard obriga a escolher barbeiro mesmo com um só** (`src/pages/agendar.astro:303`;
verificado: não há lógica de pular). O alvo comercial é barbearia pequena, boa parte com
um profissional só — é atrito no ponto mais sensível do funil. Ver `PENDENCIAS-ABERTAS.md` §2.2.

**🟡 Injeção de CSS pelo acento.** Validar hex com regex antes de interpolar (D5).

**🟡 Migrations 0002/0003/0004 sem snapshot** em `drizzle/meta/`. Rodar `db:generate`
para a 0009 e **conferir o SQL gerado** antes de commitar, em vez de confiar cegamente.

**🟡 Textos institucionais são copy, não config.** `Footer.astro:39` e o parágrafo do
Hero são texto de marketing por barbearia. Entram como campos de settings, não como
string traduzível.

## 10. Fora de escopo

Multi-tenant com `tenant_id`. Painel de super-admin. Onboarding self-service. Múltiplos
templates visuais. Lembrete de WhatsApp (só depois do primeiro cliente pagante).
Pagamento online. PWA. Importação de dados de concorrente. **Importação automática de
fotos do Instagram** (ver D4.1 — custo de manutenção não se paga na frequência de uso).
Layout sob medida por cliente (ver `PLANO-PRODUTIZACAO.md` §6.2).

**Múltiplos templates visuais** continua fora — mas com a razão registrada, porque a
preocupação por trás é legítima (15 barbearias na mesma cidade com sites idênticos é
um problema real). O custo não é desenhar N layouts uma vez: é que **toda
funcionalidade nova passa a precisar funcionar nos N**, para sempre. É o fork por
cliente disfarçado.

O que substitui, quando houver demanda de cliente pagante: **um template com variações
controladas** — cor de destaque (feito), topo com foto ou topo tipográfico, ordem e
visibilidade das seções, e talvez um par tipográfico alternativo. Isso é token e
condicional, não fork.

E o que mais diferencia dois sites não é o layout: **são as fotos**. Duas barbearias
com a mesma estrutura e fotos próprias já parecem sites diferentes.
