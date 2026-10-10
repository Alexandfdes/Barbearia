/**
 * O mapa e a rota da barbearia — de onde o site tira os dois, num lugar só.
 *
 * Até 10/10/2026 o "Traçar rota", o endereço do rodapé e o "Abrir no Maps" da
 * confirmação do agendamento usavam o `mapsUrl` direto. Ele só existe quando o
 * dono o preenche em Configurações — o cadastro nunca grava —, então em toda
 * barbearia nascida pelo cadastro os três eram link vazio: clicar abria o
 * próprio site de novo. Achado no roteiro de 10/10/2026, usando o produto
 * (`docs/PENDENCIAS-ABERTAS.md` §2.32).
 *
 * ⚠️ O ponto do mapa e o da rota saem da MESMA busca (`buscaDoMapa`). Endereço
 * ambíguo — "nova betania, natal" caiu na Nova Betânia de Mossoró, no mesmo
 * roteiro — erra os dois juntos, em vez de o mapa mostrar um lugar e a rota
 * levar a outro. Conferir o ponto continua sendo do dono.
 */
import type { Settings } from './settings';

type ComEndereco = Pick<Settings, 'mapsUrl' | 'mapsEmbedQuery' | 'addressStreet' | 'addressCity'>;

/** O texto que o Google usa para achar a barbearia: a busca configurada, ou o endereço. Vazio: sem mapa. */
export function buscaDoMapa(s: Omit<ComEndereco, 'mapsUrl'>): string {
  const configurada = s.mapsEmbedQuery?.trim();
  if (configurada) return configurada;
  return [s.addressStreet, s.addressCity].map((p) => p?.trim()).filter(Boolean).join(', ');
}

/** O link que o dono cadastrou, se cadastrou. Vale para tudo: é o lugar que ele escolheu. */
const doDono = (s: ComEndereco) => s.mapsUrl?.trim() || null;

/** Abrir o lugar no Google Maps. `null` quando não há nada para buscar — e o link some. */
export function linkDoMapa(s: ComEndereco): string | null {
  const busca = buscaDoMapa(s);
  return doDono(s) ?? (busca ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}` : null);
}

/** Traçar a rota até a barbearia. `null` quando não há nada para buscar — e o botão some. */
export function linkDaRota(s: ComEndereco): string | null {
  const busca = buscaDoMapa(s);
  return doDono(s) ?? (busca ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(busca)}` : null);
}
