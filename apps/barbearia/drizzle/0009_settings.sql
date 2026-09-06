-- Configuração da barbearia — linha única (id = 1).
-- Ver docs/ARQUITETURA-PRODUTO-V1.md: D2 (por que colunas tipadas e não chave-valor)
-- e D7 (o que mora aqui e o que mora em variável de ambiente).
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`short_name` text NOT NULL,
	`tagline` text,
	`hero_subtitle` text,
	`about_text` text,
	`whatsapp_number` text NOT NULL,
	`whatsapp_display` text,
	`instagram_url` text,
	`instagram_handle` text,
	`address_street` text NOT NULL,
	`address_city` text NOT NULL,
	`maps_url` text,
	`maps_embed_query` text,
	`business_hours` text DEFAULT '[]' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`accent_color` text DEFAULT '#0f766e' NOT NULL,
	`accent_hover` text DEFAULT '#0d9488' NOT NULL,
	`accent_light` text DEFAULT '#5eead4' NOT NULL,
	`logo_path` text,
	`hero_path` text,
	`og_path` text,
	`favicon_path` text,
	`google_reviews_url` text,
	`google_rating` text,
	`google_review_count` integer,
	`products_section_title` text DEFAULT 'Produtos' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
-- Semente da linha 1 com os valores que hoje estão em src/config.ts e nos
-- componentes. O objetivo desta fase é NÃO mudar nada visualmente: o site tem
-- de ficar pixel-a-pixel idêntico depois da migration.
--
-- ⚠️ Estes valores são os DEFAULTS DO TEMPLATE (ARQUITETURA-PRODUTO-V1 §6).
-- Enquanto a imagem só roda a instância do Bayron, os defaults são os dele.
-- A Fase 6 (provisionamento) troca isto por um catálogo genérico.
INSERT OR IGNORE INTO `settings` (
	`id`, `business_name`, `short_name`, `tagline`, `hero_subtitle`, `about_text`,
	`whatsapp_number`, `whatsapp_display`, `instagram_url`, `instagram_handle`,
	`address_street`, `address_city`, `maps_url`, `maps_embed_query`,
	`business_hours`, `seo_title`, `seo_description`,
	`google_reviews_url`, `google_rating`, `google_review_count`,
	`products_section_title`
) VALUES (
	1,
	'Barbearia Bayron',
	'Bayron',
	'Estilo com respeito. Corte com precisão.',
	'Visagismo personalizado que valoriza o formato do seu rosto, seu estilo e sua identidade.',
	'Liderança e excelência em serviços de barbearia masculina, com compromisso e qualidade certificada para homens de bom gosto em Mossoró.',
	'15551547238', -- placeholder: mesmo valor de src/config.ts. Ver decisão pendente do número do demo.
	'+1 (555) 154-7238', -- como o número aparece escrito no rodapé
	'https://www.instagram.com/barbearia_bayron/',
	'@barbearia_bayron',
	'R. Jaen Menescal, 174',
	'Mossoró/RN',
	'https://www.google.com/maps/dir/?api=1&destination=R.+Jaen+Menescal,+174+-+Mossoró,+RN',
	'Barbearia Bayron R. Jaen Menescal 174 Mossoró RN',
	'[{"label":"Segunda — Sexta","hours":"09:00 — 20:00","closed":false},{"label":"Sábado","hours":"09:00 — 18:00","closed":false},{"label":"Domingo","hours":"Fechado","closed":true}]',
	'Barbearia Bayron | Respeito e Precisão em Cada Corte — Mossoró/RN',
	'A barbearia masculina premium de Mossoró. Degradê, barba, combos exclusivos e produtos Boris. Agende online ou chame no WhatsApp.',
	'https://www.google.com/maps/search/Barbearia+Bayron+Mossor%C3%B3+RN/',
	'5.0',
	227,
	'Produtos Boris'
);
