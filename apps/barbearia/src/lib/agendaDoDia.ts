/**
 * O que a agenda do dia (`pages/admin/dia/[date].astro`) manda para o navegador — o
 * `data-client` da página — e o que a ficha do cliente recebe de
 * `/api/admin/appointments/:id/history`.
 *
 * Só tipos: nada daqui vira código no navegador. Existe para o servidor e o script da
 * página concordarem sobre o formato. Até 12/10/2026 o script lia tudo sem tipo, e o
 * conferidor de tipos (`astro check`) acusava 264 erros nesta página só — erro novo
 * sumia no meio deles.
 */
import type { Semana } from './gradeDeHorarios.js';

/** Um item da comanda: o produto do combo, que nasce com o agendamento, ou um extra do fechamento. */
export interface ItemDaComanda {
  name: string;
  priceCents: number;
}

/**
 * Um atendimento do dia, como a tela usa: já com a hora local e o preço do serviço
 * formatado. Quanto ele vale — com os itens, se concluído — é a conta de
 * `lib/valorDoAtendimento.ts`.
 */
export interface AtendimentoDaAgenda {
  id: number;
  status: string;
  customerName: string;
  customerPhone: string;
  customerPhoneDisplay: string;
  customerBirthdate: string | null;
  notes: string | null;
  lastModifiedLabel: string | null;
  serviceName: string;
  barberName: string;
  barberId: number;
  durationMinutes: number;
  priceCents: number;
  /** Os itens da comanda, na ordem em que entraram. */
  items: ItemDaComanda[];
  /** A soma de `items`, em centavos: quem mexe num, mexe no outro. */
  itemsCents: number;
  /** O preço do serviço agendado, formatado — sem os itens. */
  price: string;
  timeLocal: string;
  endTimeLocal: string;
  /** Telefone para o wa.me (55 + DDD + número), ou `null` se inválido. */
  wa: string | null;
  telUrl: string;
}

export interface DadosDaAgenda {
  date: string;
  role: 'admin' | 'barber';
  sessionBarberId: number;
  filterBarberId: number | null;
  allBarbers: { id: number; name: string }[];
  todayStr: string;
  appts: AtendimentoDaAgenda[];
  salesCents: number;
  products: { name: string; priceCents: number }[];
  /** O fuso da barbearia (`lib/timezone.ts`). */
  tz: string;
  businessName: string;
  /** O expediente de cada barbeiro, por dia da semana (`lib/gradeDeHorarios.ts`). */
  expediente: Record<number, Semana>;
}

/** A faixa de números da ficha do cliente. */
export interface FichaDoCliente {
  totalCount: number;
  completedCount: number;
  noShowCount: number;
  noShowRate: number;
  totalSpentCents: number;
  firstVisitAt: string | null;
  favoriteService: string | null;
}

/** Uma visita do histórico do cliente. */
export interface VisitaDoHistorico {
  id: number;
  startsAt: string;
  status: string;
  priceCents: number;
  /** A soma dos itens da comanda dessa visita, em centavos. */
  itemsCents: number;
  serviceName: string;
  barberName: string;
}
