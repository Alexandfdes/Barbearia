/**
 * O CEP que preenche o endereço — no cadastro e em Configurações (12/11/2026).
 *
 * O dono digita o CEP, e a rua, a cidade e o estado vêm sozinhos; o número é dele. O CEP não
 * fica guardado em lugar nenhum (decisão do dono em 12/11/2026, "só preencher"): o campo não
 * vai no envio do cadastro e não tem `data-campo` em Configurações — não entra no Salvar.
 *
 * ── DE ONDE VEM ────────────────────────────────────────────────────────────
 *
 * O navegador do dono pergunta direto ao ViaCEP e, se ele não responder ou não conhecer o
 * CEP, à BrasilAPI. Nada passa pelo nosso servidor, de propósito:
 *  - uma rota nossa (`/api/cep/<cep>`, o primeiro plano) seria um repasse aberto: quem quisesse
 *    martelaria os dois serviços pelo IP do servidor, e o bloqueio cairia sobre todo cliente;
 *  - a rede de saída do servidor estava sob suspeita em 11/11/2026 (o backup recusado,
 *    `docs/PENDENCIAS-ABERTAS.md` §3.3) — daqui, ela não importa.
 * Rejeitada a rota, por isso. O que custa: o IP de quem digita chega aos dois serviços, junto
 * com o CEP — o aviso de privacidade final precisa dizer (`docs/PENDENCIAS-ABERTAS.md` §1.2).
 *
 * ⚠️ Se o painel ganhar uma `Content-Security-Policy`, o `connect-src` dela tem de aceitar os
 * dois endereços abaixo — senão a busca falha sempre e a tela diz "não respondeu". O
 * `tests/cep.test.ts` reprova a CSP que os esquecer.
 *
 * ⚠️ O formato das respostas é o que os dois serviços documentam; daqui da nuvem, onde os
 * testes rodam, eles não respondem. O primeiro CEP digitado de verdade é a conferência.
 */

export const VIACEP = 'https://viacep.com.br/ws/';
export const BRASILAPI = 'https://brasilapi.com.br/api/cep/v2/';

/** Quanto cada serviço tem para responder. Os dois fora: 8 s até a tela dizer — sem travar nada. */
export const PRAZO_DE_CADA_SERVICO_MS = 4000;

