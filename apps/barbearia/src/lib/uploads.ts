import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { TENANT_UNICO, type Tenant } from './tenant.js';

/**
 * Onde a mídia enviada pelo dono da barbearia mora no disco.
 *
 * ⚠️ ISTO JÁ FOI DERIVADO DE `DATABASE_PATH` — E QUASE CUSTOU AS FOTOS.
 *
 * Enquanto o banco era SQLite, a raiz saía de `dirname(DATABASE_PATH)`: em
 * produção `DATABASE_PATH=/data/appointments.db` dava `/data/uploads`, dentro
 * do volume. Correto por acidente.
 *
 * O porte para Postgres tirou `DATABASE_PATH` do `.env` (agora é `DATABASE_URL`).
 * Sem ele, o `??` caía no padrão `./data/appointments.db` e a raiz virava
 * `data/uploads` — **relativa**. No container (`WORKDIR /app`) isso é
 * `/app/data/uploads`: dentro da camada da imagem, fora do volume.
 *
 * O estrago seria mudo e em duas partes: o logo, a capa e as fotos de produto
 * que já estão em `/data/uploads` parariam de ser servidos (404 em imagem não
 * derruba página, só deixa o site feio), e cada foto nova enviada depois disso
 * sumiria no deploy seguinte, junto com a camada descartada.
 *
 * Por isso a raiz não depende mais de variável de banco nenhuma. O padrão de
 * produção é o volume, absoluto, e `UPLOAD_ROOT` existe para quem montar o
 * volume em outro lugar.
 */
export const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT ??
  (process.env.NODE_ENV === 'production' ? '/data/uploads' : './data/uploads');

/** Mantido para os caminhos de produto já gravados no banco continuarem funcionando. */
export const PRODUCT_UPLOAD_DIR = join(UPLOAD_ROOT, 'products');

/** As pastas de mídia da marca. Uma por papel — nunca tudo no mesmo saco. */
export const TIPOS_MIDIA = ['logo', 'hero', 'og', 'favicon', 'galeria'] as const;
export type TipoMidia = (typeof TIPOS_MIDIA)[number];

/**
 * Terceira costura do passo 1 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9:
 * **os dois únicos lugares que montam caminho de mídia.**
 *
 * Nenhum outro arquivo deve concatenar `UPLOAD_ROOT` com tipo, nem escrever
 * `/api/media/...` à mão. É o que permite escopar a mídia por barbearia
 * mexendo em um lugar só.
 *
 * ⚠️ A barbearia única mantém o caminho legado, **sem o slug**. Os arquivos já
 * estão no disco assim e os caminhos estão gravados no banco — inserir o slug
 * agora quebraria a instância que está em produção.
 */
export function pastaDeMidia(tipo: TipoMidia, tenant: Tenant = TENANT_UNICO): string {
  return tenant.id === TENANT_UNICO.id
    ? join(UPLOAD_ROOT, tipo)
    : join(UPLOAD_ROOT, tenant.slug, tipo);
}

/** O endereço público do arquivo. Mesma regra do legado que `pastaDeMidia`. */
export function urlDeMidia(tipo: TipoMidia, arquivo: string, tenant: Tenant = TENANT_UNICO): string {
  return tenant.id === TENANT_UNICO.id
    ? `/api/media/${tipo}/${arquivo}`
    : `/api/media/${tenant.slug}/${tipo}/${arquivo}`;
}

/**
 * Larguras geradas em WebP por tipo. O topo da página é o elemento de LCP:
 * servir o JPEG de 4 MB que saiu do celular do barbeiro derruba a nota de
 * performance e a paciência de quem abre no 4G. Ver ARQUITETURA-PRODUTO-V1 D4.
 */
const VARIANTES: Record<TipoMidia, number[]> = {
  hero: [640, 1280, 1920],
  galeria: [640, 1280],
  logo: [96, 256, 512],
  og: [1200],
  favicon: [],
};

/**
 * Valida um nome de arquivo de upload: só caracteres simples, sem path traversal.
 * Retorna o nome se válido, null se suspeito.
 */
