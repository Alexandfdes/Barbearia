/**
 * Troca o usuário com que o app fala com o banco: de SUPERUSUÁRIO para um usuário
 * dono das tabelas, e só delas (decisão de 11/10/2026, `docs/PENDENCIAS-ABERTAS.md`
 * §3.10). Roda uma vez por banco; rodar de novo não estraga nada.
 *
 * ── POR QUE ──────────────────────────────────────────────────────────────────
 *
 * Em produção o `DATABASE_URL` do app é o superusuário que a imagem do Postgres
 * cria. O RLS não muda com isso — o caminho do dono já passava por cima dele —, mas
 * um defeito que deixasse SQL arbitrário chegar ao banco viraria comando com poder
 * total: ler arquivo do servidor, mexer em outro banco, criar usuário. O app não
 * precisa de nada disso. Precisa ser DONO das tabelas — é o que faz as migrations
 * rodarem no boot e o `pg_dump` do backup funcionar — e poder assumir `barbearia_app`.
 *
 * ── COMO USAR — no console (Sh) do container do app ──────────────────────────
 *
 *  1. Escolha a senha do usuário novo, longa e aleatória. Na sua máquina:
 *       node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
 *  2. Nas variáveis do app, ACRESCENTE `DATABASE_URL_APP`: a mesma URL do
 *     `DATABASE_URL`, com o usuário novo e a senha nova no lugar. Salve.
 *  3. No console:  node scripts/usuario-do-app.mjs
 *     Ele cria o usuário, passa para ele a posse do banco e das tabelas, e PROVA
 *     com a URL nova que tudo funciona — antes de você trocar qualquer coisa.
 *  4. Troque o valor do `DATABASE_URL` pelo do `DATABASE_URL_APP` e salve. O boot
 *     confere de novo (`conferirPapelDoApp`, em `scripts/startup.mjs`).
 *
 * Voltar atrás é devolver o `DATABASE_URL` antigo: o superusuário continua podendo
 * tudo, inclusive sobre as tabelas que agora são do usuário novo.
 *
 * ⚠️ A senha nunca vai por argumento (ficaria no histórico do shell) nem sai na tela.
 * ⚠️ Banco NOVO: o primeiro boot ainda é com o superusuário — é ele que cria o papel
 *    `barbearia_app` (migration 0003). Este script vem depois.
 * ⚠️ Migration que precise de superusuário (extensão não confiável, papel novo) não
 *    roda mais no boot — `tests/usuario-do-app.test.ts` reprova as que pedirem.
 */
import postgres from 'postgres';

const IDENTIFICADOR = /^[a-z_][a-z0-9_]{2,62}$/;
const PROIBIDOS = new Set(['postgres', 'barbearia_app', 'public']);

function sair(mensagem) {
  console.error(`\n✗ ${mensagem}\n`);
  process.exit(1);
}

const urlDono = process.env.DATABASE_URL;
const urlApp = process.env.DATABASE_URL_APP;
if (!urlDono) sair('DATABASE_URL não definido — ele precisa ser, ainda, o do superusuário.');
if (!urlApp) sair('DATABASE_URL_APP não definido. Acrescente nas variáveis do app a URL com o usuário e a senha novos (passo 2 do cabeçalho deste arquivo).');

let dono;
let app;
try {
  dono = new URL(urlDono);
  app = new URL(urlApp);
} catch {
  sair('DATABASE_URL ou DATABASE_URL_APP não é uma URL de banco válida.');
}