/** O endereço que um CEP diz. `rua` e `bairro` vêm vazios no CEP de cidade inteira. */
export interface EnderecoDoCep {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export type ResultadoDoCep =
  | { tipo: 'achou'; endereco: EnderecoDoCep }
  /** Um dos serviços respondeu que o CEP não existe. */
  | { tipo: 'nao-achou' }
  /** Nenhum respondeu a tempo, ou respondeu o que não se entende. */
  | { tipo: 'fora' }
  | { tipo: 'invalido' }
  /** Outro CEP foi digitado no meio da busca: esta não vale mais. */
  | { tipo: 'cancelado' };

/** Os 8 números do CEP, de qualquer jeito que ele venha escrito; `null` se não forem 8. */
export function digitosDoCep(texto: string): string | null {
  const d = texto.replace(/\D/g, '');
  return d.length === 8 ? d : null;
}

/** O CEP como se escreve, `59600-000`, enquanto a pessoa digita ou cola. */
export function mascaraDoCep(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ── As respostas ─────────────────────────────────────────────────────────────

type Leitura = EnderecoDoCep | 'nao-achou' | null;

/** Texto de um campo da resposta: ausente vira vazio; o que não é texto, ou é comprido demais, `null`. */
function textoDe(v: unknown, maximo: number): string | null {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length <= maximo ? t : null;
}

/**
 * O endereço, se a resposta tem forma de endereço. Os tetos são folga sobre o maior campo
 * do cadastro dos Correios (72): o que passa disso não é endereço, e "Cidade/UF" cabe nos
 * 80 que Configurações aceita.
 */
function enderecoDe(cep: string, c: { rua: unknown; bairro: unknown; cidade: unknown; uf: unknown }): EnderecoDoCep | null {
  const rua = textoDe(c.rua, 100);
  const bairro = textoDe(c.bairro, 80);
  const cidade = textoDe(c.cidade, 72);
  const uf = typeof c.uf === 'string' ? c.uf.trim().toUpperCase() : '';
  if (rua === null || bairro === null || !cidade || !/^[A-Z]{2}$/.test(uf)) return null;
  return { cep, rua, bairro, cidade, uf };
}

const objeto = (corpo: unknown): Record<string, unknown> =>
  corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : {};

/** O ViaCEP: `{ logradouro, bairro, localidade, uf }`; o CEP que não existe vem `{ erro: true }` — ou `"true"`, em texto. */
export function lerViaCep(cep: string, status: number, corpo: unknown): Leitura {
  if (status !== 200) return null;
  const c = objeto(corpo);
  if (c.erro === true || c.erro === 'true') return 'nao-achou';
  return enderecoDe(cep, { rua: c.logradouro, bairro: c.bairro, cidade: c.localidade, uf: c.uf });
}

/**
 * A BrasilAPI: `{ street, neighborhood, city, state }`. O CEP que não existe é o 404 com o
 * `CepPromiseError` dela; outro 404 é o endereço da API que mudou — falha, não resposta.
 */
export function lerBrasilApi(cep: string, status: number, corpo: unknown): Leitura {
  const c = objeto(corpo);
  if (status === 404) return c.name === 'CepPromiseError' ? 'nao-achou' : null;
  if (status !== 200) return null;
  return enderecoDe(cep, { rua: c.street, bairro: c.neighborhood, cidade: c.city, uf: c.state });
}

const SERVICOS: { url: (cep: string) => string; ler: typeof lerViaCep }[] = [
  { url: (cep) => `${VIACEP}${cep}/json/`, ler: lerViaCep },
  { url: (cep) => `${BRASILAPI}${cep}`, ler: lerBrasilApi },
];

// ── A busca ──────────────────────────────────────────────────────────────────

/** O pedaço do `fetch` que a busca usa — nos testes, um falso. */
export type Buscador = (url: string, init: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface OpcoesDaBusca {
  fetch?: Buscador;
  prazoMs?: number;
  /** Abortado quando a pessoa digita outro CEP. */
  sinal?: AbortSignal;
}

async function perguntar(url: string, ler: typeof lerViaCep, cep: string, fetch: Buscador, prazoMs: number, sinal?: AbortSignal): Promise<Leitura> {
  // `AbortSignal.timeout` e `AbortSignal.any` faltam no Safari de iPhone mais velho: à mão.
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), prazoMs);
  const cancelar = () => controle.abort();
  sinal?.addEventListener('abort', cancelar);
  try {
    // Sem cookie e sem dizer de que tela veio: o serviço só precisa do CEP.
    const resposta = await fetch(url, {
      signal: controle.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json' },
    });
    let corpo: unknown = null;
    try {
      corpo = await resposta.json();
    } catch {
      // Não é JSON (a página de erro de um deles): fica nulo, e a leitura decide.
    }
    return ler(cep, resposta.status, corpo);
  } catch {
    return null;
  } finally {
    clearTimeout(prazo);
    sinal?.removeEventListener('abort', cancelar);
  }
}

/**
 * O endereço do CEP: o ViaCEP primeiro e, se ele falhar ou disser que não conhece, a
 * BrasilAPI — que junta outras fontes e às vezes conhece o CEP novo. "Não achei" só quando um
 * deles disse que o CEP não existe; os dois mudos, "fora". Nunca lança.
 */
export async function buscarCep(texto: string, opcoes: OpcoesDaBusca = {}): Promise<ResultadoDoCep> {
  const cep = digitosDoCep(texto);
  if (!cep) return { tipo: 'invalido' };
  const fetch = opcoes.fetch ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  const prazoMs = opcoes.prazoMs ?? PRAZO_DE_CADA_SERVICO_MS;
  let disseQueNaoExiste = false;
  for (const servico of SERVICOS) {
    if (opcoes.sinal?.aborted) return { tipo: 'cancelado' };
    const lido = await perguntar(servico.url(cep), servico.ler, cep, fetch, prazoMs, opcoes.sinal);
    if (opcoes.sinal?.aborted) return { tipo: 'cancelado' };
    if (lido === 'nao-achou') disseQueNaoExiste = true;
    else if (lido) return { tipo: 'achou', endereco: lido };
  }
  return { tipo: disseQueNaoExiste ? 'nao-achou' : 'fora' };
}

// ── A rua no campo ───────────────────────────────────────────────────────────

/** Para comparar rua com rua: sem acento, sem maiúscula, um espaço só. */
const comparavel = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * O que vai no campo "Rua e número" depois do CEP — `null` deixa o que está lá.
 *
 * - CEP de cidade inteira, sem rua: a rua é de quem digita.
 * - O campo já começa por esta rua, seguida de vírgula, número ou traço ("Rua das Flores, 42"):
 *   é a mesma, e o número fica. É o que acontece quando o navegador preenche o CEP e a rua
 *   juntos, ou quando o mesmo CEP é digitado de novo.
 * - O resto: a rua do CEP e a vírgula, para o número vir logo depois. A rua que estava lá
 *   sai — trocar o CEP é dizer que o endereço é outro.
 *
 * O bairro não entra: o campo é "Rua e número", como o site mostra — e a conferência do ponto
 * no mapa (`lib/mapa.ts`) cuida da rua de nome repetido na cidade.
 */
export function ruaNoCampo(atual: string, achada: string): string | null {
  const rua = achada.trim();
  if (!rua) return null;
  const a = comparavel(atual);
  const r = comparavel(rua);
  if (a.startsWith(r) && /^\s*[^\s\p{L}]/u.test(a.slice(r.length))) return null;
  return `${rua}, `;
}

/** O que a linha embaixo do CEP diz depois da busca. */
export function avisoDoCep(r: ResultadoDoCep, trocouARua: boolean): string {
  switch (r.tipo) {
    case 'achou': {
      const { rua, bairro, cidade, uf } = r.endereco;
      if (!rua) return `Esse CEP vale para toda a cidade de ${cidade}/${uf}: escreva a rua e o número.`;
      const achado = `${[rua, bairro].filter(Boolean).join(', ')} — ${cidade}/${uf}.`;
      return trocouARua
        ? `${achado} Escreva o número depois da vírgula.`
        : `${achado} A rua já estava escrita: confira o número.`;
    }
    case 'nao-achou': return 'Não achei esse CEP. Confira os números ou escreva o endereço à mão.';
    case 'fora': return 'A busca do CEP não respondeu agora. Escreva o endereço à mão.';
    default: return '';
  }
}

// ── A ligação com a tela ─────────────────────────────────────────────────────

/** O que a ligação usa de um campo. Um `<input>` serve; nos testes, um objeto simples. */
export interface CampoDeTexto {
  value: string;
  addEventListener(tipo: string, ouvinte: (evento: { key?: string; preventDefault?: () => void }) => void): void;
  dispatchEvent?(evento: Event): boolean;
  focus?(): void;
  setSelectionRange?(inicio: number, fim: number): void;
}

export interface LigacaoDoCep {
  cep: CampoDeTexto;
  aviso: { textContent: string | null };
  rua: CampoDeTexto;
  /** A cidade e o estado: o cadastro guarda em dois campos; Configurações, em "Cidade/UF". */
  cidade: (endereco: EnderecoDoCep) => void;
  buscar?: (cep: string, sinal: AbortSignal) => Promise<ResultadoDoCep>;
}

/**
 * Liga o campo do CEP à rua e à cidade da tela: a máscara enquanto digita, a busca no oitavo
 * número, e o aviso de cada desfecho. A busca nunca trava o formulário — quem não sabe o CEP
 * escreve o endereço como antes.
 *
 * O cursor vai para a rua, no fim, só se a pessoa ainda está no CEP: sem isso, o Tab até a rua
 * SELECIONA o texto todo, e o número digitado apagaria a rua. Com ela já noutro campo, o foco
 * fica onde está.
 */
export function ligarBuscaDoCep({ cep, aviso, rua, cidade, buscar = (c, sinal) => buscarCep(c, { sinal }) }: LigacaoDoCep): void {
  let emCurso: AbortController | null = null;
  let noCep = false;
  const dizer = (texto: string) => { aviso.textContent = texto; };

  cep.addEventListener('focus', () => { noCep = true; });
  cep.addEventListener('blur', () => {
    noCep = false;
    const n = cep.value.replace(/\D/g, '').length;
    if (n > 0 && n < 8) dizer('O CEP tem 8 números.');
  });
  // Enter no CEP não envia o cadastro pela metade: a busca já saiu sozinha.
  cep.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault?.(); });

  cep.addEventListener('input', () => {
    const escrito = mascaraDoCep(cep.value);
    if (escrito !== cep.value) cep.value = escrito;
    emCurso?.abort();
    emCurso = null;
    const digitos = digitosDoCep(escrito);
    if (!digitos) {
      dizer('');
      return;
    }
    const controle = new AbortController();
    emCurso = controle;
    dizer('Buscando o endereço…');
    buscar(digitos, controle.signal)
      .catch((): ResultadoDoCep => ({ tipo: 'fora' }))
      .then((r) => {
        if (controle.signal.aborted || r.tipo === 'cancelado') return;
        emCurso = null;
        let trocou = false;
        if (r.tipo === 'achou') {
          const nova = ruaNoCampo(rua.value, r.endereco.rua);
          if (nova !== null) {
            rua.value = nova;
            trocou = true;
            // Configurações escuta: o aviso de "não salvo" e a prévia do mapa.
            rua.dispatchEvent?.(new Event('input', { bubbles: true }));
            if (noCep) {
              rua.focus?.();
              rua.setSelectionRange?.(nova.length, nova.length);
            }
          }
          cidade(r.endereco);
        }
        dizer(avisoDoCep(r, trocou));
      });
  });
}
