/**
 * O catálogo que uma barbearia nova recebe para editar — `PENDENCIAS-ABERTAS.md` §4.5.
 *
 * ── O PROBLEMA ───────────────────────────────────────────────────────────────
 *
 * Barbearia nova nasce com ZERO serviço. O site aguenta — a seção de serviços
 * não é renderizada até existir o primeiro (§4.1) — mas o resultado é um site
 * apresentável e **inútil ao mesmo tempo**: sem serviço não entra agendamento, e
 * nada na tela diz que falta alguma coisa.
 *
 * A tela em branco é o pior lugar para deixar alguém que acabou de pagar.
 *
 * ── POR QUE NÃO VEM PLANTADO NO PROVISIONAMENTO ──────────────────────────────
 *
 * Porque foi exatamente isso que deu errado antes: as migrations plantavam os
 * dados do Bayron em todo banco novo, inclusive **5.0 com 227 avaliações**
 * (§4.6). Dado que o dono não pediu, e que ele nem sabe que está lá, vira
 * conteúdo de terceiro no site dele.
 *
 * Aqui é diferente: o dono aperta um botão. O catálogo é sugestão que ele
 * aceitou, não fato que apareceu.
 *
 * ── POR QUE NÃO TEM PREÇO ────────────────────────────────────────────────────
 *
 * ⚠️ **De propósito, e é a decisão mais importante deste arquivo.**
 *
 * Preço de corte varia por cidade, por bairro e por posicionamento. Um número
 * sugerido que o dono não reparou vira o preço no site dele — e ele descobre
 * quando o cliente chegar no caixa com outra expectativa. Preço errado no ar é
 * pior que preço faltando.
 *
 * Então cada serviço entra **inativo e com preço zero**. Inativo não aparece no
 * site nem no agendamento (`api/services.ts` filtra por `active`), então
 * ninguém vê "R$ 0,00" em lugar nenhum. O dono digita o preço dele e ativa —
 * e `api/admin/services/[id].ts` recusa ativar serviço com preço zero, para
 * esse caminho não ter atalho.
 *
 * ⚠️ **As durações são estimativa, não pesquisa.** Estão aqui porque
 * `barber_services.duration_minutes` é obrigatório e porque chutar 30 minutos
 * para tudo produziria agenda errada. São editáveis na mesma tela.
 */

export interface ServicoSugerido {
  nome: string;
  /** Minutos. Estimativa — ver o aviso no cabeçalho. */
  minutos: number;
}

/**
 * O núcleo comum de uma barbearia masculina brasileira.
 *
 * Curto de propósito: oito linhas cabem numa tela e o dono apaga o que não faz.
 * Lista de vinte itens reproduz a paralisia da tela em branco com outro formato
 * — foi o que o medidor de completude (§4.4) já tinha ensinado ao mostrar três
 * pendências de cada vez em vez de oito.
 */
export const CATALOGO_SUGERIDO: ServicoSugerido[] = [
  { nome: 'Corte masculino',      minutos: 30 },
  { nome: 'Corte degradê',        minutos: 40 },
  { nome: 'Barba',                minutos: 30 },
  { nome: 'Corte + barba',        minutos: 60 },
  { nome: 'Acabamento (pezinho)', minutos: 15 },
  { nome: 'Corte infantil',       minutos: 30 },
  { nome: 'Sobrancelha',          minutos: 10 },
  { nome: 'Pigmentação de barba', minutos: 30 },
];
