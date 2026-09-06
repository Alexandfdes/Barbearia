/**
 * Tudo que muda quando o produto ganhar nome, preço ou telefone novo mora aqui.
 * É o único arquivo que você precisa editar para a marca aparecer certa no site.
 */

// Nome do produto. Aparece no topo, no rodapé, no título da aba e dentro das
// mensagens de WhatsApp. Um lugar só.
export const NOME_PRODUTO = 'Barbearia no Ar';

/** Frase de uma linha que acompanha o nome. */
export const SUBTITULO = 'Site e agendamento para barbearias';

/** WhatsApp que recebe os contatos da página — formato wa.me: DDI + DDD + número. */
export const WHATSAPP = '5584999051196';

/**
 * Domínio onde este site vai rodar. Alimenta o link canônico e a prévia de compartilhamento.
 * ⚠️ Em 30/08/2026 este domínio estava LIVRE mas AINDA NÃO REGISTRADO. Registre antes de publicar.
 */
export const SITE_URL = 'https://barbearianoar.com.br';

export const PRECO = {
  /** Mensalidade. Não há taxa de instalação: a montagem do site está inclusa. */
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

export function whatsappUrl(mensagem: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}

export function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}