const usuario = decodeURIComponent(app.username);
const senha = decodeURIComponent(app.password);
const banco = decodeURIComponent(app.pathname.replace(/^\//, ''));

if (app.hostname !== dono.hostname || (app.port || '5432') !== (dono.port || '5432') || app.pathname !== dono.pathname) {
  sair('DATABASE_URL_APP aponta para outro servidor ou outro banco. Tem de ser a MESMA URL, só com outro usuário e senha.');
}
if (!IDENTIFICADOR.test(usuario) || PROIBIDOS.has(usuario)) {
  sair(`O usuário "${usuario}" não serve: use letras minúsculas, números e _, começando por letra (ex.: fadeline_app).`);
}
if (usuario === decodeURIComponent(dono.username)) {
  sair('DATABASE_URL_APP tem o mesmo usuário do DATABASE_URL — a ideia é justamente outro.');
}
if (senha.length < 20) sair('A senha do usuário novo precisa de 20 caracteres ou mais (passo 1 do cabeçalho).');

const sql = postgres(urlDono, { max: 1, onnotice: () => {} });
let fase = 'antes';

try {
  // ── 1. Quem está rodando, e o banco está pronto? ──────────────────────────
  const [eu] = await sql`SELECT current_user AS nome, rolsuper FROM pg_roles WHERE rolname = current_user`;
  if (!eu?.rolsuper) {
    sair(`O DATABASE_URL de agora (${eu?.nome}) não é superusuário. Rode com o superusuário — depois da troca é que ele sai do app.`);
  }
  if ((await sql`SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app'`).length === 0) {
    sair('O papel barbearia_app não existe: rode as migrations primeiro (o boot do app faz isso).');
  }

  // ── 2. O usuário, a posse e os privilégios — numa transação só ────────────
  const passos = [];
  await sql.begin(async (tx) => {
    // `format()` no servidor: o nome entra citado como identificador e a senha como
    // literal, sem montagem de texto aqui.
    const montar = async (modelo, ...valores) =>
      (await tx`SELECT format(${modelo}, ${valores[0] ?? null}::text, ${valores[1] ?? null}::text) AS cmd`)[0].cmd;

    const existe = (await tx`SELECT 1 FROM pg_roles WHERE rolname = ${usuario}`).length > 0;
    const atributos = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
    await tx.unsafe(await montar(`${existe ? 'ALTER' : 'CREATE'} ROLE %I WITH ${atributos} PASSWORD %L`, usuario, senha));
    passos.push(existe ? `usuário ${usuario}: já existia — senha e atributos conferidos` : `usuário ${usuario}: criado, sem superusuário`);

    await tx.unsafe(await montar('GRANT barbearia_app TO %I', usuario));
    passos.push(`${usuario} pode assumir barbearia_app`);

    await tx.unsafe(await montar('ALTER DATABASE %I OWNER TO %I', banco, usuario));
    await tx.unsafe(await montar('ALTER SCHEMA public OWNER TO %I', usuario));

    // Tabelas, visões e sequências avulsas do schema public que ainda não são dele.
    // A sequência de uma coluna `serial` acompanha a tabela sozinha — e mexer nela
    // direto é recusado. Função e tipo, se um dia houver, entram também.
    const objetos = await tx`
      SELECT format('ALTER %s %s OWNER TO %I',
               CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'TABLE' WHEN 'v' THEN 'VIEW'
                              WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' END,
               c.oid::regclass, ${usuario}::text) AS cmd
        FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
         AND pg_get_userbyid(c.relowner) <> ${usuario}
         AND NOT (c.relkind = 'S' AND EXISTS (
               SELECT 1 FROM pg_depend d
                WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')))
      UNION ALL
      SELECT format('ALTER FUNCTION %s OWNER TO %I', p.oid::regprocedure, ${usuario}::text)
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND pg_get_userbyid(p.proowner) <> ${usuario}
      UNION ALL
      SELECT format('ALTER TYPE %s OWNER TO %I', t.oid::regtype, ${usuario}::text)
        FROM pg_type t
       WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e', 'd')
         AND pg_get_userbyid(t.typowner) <> ${usuario}`;
    for (const { cmd } of objetos) await tx.unsafe(cmd);
    passos.push(`posse do banco, do schema e de ${objetos.length} objeto(s) passada a ${usuario}`);

    // ⚠️ A 0003 deu ao papel do app acesso a toda tabela NOVA — mas, no PostgreSQL,
    // "toda tabela nova" é por CRIADOR: valia para as criadas pelo superusuário. Daqui
    // em diante quem cria tabela (as migrations, no boot) é o usuário novo, e sem isto
    // cada tabela nova nasceria trancada para o app — 500 em toda tela que a usasse,
    // com a migration verde.
    await tx.unsafe(await montar(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barbearia_app', usuario));
    await tx.unsafe(await montar(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO barbearia_app', usuario));
    passos.push('tabela nova criada por ele nasce acessível a barbearia_app, como as de antes');
  });
  fase = 'feito';
  for (const p of passos) console.log(`✓ ${p}`);

  // ── 3. A prova, com a URL NOVA — antes de alguém trocar o DATABASE_URL ─────
  await provarComOUsuarioNovo();
  console.log(
    '\n✓ Tudo certo. Agora, nas variáveis do app, troque o valor do DATABASE_URL pelo do\n' +
    '  DATABASE_URL_APP e salve. O boot confere de novo. Depois de ver o app no ar, pode\n' +
    '  apagar o DATABASE_URL_APP.\n',
  );
} catch (erro) {
  // Só a mensagem: o objeto do erro pode carregar o comando, e o comando, a senha.
  const motivo = erro instanceof Error ? erro.message : String(erro);
  console.error(fase === 'antes'
    ? `\n✗ Nada foi trocado. O Postgres disse: ${motivo}\n`
    : `\n✗ A posse foi passada, mas a prova com a URL nova falhou: ${motivo}\n` +
      '  NÃO troque o DATABASE_URL. O app continua funcionando com o superusuário;\n' +
      '  corrija o que a mensagem diz e rode este script de novo.\n');
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

async function provarComOUsuarioNovo() {
  const novo = postgres(urlApp, { max: 1, onnotice: () => {} });
  try {
    const [quem] = await novo`
      SELECT current_user AS nome, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super`;
    if (quem.nome !== usuario || quem.super) throw new Error(`conectou como ${quem.nome}, superusuário: ${quem.super}`);
    console.log(`✓ a URL nova entra como ${quem.nome}, sem superusuário`);

    const [{ alheias }] = await novo`
      SELECT count(*)::int AS alheias FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND pg_get_userbyid(relowner) <> current_user`;
    if (alheias > 0) throw new Error(`${alheias} tabela(s) ainda de outro dono`);
    console.log('✓ todas as tabelas são dele: as migrations do boot e o backup funcionam');

    await novo.begin(async (tx) => {
      await tx`SET LOCAL ROLE barbearia_app`;
      await tx`SELECT count(*) FROM settings`;
    });
    console.log('✓ ele assume barbearia_app, e o papel lê as tabelas — o RLS continua valendo');

    // A tabela que uma migration futura criaria — desfeita no fim.
    const DESFAZER = Symbol('desfazer');
    await novo.begin(async (tx) => {
      await tx`CREATE TABLE _prova_do_usuario_do_app (id int)`;
      await tx`SET LOCAL ROLE barbearia_app`;
      await tx`SELECT * FROM _prova_do_usuario_do_app`;
      throw DESFAZER;
    }).catch((e) => { if (e !== DESFAZER) throw e; });
    console.log('✓ tabela criada por ele, numa migration futura, já nasce acessível ao app');
  } finally {
    await novo.end({ timeout: 5 });
  }
}
