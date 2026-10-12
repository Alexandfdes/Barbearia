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

/** Um atendimento do dia, como a tela usa: já com a hora local e o preço formatado. */
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
  /** Produtos e extras da comanda, em centavos. */
  itemsCents: number;
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
  startHour: number;
  totalHours: number;
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
  serviceName: string;
  barberName: string;
}
