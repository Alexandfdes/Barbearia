import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { TENANT_UNICO, tenantAtual, type Tenant } from './tenant.js';

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

/**
 * A pasta de produto da barbearia 1, no formato de antes dos tenants.
 * ⚠️ Não monte caminho com isto: use `pastaDeProduto(tenant)`.
 */
export const PRODUCT_UPLOAD_DIR = join(UPLOAD_ROOT, 'products');

/** Prefixo do endereço público das fotos de produto e de combo. */
export const PREFIXO_FOTO_PRODUTO = '/api/products/image/';

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

/**
 * A pasta das fotos de produto e de combo de UMA barbearia.
 *
 * ⚠️ ATÉ 24/09/2026 TODAS AS BARBEARIAS GRAVAVAM NA MESMA PASTA
 * (`PENDENCIAS-ABERTAS.md` §2.7), e a rota que serve não sabia de quem era a
 * foto. Mesma regra do legado que `pastaDeMidia`: a barbearia 1 continua em
 * `products/`, onde as fotos dela já estão e para onde o banco dela aponta.
 *
 * O endereço público é o mesmo para todas — `/api/products/image/<arquivo>` —,
 * e a pasta sai do tenant que o middleware resolveu, nunca da URL.
 */
export function pastaDeProduto(tenant: Tenant = TENANT_UNICO): string {
  return tenant.id === TENANT_UNICO.id
    ? PRODUCT_UPLOAD_DIR
    : join(UPLOAD_ROOT, tenant.slug, 'products');
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

/** As larguras de WebP que `salvarMidiaMarca` tenta gerar para o tipo. */
export function largurasDe(tipo: TipoMidia): readonly number[] {
  return VARIANTES[tipo];
}

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

/**
 * Tamanho máximo do ENVIO. Foto de celular moderno passa de 5 MB com facilidade,
 * e o limite antigo de produto (5 MB) fazia o barbeiro esbarrar num erro que ele
 * não sabe resolver ("diminua a foto" — com o quê?). O que fica guardado é bem
 * menor: ver `normalizarFoto`.
 */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;       // produtos (era 5 MB até 25/09/2026)
export const MAX_MARCA_BYTES = 12 * 1024 * 1024;       // logo, capa, galeria

/** Maior lado guardado. Nenhuma tela do site usa mais que 1920 px de largura. */
const MAIOR_LADO_MARCA = 2560;
/** O card de produto tem ~300 px; 1600 cobre a tela retina com folga. */
const MAIOR_LADO_PRODUTO = 1600;

/**
 * Prepara a foto que o dono enviou para ficar pública.
 *
 * ⚠️ DUAS COISAS QUE O ARQUIVO DO CELULAR TRAZ E O SITE NÃO PODE MOSTRAR,
 * achadas em 25/09/2026 ao desenhar a galeria:
 *
 * 1. **A rotação em etiqueta.** Celular em pé grava os pixels DEITADOS e uma
 *    etiqueta EXIF dizendo "gire 90°". O navegador obedece a etiqueta quando abre
 *    o arquivo original — mas as variantes WebP saíam do sharp sem etiqueta
 *    nenhuma, deitadas, e com o srcset é a variante que o visitante vê. Toda foto
 *    tirada com o celular em pé aparecia de lado. Reproduzido com sharp 0.34.5:
 *    1600×1200 com orientação 6 virava um WebP 640×480. `rotate()` sem argumento
 *    aplica a etiqueta nos pixels.
 *
 * 2. **O GPS.** A mesma área EXIF guarda onde a foto foi tirada. O original era
 *    gravado byte a byte e servido em endereço público (é o `src` da imagem), e
 *    qualquer visitante baixava e lia a localização. Foto tirada em casa, com o
 *    celular do barbeiro, entrega o endereço dele. O sharp não copia metadado a
 *    menos que peçam (`withMetadata`), então reescrever o arquivo tira tudo.
 *
 * Bônus: arquivo que não é imagem de verdade (extensão trocada, lixo) é recusado
 * aqui, em vez de ser gravado e servido como `image/jpeg`.
 *
 * O formato continua o que o dono mandou — PNG com transparência continua PNG.
 * O custo aceito: a foto é recomprimida (qualidade 88) e o "original" deixa de ser
 * o byte a byte do celular. Para regerar variantes um dia, 2560 px sobra.
 */
export async function normalizarFoto(buf: Buffer, ext: string, maiorLado: number): Promise<Buffer> {
  const img = sharp(buf)
    .rotate()
    .resize({ width: maiorLado, height: maiorLado, fit: 'inside', withoutEnlargement: true });
  switch (ext) {
    case '.png':  return img.png().toBuffer();
    case '.webp': return img.webp({ quality: 88 }).toBuffer();
    case '.avif': return img.avif({ quality: 62 }).toBuffer();
    default:      return img.jpeg({ quality: 88 }).toBuffer();
  }
}

/**
 * Salva o arquivo de imagem no volume e devolve o caminho público servido por
 * /api/products/image/. Valida tipo e tamanho; gera nome aleatório (não confia
 * no nome do cliente). A foto é gravada normalizada: girada, sem EXIF, no máximo
 * 1600 px — ver `normalizarFoto`.
 */
export async function saveProductImage(
  file: File,
  tenant: Tenant = tenantAtual(),
): Promise<{ path: string } | { error: string }> {
  const ext = IMAGE_MIME_EXT[file.type];
  if (!ext) return { error: 'Imagem deve ser JPG, PNG ou WEBP' };
  if (file.size > MAX_IMAGE_BYTES) return { error: 'Imagem muito grande (máx. 12 MB)' };
  let buf: Buffer;
  try {
    buf = await normalizarFoto(Buffer.from(await file.arrayBuffer()), ext, MAIOR_LADO_PRODUTO);
  } catch {
    return { error: 'Não consegui abrir essa imagem. Envie uma foto JPG, PNG ou WEBP.' };
  }
  const name = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const pasta = pastaDeProduto(tenant);
  await mkdir(pasta, { recursive: true });
  await writeFile(join(pasta, name), buf);
  return { path: `${PREFIXO_FOTO_PRODUTO}${name}` };
}

/**
 * Apaga o arquivo de uma foto de produto enviada — da pasta DA barbearia.
 * Ignora caminho que não é de upload (as imagens estáticas de `/products`).
 *
 * Estava duplicada em `products/[id].ts` e `combos/[id].ts`, as duas apagando da
 * pasta compartilhada. O nome sempre veio da linha do produto da própria
 * barbearia — que só recebe caminho gerado pelo servidor —, então nunca houve
 * como uma apagar a foto da outra; com a pasta separada, nem por engano.
 */
export async function apagarFotoProduto(caminho: string | null, tenant: Tenant): Promise<void> {
  if (!caminho || !caminho.startsWith(PREFIXO_FOTO_PRODUTO)) return;
  const nome = safeUploadName(caminho.slice(PREFIXO_FOTO_PRODUTO.length));
  if (!nome) return;
  try { await unlink(join(pastaDeProduto(tenant), nome)); } catch { /* já não existe */ }
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
 * O original fica ao lado das variantes, no formato que o dono enviou: WebP tem
 * suporte largo mas não universal, e ter a foto grande permite regerar as
 * variantes se um dia as larguras mudarem. Desde 25/09/2026 ele é gravado
 * NORMALIZADO — girado, sem EXIF, no máximo 2560 px (ver `normalizarFoto`) — e
 * não mais byte a byte.
 *
 * Nomes: `1730-a1b2c3.jpg` (original) e `1730-a1b2c3-640.webp` (variante).
 * Nome novo a cada upload, nunca sobrescrito — assim o cache do navegador
 * pode ser eterno e a troca de logo aparece na hora.
 */
export async function salvarMidiaMarca(
  file: File,
  tipo: TipoMidia,
  tenant: Tenant = tenantAtual(),
): Promise<MidiaSalva | { error: string }> {
  const ext = MIME_MARCA[file.type];
  if (!ext) return { error: 'A imagem deve ser JPG, PNG, WEBP ou AVIF' };
  if (file.size > MAX_MARCA_BYTES) return { error: 'Imagem muito grande (máx. 12 MB)' };

  let buf: Buffer;
  try {
    buf = await normalizarFoto(Buffer.from(await file.arrayBuffer()), ext, MAIOR_LADO_MARCA);
  } catch {
    return { error: 'Não consegui abrir essa imagem. Envie uma foto JPG, PNG, WEBP ou AVIF.' };
  }
  const stem = `${Date.now()}-${randomBytes(6).toString('hex')}`;

  // ⚠️ A PASTA SAI DE `pastaDeMidia()`, E O ENDEREÇO DE `urlDeMidia()`.
  //
  // Esta função montava o caminho à mão — `join(UPLOAD_ROOT, tipo)`, o formato
  // legado, sem slug — enquanto a leitura em `/api/media/[...path].ts` usava
  // `pastaDeMidia(tipo, tenant)`, que para toda barbearia que não é a de id 1
  // é `UPLOAD_ROOT/<slug>/<tipo>`.
  //
  // As duas metades do mesmo caminho discordavam: **logo, capa, og e favicon de
  // toda barbearia nova davam 404 no site dela** — nascia sem imagem, e o dono
  // não tinha como consertar pelo painel, porque o upload "funcionava". E os
  // arquivos iam parar dentro da pasta da barbearia 1.
  //
  // A regra que fica: **um caminho de arquivo tem UMA função que o monta**, usada
  // pela escrita e pela leitura. Havendo duas, elas divergem — é questão de
  // quando, não de se.
  const pasta = pastaDeMidia(tipo, tenant);
  await mkdir(pasta, { recursive: true });

  await writeFile(join(pasta, `${stem}${ext}`), buf);

  const larguras: number[] = [];
  // `buf` já está normalizado: girado, sem EXIF, no máximo 2560 px. A largura
  // lida aqui é a de verdade — antes era a dos pixels deitados, e uma foto em pé
  // de 1200 px ganhava uma variante de 1280 (ampliada).
  const { width: larguraReal } = await sharp(buf).metadata();
  for (const w of VARIANTES[tipo]) {
    try {
      // Não aumenta imagem pequena: gerar 1920 a partir de uma foto de 800px
      // só produz um arquivo maior e igualmente borrado.
      if (larguraReal && larguraReal < w) continue;
      const saida = await sharp(buf).resize({ width: w }).webp({ quality: 78 }).toBuffer();
      await writeFile(join(pasta, `${stem}-${w}.webp`), saida);
      larguras.push(w);
    } catch (err) {
      console.error(`[uploads] falha ao gerar variante ${w} de ${tipo}:`, err);
    }
  }

  return { path: urlDeMidia(tipo, `${stem}${ext}`, tenant), larguras };
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
