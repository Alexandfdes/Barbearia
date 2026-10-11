/**
 * O painel do operador — a porta: em que endereço ele abre, a senha e a sessão.
 *
 * Decisão de 11/10/2026 (`docs/PENDENCIAS-ABERTAS.md` §3.9): o dono do PRODUTO
 * precisa ver as barbearias cadastradas, em que fase cada uma está, e agir —
 * estender o teste, tirar do ar, reativar. Até aqui era `psql` em produção.
 * O que o painel mostra e faz está em `lib/operadorBarbearias.ts`; aqui fica só
 * quem entra.
 *
 * ── AS TRÊS TRAVAS ───────────────────────────────────────────────────────────
 *
 *  1. **Desligado por padrão.** Sem `OPERADOR_SENHA_HASH`, ou com ela fora do
 *     formato, `/operador` não existe: 404, igual a qualquer endereço inventado.
 *     Esquecer a variável fecha a porta; não a deixa aberta sem senha.
 *  2. **Só no endereço do painel** (`urlDoPainel()`, o mesmo do link dos e-mails).
 *     No site de uma barbearia, `/operador` é 404 — o cookie do operador nunca
 *     nasce num endereço de cliente, e nenhum site de cliente anuncia que a página
 *     existe. Não é a trava que protege: o `Host` é escrito por quem pede. Quem
 *     protege é a senha.
 *  3. **A senha.** Só ela — decisão do dono em 11/10/2026, com o risco dito e
 *     aceito: é a tela mais poderosa do produto, e não tem segundo fator. Quem
 *     tiver a senha tira qualquer barbearia do ar. Por isso: hash lento (scrypt),
 *     limite de tentativas por IP e no total, sessão de 8 horas, e toda entrada
 *     gravada (`registrarEntrada`, em `lib/operadorBarbearias.ts`) — uma entrada
 *     que não foi sua aparece lá. Este arquivo não toca o banco.
 *
 * ── POR QUE SCRYPT, E NÃO O BCRYPT DAS SENHAS DOS BARBEIROS ──────────────────
 *
 * O hash mora numa variável de ambiente, e o do bcrypt é cheio de `$`
 * (`$2b$12$...`) — que arquivo `.env` e `docker-compose` podem ler como variável
 * e trocar por vazio, em silêncio: a senha certa passaria a ser recusada sem
 * nenhum erro dizendo por quê. O formato daqui só tem letras, números, `-`, `_` e
 * `:`. E o scrypt já vem no Node, sem dependência nova.
 *
 * Formato: `scrypt:<custo>:<r>:<p>:<sal>:<chave>` — custo é o log₂ do N; sal e
 * chave em base64url. Quem gera é `scripts/operador-senha.mjs`
 * (`npm run operador:senha`), que tem a MESMA conta — `tests/operador.test.ts`
 * confere que um hash do script é aceito aqui.
 */
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { sealData, unsealData } from 'iron-session';
import { urlDoPainel } from './tenant.js';

type Ambiente = Record<string, string | undefined>;

export const VARIAVEL_DA_SENHA = 'OPERADOR_SENHA_HASH';
export const COOKIE_DO_OPERADOR = '__fadeline_operador';

/** 8 horas: um dia de trabalho. Fechou e voltou no dia seguinte, entra de novo. */
export const DURACAO_DA_SESSAO = 8 * 60 * 60;

/** A senha mínima que o script aceita. Sem segundo fator, a senha é tudo. */
export const SENHA_MINIMA = 12;

interface Parametros { custo: number; r: number; p: number; sal: Buffer; chave: Buffer }

const FORMATO = /^scrypt:(\d{1,2}):(\d{1,2}):(\d{1,2}):([A-Za-z0-9_-]{16,}):([A-Za-z0-9_-]{32,})$/;

let avisouFormato = false;

/**
 * O hash da variável, aberto — ou `null` se não existe ou está fora do formato.
 *
 * Fora do formato é painel DESLIGADO, com uma linha no log: colar a senha no
 * lugar do hash, ou um hash cortado pela metade, não pode virar porta aberta nem
 * erro 500 na cara de quem tenta entrar.
 */
export function lerHash(texto: string | undefined): Parametros | null {
  const limpo = texto?.trim();
  if (!limpo) return null;
  const m = FORMATO.exec(limpo);
  const p = m && {
    custo: Number(m[1]), r: Number(m[2]), p: Number(m[3]),
    sal: Buffer.from(m[4], 'base64url'), chave: Buffer.from(m[5], 'base64url'),
  };
  // Os limites barram tanto o hash fraco demais quanto o que travaria o servidor
  // (custo 30 seria 1 GiB de memória a cada tentativa de senha).
  if (!p || p.custo < 14 || p.custo > 20 || p.r < 1 || p.r > 32 || p.p < 1 || p.p > 4
      || p.sal.length < 16 || p.chave.length < 32) {
    if (!avisouFormato) {
      console.error(`[operador] ${VARIAVEL_DA_SENHA} está fora do formato de "npm run operador:senha" — o painel do operador fica desligado.`);
      avisouFormato = true;
    }
    return null;
  }
  return p;
}

function derivar(senha: string, sal: Buffer, custo: number, r: number, p: number, tamanho: number): Promise<Buffer> {
  return new Promise((ok, falha) => {
    // NFC: a mesma senha digitada noutro teclado ("é" composto ou decomposto)
    // tem de dar a mesma chave. O script faz igual.
    scrypt(senha.normalize('NFC'), sal, tamanho, { N: 2 ** custo, r, p, maxmem: 256 * 1024 * 1024 },
      (erro, chave) => (erro ? falha(erro) : ok(chave)));
  });
}