export function safeUploadName(name: string): string | null {
  if (!name || name.length > 120) return null;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  return name;
}

export const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
};

/** Tipos aceitos na mídia da marca. SVG e ICO só para favicon — ver nota abaixo. */
const MIME_MARCA: Record<string, string> = {
  ...IMAGE_MIME_EXT,
  'image/avif': '.avif',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;        // 5 MB — produtos
export const MAX_MARCA_BYTES = 12 * 1024 * 1024;       // 12 MB — foto de celular moderno

/**
 * Salva o arquivo de imagem no volume e devolve o caminho público servido por
 * /api/products/image/. Valida tipo e tamanho; gera nome aleatório (não confia
 * no nome do cliente).
 */
export async function saveProductImage(file: File): Promise<{ path: string } | { error: string }> {
  const ext = IMAGE_MIME_EXT[file.type];
  if (!ext) return { error: 'Imagem deve ser JPG, PNG ou WEBP' };
  if (file.size > MAX_IMAGE_BYTES) return { error: 'Imagem muito grande (máx. 5 MB)' };
  const buf = Buffer.from(await file.arrayBuffer());
  const name = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  await mkdir(PRODUCT_UPLOAD_DIR, { recursive: true });
  await writeFile(join(PRODUCT_UPLOAD_DIR, name), buf);
  return { path: `/api/products/image/${name}` };
}

export interface MidiaSalva {
  /** Caminho público do original — é o que vai para a coluna em `settings`. */
  path: string;
  /** Larguras que existem em WebP ao lado do original. */
  larguras: number[];
}

/**
 * Salva uma imagem de marca e gera as variantes WebP ao lado dela.
 *
 * O original é preservado: WebP tem suporte largo mas não universal, e manter
 * o arquivo que o dono enviou permite regerar as variantes se um dia as
 * larguras mudarem.
 *
 * Nomes: `1730-a1b2c3.jpg` (original) e `1730-a1b2c3-640.webp` (variante).
 * Nome novo a cada upload, nunca sobrescrito — assim o cache do navegador
 * pode ser eterno e a troca de logo aparece na hora.
 */
export async function salvarMidiaMarca(
  file: File,
  tipo: TipoMidia,
): Promise<MidiaSalva | { error: string }> {
  const ext = MIME_MARCA[file.type];
  if (!ext) return { error: 'A imagem deve ser JPG, PNG, WEBP ou AVIF' };
  if (file.size > MAX_MARCA_BYTES) return { error: 'Imagem muito grande (máx. 12 MB)' };

  const buf = Buffer.from(await file.arrayBuffer());
  const stem = `${Date.now()}-${randomBytes(6).toString('hex')}`;
  const pasta = join(UPLOAD_ROOT, tipo);
  await mkdir(pasta, { recursive: true });

  await writeFile(join(pasta, `${stem}${ext}`), buf);

  const larguras: number[] = [];
  for (const w of VARIANTES[tipo]) {
    try {
      const meta = await sharp(buf).metadata();
      // Não aumenta imagem pequena: gerar 1920 a partir de uma foto de 800px
      // só produz um arquivo maior e igualmente borrado.
      if (meta.width && meta.width < w) continue;
      const saida = await sharp(buf).resize({ width: w }).webp({ quality: 78 }).toBuffer();
      await writeFile(join(pasta, `${stem}-${w}.webp`), saida);
      larguras.push(w);
    } catch (err) {
      console.error(`[uploads] falha ao gerar variante ${w} de ${tipo}:`, err);
    }
  }

  return { path: `/api/media/${tipo}/${stem}${ext}`, larguras };
}

/**
 * Monta o srcset das variantes a partir do caminho do original.
 * Devolve string vazia quando não há variante — quem chama simplesmente omite
 * o atributo e o navegador usa o src.
 */
export function srcsetDe(path: string, larguras: number[]): string {
  if (!path || larguras.length === 0) return '';
  const semExt = path.replace(/\.[a-z0-9]+$/i, '');
  return larguras.map((w) => `${semExt}-${w}.webp ${w}w`).join(', ');
}
