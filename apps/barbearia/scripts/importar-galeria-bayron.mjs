/**
 * Leva as 20 fotos do carrossel do Bayron, que moravam no repositório, para a
 * galeria do banco — onde o dono passa a poder trocar, ordenar e remover.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────────
 *
 * Até 25/09/2026 o carrossel lia `src/assets/fotos-videos/carrosel*.jpg` em tempo
 * de build, e só no site do Bayron. A migration 0005 criou a galeria por
 * barbearia, e o site passou a ler dela. **Sem este script, o site do Bayron
 * fica sem a seção** — não quebra, só some (`src/lib/galeria.ts`, mínimo de 3).
 *
 * Por que script e não migration: migration é SQL, e gerar as variantes WebP
 * precisa do sharp. E por que não no boot: é coisa de uma barbearia só, e o boot
 * de um produto com várias não deve carregar caso especial de cliente.
 *
 * ── COMO RODAR ───────────────────────────────────────────────────────────────
 *
 * No container de produção (console do EasyPanel), depois das migrations:
 *
 *     node scripts/importar-galeria-bayron.mjs
 *
 * Na sua máquina, com o banco de desenvolvimento:
 *
 *     npm run db:galeria-bayron
 *
 * **Idempotente:** se o Bayron já tiver qualquer foto na galeria, não faz nada.
 * Rodar duas vezes não duplica; rodar depois de o dono ter mexido não desfaz o
 * que ele fez.
 *
 * ── ⚠️ ESTE ARQUIVO REPETE TRÊS REGRAS DE `src/lib/uploads.ts` ────────────────
 *
 * É `.mjs` e roda no container, onde `src/` não existe — não dá para importar o
 * `.ts`. Repete: a raiz do volume, o caminho da barbearia 1 (sem slug) e as
 * larguras das variantes. Repetição de regra é como o fuso horário se espalhou
 * por 20 arquivos; aqui ela é vigiada: `tests/importar-galeria.test.ts` serve as
 * fotos importadas pela rota de verdade (se o caminho divergir, 404) e compara as
 * larguras, e `tests/deploy.test.ts` compara a raiz.
 */
import postgres from 'postgres';
import sharp from 'sharp';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** A mesma regra de `src/lib/uploads.ts` (vigiada por `tests/deploy.test.ts`). */
const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT ??
  (process.env.NODE_ENV === 'production' ? '/data/uploads' : './data/uploads');

/** As larguras de `VARIANTES.galeria` em `src/lib/uploads.ts`. */
export const LARGURAS_GALERIA = [640, 1280];
/** O teto de `normalizarFoto` para mídia da marca. */
const MAIOR_LADO = 2560;

/** Onde as fotos estão: na imagem de produção, ou no repositório. */
const PASTAS_PADRAO = ['seed/galeria-bayron', 'src/assets/fotos-videos'];

/** `carrosel1.jpg`, `carrosel2.jpg` … `carrosel20.jpg`, em ordem NUMÉRICA. */
export function fotosDaPasta(pasta) {
  return readdirSync(pasta)
    .map((nome) => ({ nome, n: Number(/^carrosel(\d+)\.jpe?g$/i.exec(nome)?.[1]) }))
    .filter((f) => Number.isInteger(f.n))
    .sort((a, b) => a.n - b.n)
    .map((f) => f.nome);
}

/** `pastaDeMidia` e `urlDeMidia` para a galeria: a barbearia 1 fica sem slug. */
function caminhos(tenant, uploadRoot) {
  return tenant.id === 1
    ? { pasta: join(uploadRoot, 'galeria'), url: (arq) => `/api/media/galeria/${arq}` }
    : { pasta: join(uploadRoot, tenant.slug, 'galeria'), url: (arq) => `/api/media/${tenant.slug}/galeria/${arq}` };
}

/**
 * Importa as fotos para a galeria da barbearia `slug`. Devolve quantas entraram
 * (0 quando ela já tinha galeria).
 */
export async function importarGaleria({ sql, pasta, slug = 'bayron', uploadRoot = UPLOAD_ROOT, log = console.log }) {
  const [tenant] = await sql`SELECT id, slug FROM tenants WHERE slug = ${slug}`;
  if (!tenant) throw new Error(`Barbearia "${slug}" não existe neste banco.`);

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM gallery_images WHERE tenant_id = ${tenant.id}`;
  if (n > 0) {
    log(`✓ A galeria de "${slug}" já tem ${n} foto(s). Nada a fazer.`);
    return 0;
  }

  const nomes = fotosDaPasta(pasta);
  if (nomes.length === 0) throw new Error(`Nenhuma foto carrosel*.jpg em ${pasta}.`);

  const { pasta: destino, url } = caminhos(tenant, uploadRoot);
  await mkdir(destino, { recursive: true });

  const linhas = [];
  const gravados = [];
  try {
    for (const [ordem, nome] of nomes.entries()) {
      // A mesma normalização de `normalizarFoto`: gira pela etiqueta EXIF, tira o
      // EXIF (GPS incluído) e limita o tamanho.
      const original = await sharp(readFileSync(join(pasta, nome)))
        .rotate()
        .resize({ width: MAIOR_LADO, height: MAIOR_LADO, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      const stem = `${Date.now()}-${randomBytes(6).toString('hex')}`;
      await writeFile(join(destino, `${stem}.jpg`), original);
      gravados.push(`${stem}.jpg`);

      const { width } = await sharp(original).metadata();
      const widths = [];
      for (const w of LARGURAS_GALERIA) {
        if (width && width < w) continue;
        const variante = await sharp(original).resize({ width: w }).webp({ quality: 78 }).toBuffer();
        await writeFile(join(destino, `${stem}-${w}.webp`), variante);
        gravados.push(`${stem}-${w}.webp`);
        widths.push(w);
      }
      linhas.push({ tenant_id: tenant.id, path: url(`${stem}.jpg`), widths, sort_order: ordem });
    }

    // Tudo ou nada no banco: galeria pela metade seria pior que nenhuma.
    await sql.begin(async (tx) => {
      for (const l of linhas) {
        await tx`INSERT INTO gallery_images (tenant_id, path, widths, sort_order)
                 VALUES (${l.tenant_id}, ${l.path}, ${l.widths}, ${l.sort_order})`;
      }
    });
  } catch (erro) {
    // O banco não ficou com nada; o disco também não deve ficar.
    for (const arq of gravados) { try { await unlink(join(destino, arq)); } catch { /* já foi */ } }
    throw erro;
  }

  log(`✓ ${linhas.length} foto(s) importada(s) para a galeria de "${slug}" (barbearia ${tenant.id}), em ${destino}.`);
  return linhas.length;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERRO: DATABASE_URL não definido.');
    process.exit(1);
  }
  const pasta = process.argv[2] ?? PASTAS_PADRAO.find((p) => existsSync(p));
  if (!pasta || !existsSync(pasta)) {
    console.error(`ERRO: não achei as fotos. Procurei em: ${PASTAS_PADRAO.join(', ')}.\n` +
      'Passe a pasta como argumento: node scripts/importar-galeria-bayron.mjs <pasta>');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await importarGaleria({ sql, pasta });
  } catch (erro) {
    console.error(`ERRO: ${erro.message}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
