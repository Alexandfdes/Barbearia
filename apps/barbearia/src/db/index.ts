/**
 * Conexão com o Postgres.
 *
 * Passo 2 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9: o banco deixa de ser um
 * arquivo SQLite por barbearia e passa a ser um Postgres único.
 *
 * ⚠️ O export `sqlite` (better-sqlite3) NÃO existe mais. Quem usava SQL cru por
 * ele — `lib/bookAppointment.ts` e `pages/admin/index.astro` — passa a usar a
 * API assíncrona do Drizzle ou `sqlConn` para SQL literal.
 *
 * Onde o Postgres roda (VPS ou gerenciado) é decisão de infraestrutura e não
 * aparece aqui: entra inteira na `DATABASE_URL`.
 *
 * ── DUAS CONEXÕES, E A DIFERENÇA IMPORTA (passo 5.1, RLS) ────────────────────
 *
 * `db`      → a conexão da REQUISIÇÃO. Roda como `barbearia_app`, sob as
 *             políticas de row level security da migration 0003: enxerga só a
 *             barbearia da requisição, e **nada** se nenhuma tiver sido gravada.
 *             É o que 64 arquivos importam, e é o que deve ser usado sempre.
 *
 * `dbDono`  → a conexão do DONO das tabelas, que o Postgres deixa passar por
 *             cima das políticas. Enxerga todas as barbearias.
 *
 * `dbDono` existe para os dois lugares onde olhar antes de saber de quem é a
 * requisição é o trabalho, não o erro: descobrir a barbearia pelo telefone no
 * login, e carregar a tabela de roteamento. Cada uso novo dele é um furo na
 * rede — `tests/rls.test.ts` mantém a lista fechada e falha se ela crescer.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { armazemTenant } from './contexto.js';

/**
 * ⚠️ A conexão nasce no PRIMEIRO USO, não ao importar este arquivo.
 *
 * Antes, `DATABASE_URL` ausente estourava no topo do módulo. Parecia rigor e era
 * um buraco: **qualquer** arquivo que importasse daqui, mesmo de longe, deixava
 * de poder ser carregado sem banco — e `lib/tenant.ts` importa daqui, então
 * `lib/uploads.ts` e meia dúzia de outros também, por tabela.
 *
 * O efeito aparecia só na máquina de quem não exporta `DATABASE_URL`: os testes
 * que NÃO precisam de banco quebravam no import, antes do `describe.skipIf` ter
 * chance de pular. Ficavam vermelhos sem ter nada a ver com o assunto.
 *
 * A mensagem continua igual e o erro continua existindo — só mudou de hora: sai
 * quando alguém tenta CONSULTAR sem `DATABASE_URL`, não quando alguém importa um
 * tipo. E produção não perdeu nada: `scripts/startup.mjs` roda antes do servidor
 * no CMD do Dockerfile e já recusa subir sem a variável.
 */
/*
 * ── DOIS POOLS, E NÃO UM (26/10/2026) ───────────────────────────────────────
 *
 * Até 26/10 havia um pool só. `comTenant` reservava uma conexão dele para a
 * requisição inteira — e, no meio da requisição, `sqlConn`/`dbDono` pediam OUTRA
 * ao mesmo pool (trocar o fuso, a tela de assinatura, o cancelar). Com `max`
 * requisições assim ao mesmo tempo, cada uma segurava a sua e esperava uma que só
 * as outras liberariam — e o postgres.js espera sem prazo. Reproduzido: 12 trocas
 * de fuso simultâneas deixaram TODAS as barbearias sem resposta, a saúde em 503,
 * até reiniciar o container. Com `DATABASE_POOL_MAX=1`, bastava uma.
 *
 * Agora as conexões reservadas saem de um pool (`DATABASE_POOL_MAX`) e as do dono
 * de outro (`DATABASE_POOL_DONO_MAX`). Quem segura uma reservada pode esperar pelo
 * do dono; quem está no do dono nunca espera por uma reservada — não há ciclo.
 * `tests/pool-sem-trava.test.ts` reproduz o travamento.
 *
 * ⚠️ A soma dos dois `max` (mais o de outros apps no mesmo Postgres) tem de caber
 * no `max_connections` do servidor — senão o banco recusa e derruba os dois.
 */
