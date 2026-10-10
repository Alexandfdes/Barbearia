/**
 * Os passos do agendamento pelo site — a regra que o script do `/agendar`
 * executa no navegador, puxada para cá para o teste alcançar.
 *
 * Sem dependência nenhuma: o script da página importa este arquivo.
 */

export type Passo = 'servico' | 'barbeiro' | 'horario' | 'dados';

interface ComBarbeiros {
  barbers: readonly unknown[];
}

/**
 * O passo do barbeiro só existe quando há escolha.
 *
 * Com um barbeiro só no serviço, ele é escolhido sozinho e o contador diz "de 3".
 * Antes de o cliente escolher o serviço, vale o caso da barbearia: se nenhum
 * serviço tem mais de um barbeiro, o passo não aparece desde o começo.
 *
 * ⚠️ É o caso de todo cliente novo: o `/cadastrar` cria a barbearia com um
 * barbeiro só, o dono. Até 09/10/2026 o cliente dele passava por uma tela com um
 * botão só, e o contador anunciava quatro passos quando eram três
 * (`PENDENCIAS-ABERTAS.md` §2.2).
 */
export function passosDoAgendamento(servicos: readonly ComBarbeiros[], escolhido: ComBarbeiros | null): Passo[] {
  const haEscolha = escolhido
    ? escolhido.barbers.length > 1
    : servicos.some((s) => s.barbers.length > 1);
  return haEscolha ? ['servico', 'barbeiro', 'horario', 'dados'] : ['servico', 'horario', 'dados'];
}

/** "Passo 2 de 3". */
export function rotuloDoPasso(passo: Passo, passos: readonly Passo[]): string {
  return `Passo ${passos.indexOf(passo) + 1} de ${passos.length}`;
}
