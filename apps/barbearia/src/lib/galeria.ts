/**
 * A galeria do site — o carrossel "Portfólio" da página inicial.
 *
 * O dono sobe as fotos pelo painel (`/admin/galeria`); o site mostra a seção a
 * partir de `MINIMO_PARA_APARECER`. Os arquivos moram no volume, na pasta de
 * `pastaDeMidia('galeria', tenant)`, com as variantes WebP ao lado; a tabela
 * `gallery_images` (migration 0005) guarda o endereço, as larguras e a ordem.
 *
 * ⚠️ Toda função aqui recebe a barbearia EXPLÍCITA. No painel ela vem da sessão
 * (`tenantDaSessao`), no site do endereço (`tenantAtual`). Nenhuma adivinha.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../db/index.js';
import { galleryImages } from '../db/schema.js';
import type { Tenant } from './tenant.js';
import { largurasDe, pastaDeMidia, safeUploadName, salvarMidiaMarca, urlDeMidia } from './uploads.js';

/**
 * Abaixo disto a seção não aparece no site.
 *
 * Regra do `PENDENCIAS-ABERTAS.md` §4.1 — nenhuma seção meia-boca. Um carrossel
 * com uma ou duas fotos repetindo em volta parece site abandonado, e é pior do
 * que não ter a seção.
 */
export const MINIMO_PARA_APARECER = 3;

/**
 * Teto por barbearia. Galeria é vitrine, não arquivo: 20 fotos já são quase
 * 7 metros de carrossel a 336 px cada. E o teto limita o disco — cada foto fica
 * guardada em até 2560 px mais duas variantes.
 *
 * ⚠️ Teto MOLE: dois envios simultâneos com 19 fotos podem passar os dois e
 * chegar a 21. Travar exigiria lock por barbearia para um caso que só acontece
 * com duas abas abertas enviando ao mesmo tempo, e o custo de uma foto a mais é
 * nenhum.
 */
export const MAXIMO_DE_FOTOS = 20;

/**
 * Quantos cartões uma "volta" do carrossel precisa ter.
 *
 * O carrossel rola sozinho e, ao fim de uma volta, pula de volta ao começo sem o
 * visitante perceber — para isso a faixa é desenhada duas vezes e a volta tem que
 * ser MAIS LARGA que a tela. Com 3 fotos de 336 px a volta teria 1008 px: num
 * monitor de 1920 a rolagem batia no fim, ficava parada ~18 s e dava um salto.
 * Doze cartões são 4032 px, o que cobre até monitor ultralargo.
 */
export const CARTOES_POR_VOLTA = 12;

/**
 * A faixa de uma volta: as fotos na ordem, repetidas até dar `CARTOES_POR_VOLTA`.
 * `repetida` marca as cópias — elas ficam fora do leitor de tela e do Tab, senão
 * quem navega por teclado atravessaria a mesma foto quatro vezes.
 */
export function faixaDoCarrossel<T>(fotos: T[], minimo = CARTOES_POR_VOLTA): { foto: T; repetida: boolean }[] {
  if (fotos.length === 0) return [];
  const faixa: { foto: T; repetida: boolean }[] = [];
  while (faixa.length < minimo || faixa.length % fotos.length !== 0) {
    const i = faixa.length % fotos.length;
    faixa.push({ foto: fotos[i], repetida: faixa.length >= fotos.length });
  }
  return faixa;
}

export interface FotoDaGaleria {
  id: number;
  path: string;
  widths: number[];
}

/** As fotos DESTA barbearia, na ordem em que o dono deixou. */
export async function fotosDaGaleria(tenant: Tenant): Promise<FotoDaGaleria[]> {
  return db
    .select({ id: galleryImages.id, path: galleryImages.path, widths: galleryImages.widths })
    .from(galleryImages)
    .where(eq(galleryImages.tenantId, tenant.id))
    .orderBy(asc(galleryImages.sortOrder), asc(galleryImages.id));
}

export async function quantasFotos(tenant: Tenant): Promise<number> {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(galleryImages)
    .where(eq(galleryImages.tenantId, tenant.id));
  return Number(linha?.n ?? 0);
}

export type ResultadoEnvio =
  | { ok: true; foto: FotoDaGaleria }
  | { ok: false; status: 400 | 409 | 500; error: string };

