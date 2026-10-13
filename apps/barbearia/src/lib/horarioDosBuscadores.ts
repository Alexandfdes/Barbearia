/**
 * O horário que o site diz aos buscadores — o `openingHoursSpecification` do JSON-LD do
 * `layouts/Layout.astro` —, tirado do horário que o site MOSTRA: o horário de vitrine, que o
 * cadastro preenche e o dono reescreve em Configurações.
 *
 * ── POR QUE ───────────────────────────────────────────────────────────────────
 *
 * Até 13/10/2026 ia fixo, para toda barbearia: segunda a sexta das 9h às 20h, sábado das 9h
 * às 18h — e a faixa de preço "$$". Até a barbearia com o horário padrão do cadastro, que
 * mostra "09:00 — 19:00" no próprio site, dizia ao Google que fechava às 20h
 * (`docs/PENDENCIAS-ABERTAS.md` §2.41).
 *
 * ── A REGRA ───────────────────────────────────────────────────────────────────
 *
 * O horário de vitrine é texto. O cadastro escreve no formato de `horarioDeVitrine`
 * (`lib/provisionarBarbearia.ts`) — "Segunda — Sexta", "09:00 — 19:00", "Fechado" —, mas o
 * dono pode reescrever como quiser. Daqui sai horário só quando TODA linha é lida sem
 * dúvida; uma que não seja, e o site não diz horário nenhum. Horário pela metade diria ao
 * buscador que a barbearia fecha nos dias que ficaram de fora.
 *
 * Lido: um dia ou um intervalo de dias ("Segunda", "Segunda — Sexta", "segunda a sexta",
 * "Terça-feira — Sábado", com ou sem acento); e um intervalo de horas ("09:00 — 19:00",
 * "9h às 19h", "9h30 - 18h"), ou "Fechado". A semana começa na segunda, como no cadastro:
 * "Terça — Domingo" vale; "Sexta — Segunda", não. O mesmo dia em duas linhas vale — o
 * expediente partido —, desde que os horários não se cruzem e nenhuma das duas diga
 * "Fechado".
 */
import type { BusinessHour } from './settings.js';

export interface EspecificacaoDoHorario {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

/** A semana do comércio: começa na segunda (o `weekday` do JavaScript, 0 = domingo). */
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const EM_INGLES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DIA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

/** Minúsculo, sem acento e com um espaço só — "Terça-Feira" vira "terca-feira". */
function normal(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** O separador de um intervalo: travessão, meia-risca, hífen, "a", "às", "até". */
const ATE = String.raw`\s*(?:—|–|-|\ba\b|\bas\b|\bate\b)\s*`;

function umDia(texto: string): number | null {
  return Object.hasOwn(DIA, texto) ? DIA[texto] : null;
}

/** Os dias de um rótulo, na ordem da semana — ou `null` se o rótulo não for lido sem dúvida. */
export function diasDoRotulo(rotulo: string): number[] | null {
  // "-feira" sai antes de procurar o separador: o hífen dele não separa dois dias.
  const t = normal(rotulo).replace(/\b(segunda|terca|quarta|quinta|sexta)[- ]feira\b/g, '$1');
  const sozinho = umDia(t);
  if (sozinho !== null) return [sozinho];
  const partes = t.split(new RegExp(ATE));
  if (partes.length !== 2) return null;
  const [de, ate] = partes.map(umDia);
  if (de === null || ate === null) return null;
  const i = ORDEM.indexOf(de);
  const j = ORDEM.indexOf(ate);
  return i < j ? ORDEM.slice(i, j + 1) : null;
}

/** "9", "09:00", "9h", "9h30" → "09:00"; qualquer outra coisa, `null`. */
function hora(texto: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2})|h(\d{2})?)$/.exec(texto);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? '0');
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** O intervalo de horas de uma linha — `'fechado'`, `{ abre, fecha }`, ou `null` se não for lido. */
export function horasDaLinha(horas: string, fechado: boolean): 'fechado' | { abre: string; fecha: string } | null {
  const t = normal(horas);
  if (fechado || t === 'fechado') return fechado && t !== 'fechado' && t !== '' ? null : 'fechado';
  const partes = t.split(new RegExp(ATE));
  if (partes.length !== 2) return null;
  const [abre, fecha] = partes.map(hora);
  if (!abre || !fecha || abre >= fecha) return null;
  return { abre, fecha };
}

/**
 * A especificação do horário para o JSON-LD — ou `null`, e o site não diz horário: sem
 * horário de vitrine, sem nenhum dia aberto, ou com uma linha que não se lê sem dúvida.
 */
export function especificacaoDoHorario(horarios: BusinessHour[]): EspecificacaoDoHorario[] | null {
  if (horarios.length === 0) return null;
  const porDia = new Map<number, ('fechado' | { abre: string; fecha: string })[]>();
  for (const linha of horarios) {
    const dias = diasDoRotulo(linha.label);
    const horas = horasDaLinha(linha.hours, linha.closed);
    if (!dias || !horas) return null;
    for (const d of dias) porDia.set(d, [...(porDia.get(d) ?? []), horas]);
  }

  const grupos = new Map<string, number[]>();
  for (const d of ORDEM) {
    const doDia = porDia.get(d) ?? [];
    if (doDia.length === 0) continue;
    if (doDia.includes('fechado')) {
      if (doDia.length > 1) return null; // fechado e aberto no mesmo dia
      continue;
    }
    const faixas = (doDia as { abre: string; fecha: string }[]).slice().sort((a, b) => a.abre.localeCompare(b.abre));
    for (let k = 1; k < faixas.length; k++) {
      if (faixas[k].abre < faixas[k - 1].fecha) return null; // dois horários que se cruzam
    }
    for (const f of faixas) {
      const chave = `${f.abre}|${f.fecha}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), d]);
    }
  }
  if (grupos.size === 0) return null;

  return [...grupos].map(([chave, dias]) => {
    const [abre, fecha] = chave.split('|');
    return { '@type': 'OpeningHoursSpecification', dayOfWeek: dias.map((d) => EM_INGLES[d]), opens: abre, closes: fecha };
  });
}
