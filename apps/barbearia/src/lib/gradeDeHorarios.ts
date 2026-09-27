/**
 * O expediente de verdade na tela da agenda — para onde um atendimento pode ser
 * movido, e a faixa do dia que aparece no topo.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ──────────────────────────────────────────────
 *
 * A grade de "Mover horário" era fixa: de 08:00 às 19:00, de 15 em 15 minutos,
 * para qualquer barbearia e qualquer dia. A que abre às 09:00 recebia 08:00 como
 * opção, e o servidor recusava ("Horário fora do expediente do barbeiro") — visto
 * ao vivo em 27/09/2026. A que fecha às 21:00 nunca conseguia mover para depois
 * das 19:00. E o topo da agenda dizia "expediente 08:00 → 19:00" de todo mundo.
 *
 * Função pura, sem banco e sem fuso: roda no servidor e no navegador. Os horários
 * são "HH:MM" locais da barbearia, como estão em `working_hours`; converter para
 * instante é trabalho de quem chama, pelo fuso que vem de `lib/timezone.ts` — nunca
 * somando horas à mão.
 */

/** Uma janela de expediente, em "HH:MM" local da barbearia. */
export interface Janela {
  inicio: string;
  fim: string;
}

/** O expediente da semana de um barbeiro: dia da semana (0 = domingo) → janelas. */
export type Semana = Record<number, Janela[]>;

const emMinutos = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
};

const emHoraMinuto = (minutos: number): string =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/** Dia da semana (0 = domingo) de uma data "YYYY-MM-DD". Conta de calendário: não depende de fuso. */
export function diaDaSemana(data: string): number {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/**
 * Os horários para onde um atendimento de `duracaoMin` minutos pode ir, de `passoMin`
 * em `passoMin`, com o início E o fim dentro de uma mesma janela — a mesma regra que
 * o servidor confere no reagendamento. Turno partido (manhã e tarde) vira as duas
 * faixas; dia sem janela devolve lista vazia.
 */
export function horariosParaMover(janelas: Janela[], duracaoMin: number, passoMin = 15): string[] {
  const horarios = new Set<string>();
  for (const janela of janelas) {
    const abre = emMinutos(janela.inicio);
    const fecha = emMinutos(janela.fim);
    for (let m = abre; m + duracaoMin <= fecha; m += passoMin) horarios.add(emHoraMinuto(m));
  }
  return [...horarios].sort();
}

/** A faixa do dia, para o rótulo da agenda: do primeiro início ao último fim. Sem janela, `null`. */
export function faixaDoDia(janelas: Janela[]): Janela | null {
  if (janelas.length === 0) return null;
  const inicios = janelas.map((j) => j.inicio).sort();
  const fins = janelas.map((j) => j.fim).sort();
  return { inicio: inicios[0], fim: fins[fins.length - 1] };
}
