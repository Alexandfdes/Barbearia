/**
 * Endereços que nenhuma barbearia pode pegar (`docs/PENDENCIAS-ABERTAS.md` §4.16).
 *
 * O primeiro rótulo de qualquer endereço vira slug (`resolverHost`, em
 * `lib/tenant.ts`). Com uma barbearia chamada `painel` no ar, a raiz de
 * `painel.<domínio>` passaria a mostrar o site dela — no endereço que todo dono
 * digita para entrar. O mesmo vale para os nomes de serviço que o produto vai
 * precisar (`www`, `api`, `mail`…) e para o nome do próprio produto.
 *
 * ⚠️ Vale para o cadastro pela web E para o script de linha de comando: os dois
 * passam por `provisionarBarbearia`. Nome que entrar aqui fica proibido para
 * você também — por isso `demo` NÃO está na lista.
 *
 * Lista fechada e curta, de propósito. Nome novo entra com o motivo.
 */
import { NOME_PRODUTO } from './produto.js';
import { SLUG_DO_BAYRON } from './bayron.js';

/** Um nome como rótulo de endereço: "Barbearia São José" → "barbearia-sao-jose". */
export function rotuloDoNome(nome: string): string {
  return nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const ENDERECOS_RESERVADOS: ReadonlySet<string> = new Set([
  // O painel central e as portas do produto.
  'painel', 'admin', 'app', 'api', 'www', 'login', 'entrar', 'cadastro', 'cadastrar', 'conta',
  // E-mail e infraestrutura: o domínio vai precisar deles, e alguns emissores de
  // certificado tratam `admin@`, `postmaster@` e afins como donos do domínio.
  'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'postmaster', 'webmail', 'ns1', 'ns2',
  'cdn', 'static', 'assets', 'media', 'status',
  // Cobrança e avisos (`docs/PLANO-PRODUTIZACAO.md` §13).
  'pagamento', 'cobranca', 'webhook', 'webhooks',
  // Conteúdo e atendimento do produto.
  'blog', 'ajuda', 'suporte', 'docs',
  // Ambientes.
  'dev', 'teste', 'staging',
  // O nome do produto — o de agora e o de antes de 08/10/2026.
  rotuloDoNome(NOME_PRODUTO), 'barbearianoar', 'barbearia-no-ar',
  // O Bayron: o conteúdo dele cravado no repositório vai para quem tem este
  // endereço (`lib/bayron.ts`). O dele nasce da migração, não do cadastro — então
  // reservar não o atrapalha, e num banco ainda sem ele ninguém o pega (09/10/2026).
  SLUG_DO_BAYRON,
]);

export function enderecoReservado(slug: string): boolean {
  return ENDERECOS_RESERVADOS.has(slug.trim().toLowerCase());
}