/** Gera o hash de uma senha — o mesmo que o script imprime. Usado pelos testes. */
export async function gerarHash(senha: string, custo = 15, r = 8, p = 1): Promise<string> {
  const sal = randomBytes(16);
  const chave = await derivar(senha, sal, custo, r, p, 32);
  return `scrypt:${custo}:${r}:${p}:${sal.toString('base64url')}:${chave.toString('base64url')}`;
}

/** A senha confere com o hash? Comparação em tempo constante. */
export async function conferirSenha(senha: string, hashTexto: string | undefined): Promise<boolean> {
  const h = lerHash(hashTexto);
  if (!h) return false;
  const chave = await derivar(senha, h.sal, h.custo, h.r, h.p, h.chave.length);
  return timingSafeEqual(chave, h.chave);
}

// ── O endereço ──────────────────────────────────────────────────────────────

export type Portao = 'desligado' | 'fora-do-painel' | 'aberto';

/**
 * O painel do operador abre nesta requisição?
 *
 * Quem chama responde 404 IGUAL nos dois "não": nem quem varre endereços nem quem
 * está num site de cliente fica sabendo se a página existe.
 */
export function portaoDoOperador(request: Request, env: Ambiente = process.env): Portao {
  if (!lerHash(env[VARIAVEL_DA_SENHA])) return 'desligado';
  return ehEnderecoDoPainel(request.headers.get('host'), urlDoPainel(env)) ? 'aberto' : 'fora-do-painel';
}

/**
 * O `Host` é o do painel? Compara nome e porta — a porta padrão do protocolo vale
 * escrita ou não (`painel.x.com` e `painel.x.com:443`, com `https`).
 */
export function ehEnderecoDoPainel(host: string | null, painel: string): boolean {
  if (!host || !painel) return false;
  try {
    const p = new URL(painel);
    const h = new URL(`${p.protocol}//${host.trim()}`);
    const sem = (n: string) => n.toLowerCase().replace(/\.$/, '');
    return sem(h.hostname) === sem(p.hostname) && h.port === p.port;
  } catch {
    return false;
  }
}

/** As rotas do painel do operador — o `src/middleware.ts` as deixa passar sem barbearia. */
export function ehRotaDoOperador(caminho: string): boolean {
  return caminho === '/operador' || caminho === '/operador/' || caminho.startsWith('/api/operador/');
}

/** O 404 do operador: o mesmo texto de qualquer endereço que não existe. */
export function naoEncontrado(): Response {
  return new Response('Não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

// ── A sessão ────────────────────────────────────────────────────────────────

interface SessaoDoOperador {
  operador: true;
  /**
   * De QUAL hash esta sessão nasceu. Trocar a senha troca o hash, e toda sessão
   * aberta com o anterior deixa de valer — é assim que se tira de dentro quem
   * soube a senha velha.
   */
  impressao: string;
  emitidaEm: number;
}

function impressaoDoHash(hash: string): string {
  return createHash('sha256').update(hash.trim()).digest('base64url').slice(0, 22);
}

/**
 * A chave do lacre. A MESMA `SESSION_SECRET` da sessão do painel, com um sufixo:
 * o cookie de barbeiro aberto com a chave do operador não abre, e vice-versa —
 * nenhum dos dois serve no lugar do outro, nem por engano.
 */
function chaveDoLacre(env: Ambiente): string {
  const s = env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto: a sessão do operador não pode ser lacrada.');
  return `${s}|operador`;
}

export async function cookieDoOperador(env: Ambiente = process.env): Promise<string> {
  const hash = env[VARIAVEL_DA_SENHA];
  if (!lerHash(hash)) throw new Error(`${VARIAVEL_DA_SENHA} ausente: não há sessão de operador para abrir.`);
  const dados: SessaoDoOperador = { operador: true, impressao: impressaoDoHash(hash!), emitidaEm: Date.now() };
  const selo = await sealData(dados, { password: chaveDoLacre(env), ttl: DURACAO_DA_SESSAO });
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  // `SameSite=Strict`: nenhum link de fora chega já logado. Sem `Domain`: o cookie
  // vale só no endereço do painel, nunca nos subdomínios das barbearias.
  return `${COOKIE_DO_OPERADOR}=${selo}; HttpOnly${secure}; SameSite=Strict; Max-Age=${DURACAO_DA_SESSAO}; Path=/`;
}

export function cookieDeSaida(env: Ambiente = process.env): string {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_DO_OPERADOR}=; HttpOnly${secure}; SameSite=Strict; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** A requisição traz uma sessão de operador válida, do hash de agora e dentro das 8 horas? */
export async function operadorAutenticado(request: Request, env: Ambiente = process.env): Promise<boolean> {
  try {
    const hash = env[VARIAVEL_DA_SENHA];
    if (!lerHash(hash)) return false;
    const m = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE_DO_OPERADOR}=([^;]+)`));
    if (!m) return false;
    const s = await unsealData<Partial<SessaoDoOperador>>(m[1], { password: chaveDoLacre(env), ttl: DURACAO_DA_SESSAO });
    if (s.operador !== true || s.impressao !== impressaoDoHash(hash!)) return false;
    // O lacre vencido já volta como objeto vazio (iron-session 8, conferido em
    // 11/10/2026), e o `operador !== true` acima recusa. O prazo conferido aqui é a
    // regra de 8 horas escrita onde se lê, sem depender dessa escolha da biblioteca.
    return typeof s.emitidaEm === 'number' && Date.now() - s.emitidaEm < DURACAO_DA_SESSAO * 1000;
  } catch {
    return false;
  }
}
