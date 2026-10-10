/**
 * O Bayron — a barbearia em que o produto nasceu — tem conteúdo cravado no
 * repositório: o logo em `assets/`, a foto do topo, os depoimentos, o FAQ, o
 * catálogo agrupado por categoria, a imagem de prévia (`public/og.jpg`) e a logo
 * do relatório impresso. Esta função decide quem recebe esse conteúdo.
 *
 * ⚠️ Pelo `slug` da barbearia, que o dono não edita. Até 09/10/2026 eram dez
 * comparações `shortName === "Bayron"` espalhadas pelos componentes — o nome
 * curto, que o dono edita em Configurações: quem digitasse "Bayron" ali herdava os
 * depoimentos, o FAQ, o catálogo e o logo de outra barbearia
 * (`PENDENCIAS-ABERTAS.md` §4.7).
 *
 * O `slug` é único no banco, e o cadastro não aceita `bayron`
 * (`lib/enderecosReservados.ts`): nem num banco ainda sem o Bayron alguém o pega.
 *
 * Quando o conteúdo dele sair do repositório e virar dado como o de todas as
 * outras, esta função e as dez chamadas somem juntas.
 */
import type { Tenant } from './tenant.js';

export const SLUG_DO_BAYRON = 'bayron';

export function ehOBayron(tenant: Pick<Tenant, 'slug'> | null | undefined): boolean {
  return tenant?.slug === SLUG_DO_BAYRON;
}