/** Grava a foto no volume e a põe no fim da galeria. */
export async function adicionarFoto(file: File, tenant: Tenant): Promise<ResultadoEnvio> {
  if ((await quantasFotos(tenant)) >= MAXIMO_DE_FOTOS) {
    return {
      ok: false, status: 409,
      error: `A galeria já tem ${MAXIMO_DE_FOTOS} fotos, que é o máximo. Remova uma para enviar outra.`,
    };
  }

  const salva = await salvarMidiaMarca(file, 'galeria', tenant);
  if ('error' in salva) return { ok: false, status: 400, error: salva.error };

  try {
    const [{ proxima }] = await db
      .select({ proxima: sql<number>`coalesce(max(${galleryImages.sortOrder}), -1)::int + 1` })
      .from(galleryImages)
      .where(eq(galleryImages.tenantId, tenant.id));

    const [foto] = await db
      .insert(galleryImages)
      .values({ tenantId: tenant.id, path: salva.path, widths: salva.larguras, sortOrder: Number(proxima) })
      .returning({ id: galleryImages.id, path: galleryImages.path, widths: galleryImages.widths });
    return { ok: true, foto };
  } catch (err) {
    // O arquivo já está no disco e o banco não o conhece: apagar, senão vira
    // lixo que nenhuma tela mostra e nenhum botão remove.
    console.error('[galeria] foto salva mas não registrada:', err);
    await apagarArquivosDaFoto(salva.path, salva.larguras, tenant);
    return { ok: false, status: 500, error: 'Não consegui registrar a foto. Tente de novo.' };
  }
}

/**
 * Tira a foto da galeria e apaga os arquivos dela.
 *
 * Aqui apagar é o pedido — ao contrário do logo e da capa, cuja remoção deixa o
 * arquivo no volume (`api/admin/settings/media.ts`). Lá, "remover" volta o site
 * ao padrão e o dono pode se arrepender; aqui ele escolheu tirar aquela foto, e
 * guardar 20 trocas por mês para sempre é só disco. O backup diário das fotos
 * cobre o arrependimento.
 */
export async function removerFoto(id: number, tenant: Tenant): Promise<boolean> {
  // A linha sai primeiro, o arquivo depois: se o disco falhar, sobra um arquivo
  // órfão (inofensivo); na ordem inversa sobraria uma foto quebrada no site.
  const [linha] = await db
    .delete(galleryImages)
    .where(and(eq(galleryImages.id, id), eq(galleryImages.tenantId, tenant.id)))
    .returning({ path: galleryImages.path, widths: galleryImages.widths });
  if (!linha) return false;
  await apagarArquivosDaFoto(linha.path, linha.widths, tenant);
  return true;
}

/**
 * Grava a ordem nova. `ordem` tem que ser EXATAMENTE os ids desta barbearia — nem
 * um a mais, nem um a menos, sem repetir. Qualquer outra coisa é recusada inteira:
 * aceitar pela metade deixaria duas fotos com a mesma posição.
 */
export async function reordenar(ordem: number[], tenant: Tenant): Promise<boolean> {
  const atuais = await db
    .select({ id: galleryImages.id })
    .from(galleryImages)
    .where(eq(galleryImages.tenantId, tenant.id));
  const ids = new Set(atuais.map((a) => a.id));

  const valida = ordem.length === ids.size
    && new Set(ordem).size === ordem.length
    && ordem.every((id) => ids.has(id));
  if (!valida) return false;

  await db.transaction(async (tx) => {
    for (const [posicao, id] of ordem.entries()) {
      await tx
        .update(galleryImages)
        .set({ sortOrder: posicao })
        .where(and(eq(galleryImages.id, id), eq(galleryImages.tenantId, tenant.id)));
    }
  });
  return true;
}

/**
 * Apaga do disco o original e as variantes WebP de uma foto.
 *
 * O caminho vem da linha do banco desta barbearia — só o servidor grava ali — e
 * mesmo assim é conferido: só se apaga o que tem exatamente o formato que
 * `urlDeMidia('galeria', ..., tenant)` monta, dentro da pasta desta barbearia.
 */
export async function apagarArquivosDaFoto(path: string, widths: number[], tenant: Tenant): Promise<void> {
  const prefixo = urlDeMidia('galeria', '', tenant);
  if (!path.startsWith(prefixo)) return;
  const nome = safeUploadName(path.slice(prefixo.length));
  if (!nome) return;

  const pasta = pastaDeMidia('galeria', tenant);
  const semExt = nome.replace(/\.[a-z0-9]+$/i, '');
  // As larguras gravadas E as que o sistema gera hoje: se um dia uma variante
  // for gerada sem entrar no banco, ela sai junto do mesmo jeito.
  const larguras = new Set([...widths, ...largurasDe('galeria')]);
  for (const arquivo of [nome, ...[...larguras].map((w) => `${semExt}-${w}.webp`)]) {
    try { await unlink(join(pasta, arquivo)); } catch { /* já não existe */ }
  }
}