let poolCriado: ReturnType<typeof postgres> | null = null;
let poolDasRequisicoesCriado: ReturnType<typeof postgres> | null = null;

function novoPool(max: number): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não definido. Exemplo: postgres://usuario:senha@host:5432/barbearia'
    );
  }
  return postgres(url, {
    max,
    // As colunas de data são TEXT com ISO string, não timestamptz — o driver não
    // deve tentar converter nada sozinho. Ver o comentário no schema.
    transform: { undefined: null },
  });
}

function maximo(valor: string | undefined, padrao: number): number {
  const n = Number(valor ?? padrao);
  return Number.isInteger(n) && n >= 1 ? n : padrao;
}

/** O pool do dono: `sqlConn`, `dbDono`, scripts, migrations e testes. */
function pool(): ReturnType<typeof postgres> {
  return (poolCriado ??= novoPool(maximo(process.env.DATABASE_POOL_DONO_MAX, 5)));
}

/** O pool das conexões reservadas por requisição (`comTenant`). */
function poolDasRequisicoes(): ReturnType<typeof postgres> {
  return (poolDasRequisicoesCriado ??= novoPool(maximo(process.env.DATABASE_POOL_MAX, 10)));
}

/**
 * Quanto uma requisição espera por uma conexão reservada antes de desistir. Sem
 * prazo, uma fila de requisições num pool cheio crescia sem fim; com ele, a que
 * passou do tempo responde erro e o resto do app segue.
 */
const esperaPorConexaoMs = (): number => maximo(process.env.DATABASE_ESPERA_MS, 15_000);

/**
 * Fecha os dois pools — é o que o `sqlConn.end()` faz. Fechado, fica fechado: a consulta
 * seguinte falha, como antes de haver dois (`tests/saude.test.ts` conta com isso).
 */
async function encerrarPools(opcoes?: { timeout?: number }): Promise<void> {
  const abertos = [poolCriado, poolDasRequisicoesCriado].filter(Boolean) as ReturnType<typeof postgres>[];
  await Promise.all(abertos.map((p) => p.end(opcoes)));
}

let dbDonoCriado: ReturnType<typeof drizzle> | null = null;

function donoReal(): ReturnType<typeof drizzle> {
  return (dbDonoCriado ??= drizzle(pool(), { schema }));
}

/**
 * Conexão para SQL literal (`sqlConn\`SELECT ...\``), usada onde o Drizzle não
 * expressa bem — agregações do painel, por exemplo.
 */
export const sqlConn: ReturnType<typeof postgres> = new Proxy(
  (() => {}) as unknown as ReturnType<typeof postgres>,
  {
    apply: (_a, _b, args) => (pool() as unknown as (...x: unknown[]) => unknown)(...args),
    get(_alvo, propriedade) {
      // Fechar uma conexão que nunca foi aberta não precisa abri-la primeiro.
      // Sem esta saída, o `afterAll` de um teste sem banco criaria o pool só
      // para encerrá-lo — e estouraria por falta de `DATABASE_URL`.
      if (propriedade === 'end') return encerrarPools;
      const real = pool();
      const valor = Reflect.get(real as object, propriedade);
      return typeof valor === 'function' ? valor.bind(real) : valor;
    },
  },
);

/** O Drizzle do dono das tabelas. Ver o aviso no cabeçalho antes de usar. */
export const dbDono: ReturnType<typeof drizzle> = new Proxy(
  {} as ReturnType<typeof drizzle>,
  {
    get(_alvo, propriedade) {
      const real = donoReal();
      const valor = Reflect.get(real as object, propriedade);
      return typeof valor === 'function' ? valor.bind(real) : valor;
    },
  },
);

