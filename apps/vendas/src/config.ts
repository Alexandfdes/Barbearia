/**
 * Tudo que muda quando o produto ganhar nome, preço ou telefone novo mora aqui.
 * É o único arquivo que você precisa editar para a marca aparecer certa no site.
 */

// Nome do produto. Aparece no topo, no rodapé, no título da aba e dentro das
// mensagens de WhatsApp. Um lugar só neste site; o app da barbearia tem o dele em
// apps/barbearia/src/lib/produto.ts, e um teste confere que os dois batem.
// Provisório desde 08/10/2026 — antes, "Barbearia no Ar" (docs/PENDENCIAS-ABERTAS.md §0.1).
export const NOME_PRODUTO = 'Fadeline';

/** Frase de uma linha que acompanha o nome. */
export const SUBTITULO = 'Site e agendamento para barbearias';

/** WhatsApp que recebe os contatos da página — formato wa.me: DDI + DDD + número. */
export const WHATSAPP = '5584999051196';

/**
 * Domínio onde este site vai rodar. Alimenta o link canônico e a prévia de compartilhamento.
 * ⚠️ Em 08/10/2026 este domínio estava LIVRE mas AINDA NÃO REGISTRADO. Registre antes de publicar.
 */
export const SITE_URL = 'https://fadeline.com.br';

export const PRECO = {
  /** Mensalidade, depois dos 7 dias grátis. Não há taxa de instalação. */
  mensal: 100,
  /** Meses de bônus para quem paga o ano à vista. */
  mesesBonus: 2,
};

/** O que o cliente paga no plano anual, à vista. */
export const PRECO_ANUAL = PRECO.mensal * (12 - PRECO.mesesBonus);

/** Quanto sai por mês no plano anual — é o número que convence. */
export const PRECO_ANUAL_POR_MES = PRECO_ANUAL / 12;

/**
 * Preços dos concorrentes, consultados em 28/08/2026 direto das páginas deles.
 * Se for usar em material de venda, confira antes — preço de SaaS muda.
 */
export const CONCORRENTES = [
  { nome: 'Trinks',    preco: 'R$ 76/mês',    obs: 'Plano de 1 a 2 profissionais' },
  { nome: 'AppBarber', preco: 'R$ 79,90/mês', obs: 'Plano de 1 profissional' },
  { nome: 'Booksy',    preco: 'R$ 99,99/mês', obs: 'Plano único' },
];

/** Link para um site real já entregue. Vazio esconde a seção. Ver README sobre direitos de imagem. */
export const EXEMPLO_URL = '';

/**
 * Onde mora a tela de criar barbearia — e por que ela não mora aqui.
 *
 * O cadastro grava no banco: tenant, configuração, dono com senha e horários.
 * Este app não tem banco (nem `postgres`, nem schema, nem bcrypt), então a tela
 * vive no app da barbearia e esta página só aponta para lá. Duplicar a criação
 * de barbearia em dois apps é como as duas versões divergem — foi o que
 * `PENDENCIAS-ABERTAS.md` §4.6 e §4.2 registram, das duas vezes que aconteceu.
 *
 * ⚠️ O botão só aparece com `CADASTRO_ABERTO=1` — a MESMA variável que destrava
 * a rota do outro lado. Ligar só aqui dá um botão que cai em 404; ligar só lá dá
 * uma porta funcionando que ninguém acha. São dois processos, então são dois
 * lugares para ligar, e é de propósito: nenhum dos dois abre sozinho.
 */
export const CADASTRO_ABERTO = process.env.CADASTRO_ABERTO === '1';

/** O endereço da tela de cadastro. Em desenvolvimento aponta para o outro servidor. */
export const URL_CADASTRO =
  process.env.URL_CADASTRO ?? 'http://localhost:4321/cadastrar';

/**
 * A tela de entrar do painel central — `painel.<domínio>`, onde todo dono entra. O
 * `/acessar` leva direto para ela. Até 12/10/2026 aquela tela pedia o endereço do
 * site e levava ao `/admin` dele: o modelo de um painel por barbearia, que acabou com
 * o painel central (docs/ARQUITETURA-MULTI-TENANT-V1.md §8). Em desenvolvimento,
 * aponta para o outro servidor — como `URL_CADASTRO`, em produção vem do ambiente.
 */
export const URL_PAINEL =
  process.env.URL_PAINEL ?? 'http://localhost:4321/admin/login';

export function whatsappUrl(mensagem: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}

export function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}
