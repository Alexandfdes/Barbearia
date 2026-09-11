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
let poolCriado: ReturnType<typeof postgres> | null = null;

function pool(): ReturnType<typeof postgres> {
  if (poolCriado) return poolCriado;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não definido. Exemplo: postgres://usuario:senha@host:5432/barbearia'
    );
  }

  // `max` limita o pool: com dois apps no mesmo Postgres, somar pools maiores que
  // o `max_connections` do servidor derruba os dois ao mesmo tempo.
  poolCriado = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // As colunas de data são TEXT com ISO string, não timestamptz — o driver não
    // deve tentar converter nada sozinho. Ver o comentário no schema.
    transform: { undefined: null },
  });
  return poolCriado;
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
      if (propriedade === 'end' && !poolCriado) return async () => {};
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
  const conexao = await sqlConn.reserve();

  // O Drizzle lê `options` do cliente para instalar os parsers dele, e a conexão
  // reservada não expõe as do pool. Sem esta linha ele estoura em `parsers`.
  (conexao as unknown as { options: unknown }).options = sqlConn.options;

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