/**
 * O Drizzle da requisição.
 *
 * É um proxy: cada acesso a propriedade resolve para o Drizzle da conexão
 * reservada, quando existe uma requisição com tenant em curso, e para o do dono
 * fora dela (migrations, scripts, testes, o carregamento da tabela de tenants).
 *
 * ⚠️ Por que proxy e não passar a conexão como argumento: as 64 rotas e páginas
 * fazem `import { db }` no topo e chamam `db.select(...)` no corpo. Trocar isso
 * por um parâmetro seria 64 arquivos e 64 chances de esquecer um — e o esquecido
 * não falharia, só deixaria de ser protegido, em silêncio. O proxy faz a rota
 * continuar igual e a proteção valer para todas de uma vez.
 *
 * Os métodos vão amarrados (`bind`) ao objeto real: sem isso, o `this` de dentro
 * do Drizzle seria o proxy, e o que é detalhe interno dele passaria a depender
 * deste arquivo.
 */
export const db: typeof dbDono = new Proxy({} as typeof dbDono, {
  get(_alvo, propriedade) {
    const real = armazemTenant.getStore()?.db ?? donoReal();
    const valor = Reflect.get(real as object, propriedade);
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
});

/**
 * Ensina a conexão reservada a abrir transação — ela não sabe sozinha.
 *
 * ⚠️ O DEFEITO QUE ISTO CONSERTA, ACHADO EM 25/09/2026.
 *
 * `sqlConn.reserve()` do postgres.js devolve um objeto com `unsafe`, `array`,
 * `json`, `file` e pouco mais: **não tem `begin()`**. E a transação do Drizzle
 * (`db.transaction`) é, por dentro, `client.begin(...)`. Então toda transação dentro de uma
 * requisição com barbearia estourava "this.client.begin is not a function" —
 * inclusive **o agendamento pelo site**, que é uma transação. Com a suíte verde:
 * os testes chamavam as rotas fora de `comTenant`, no pool, que tem `begin()`.
 * Ver `tests/transacao-na-requisicao.test.ts`.
 *
 * A transação roda NA PRÓPRIA conexão reservada, e isso é o que importa: é nela
 * que estão o `SET ROLE barbearia_app` e o `app.tenant_id`. Abrir a transação em
 * outra conexão do pool seria rodar como dono, sem RLS.
 *
 * Uma transação por vez: duas em paralelo na mesma conexão se intercalariam, e o
 * COMMIT de uma confirmaria metade da outra. Recusar com o motivo é melhor do que
 * corromper em silêncio. Transação dentro de transação (`tx.transaction`) vira
 * SAVEPOINT, como no postgres.js de verdade.
 */
export function ensinarTransacao(conexao: ReturnType<typeof postgres>): void {
  type Corpo = (cliente: unknown) => Promise<unknown>;
  let aberta = false;
  let pontos = 0;

  const corpoDe = (a: unknown, b: unknown): Corpo => (typeof a === 'function' ? a : b) as Corpo;

  async function begin(a: unknown, b?: unknown): Promise<unknown> {
    const corpo = corpoDe(a, b);
    // Mesma higiene do postgres.js: as opções viram parte do comando.
    const opcoes = typeof a === 'string' ? a.replace(/[^a-z ]/gi, '') : '';
    if (aberta) {
      throw new Error(
        'Esta requisição já tem uma transação aberta, e a conexão reservada faz uma transação por vez. ' +
        'Use o `tx` da transação que já existe em vez de abrir outra em paralelo.',
      );
    }
    aberta = true;
    try {
      await conexao.unsafe(`BEGIN ${opcoes}`.trim());
      try {
        const resultado = await corpo(conexao);
        await conexao.unsafe('COMMIT');
        return resultado;
      } catch (erro) {
        // Sem o ROLLBACK a conexão ficaria "em transação abortada" e toda
        // consulta seguinte, desta requisição ou da próxima, levaria erro.
        await conexao.unsafe('ROLLBACK').catch(() => {});
        throw erro;
      }
    } finally {
      aberta = false;
    }
  }

  async function savepoint(a: unknown, b?: unknown): Promise<unknown> {
    const corpo = corpoDe(a, b);
    const nome = `ponto_${++pontos}`;
    await conexao.unsafe(`SAVEPOINT ${nome}`);
    try {
      const resultado = await corpo(conexao);
      await conexao.unsafe(`RELEASE SAVEPOINT ${nome}`);
      return resultado;
    } catch (erro) {
      await conexao.unsafe(`ROLLBACK TO SAVEPOINT ${nome}`).catch(() => {});
      throw erro;
    }
  }

  Object.assign(conexao, { begin, savepoint });
}

/**
 * Roda `fn` com a barbearia gravada na conexão — é isto que liga o RLS.
 *
 * Reserva uma conexão do pool só para esta requisição, assume o papel
 * `barbearia_app` (o dono passaria por cima das políticas) e grava
 * `app.tenant_id`. No fim devolve a conexão limpa.
 *
 * ⚠️ Se a limpeza falhar, a conexão é FECHADA em vez de devolvida ao pool.
 * Uma conexão que voltasse ainda como `barbearia_app` com o tenant de outra
 * barbearia serviria a próxima requisição com o crachá errado — o defeito exato
 * que este passo existe para impedir. Fechar custa uma reconexão; devolver suja
 * custa o produto.
 */
export async function comTenant<T>(
  tenant: { id: number; slug: string; status: string; domain: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  const doPool = poolDasRequisicoes();
  const pedido = doPool.reserve();
  let prazo: ReturnType<typeof setTimeout> | undefined;
  const conexao = await Promise.race([
    pedido,
    new Promise<never>((_, recusar) => {
      prazo = setTimeout(() => recusar(new Error(
        `Nenhuma conexão com o banco livre em ${esperaPorConexaoMs() / 1000}s — o pool das requisições está cheio.`,
      )), esperaPorConexaoMs());
    }),
  ]).catch((erro) => {
    // A conexão que chegar depois do prazo volta ao pool em vez de ficar presa.
    pedido.then((c) => c.release(), () => {});
    throw erro;
  }).finally(() => clearTimeout(prazo));

  // O Drizzle lê `options` do cliente para instalar os parsers dele, e a conexão
  // reservada não expõe as do pool. Sem esta linha ele estoura em `parsers`.
  (conexao as unknown as { options: unknown }).options = doPool.options;
  ensinarTransacao(conexao);

  try {
    await conexao`SET ROLE barbearia_app`;
    // `set_config(..., false)` = vale para a conexão, não para a transação:
    // as consultas da requisição não estão todas dentro de uma transação só.
    await conexao`SELECT set_config('app.tenant_id', ${String(tenant.id)}, false)`;

    const contexto = { tenant, db: drizzle(conexao, { schema }) };
    return await armazemTenant.run(contexto, fn);
  } finally {
    try {
      await conexao`RESET ROLE`;
      await conexao`RESET app.tenant_id`;
      conexao.release();
    } catch {
      // Não deu para limpar: a conexão não volta para o pool.
      try { await (conexao as unknown as { end: () => Promise<void> }).end(); } catch { /* já caiu */ }
    }
  }
}

/**
 * Primeira linha de uma consulta, ou `undefined`.
 *
 * Substitui o `.get()` do better-sqlite3, que não existe no driver do Postgres.
 * Mantido como helper em vez de `(await q)[0]` espalhado: fica um lugar só se
 * um dia valer a pena acrescentar `LIMIT 1` automático.
 */
export async function first<T>(q: PromiseLike<T[]>): Promise<T | undefined> {
  return (await q)[0];
}
