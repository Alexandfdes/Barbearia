/**
 * Roda a suíte INTEIRA: sobe um Postgres descartável, testa, derruba.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ──────────────────────────────────────────────
 *
 * `npm test` sem `DATABASE_URL` pula 84 dos 212 casos — login, agendamento,
 * settings, tenants, RLS, a carga da migração e o backup das fotos. Fica verde
 * tendo conferido pouco mais da metade, e a metade que fica de fora é
 * justamente a que mexe com dado de cliente.
 *
 * Verde que não olhou o que importa é pior que vermelho: ele autoriza o commit.
 *
 * ── USO ──────────────────────────────────────────────────────────────────────
 *
 *     npm run test:db                 sobe, roda tudo, derruba
 *     npm run test:db -- --manter     deixa o banco de pé para investigar
 *     npm run test:db -- tests/rls    passa o resto dos argumentos ao vitest
 *
 * Se `DATABASE_URL` já estiver definida, ele NÃO mexe em Docker nenhum e usa o
 * banco que você apontou — é como a suíte roda no servidor de integração.
 */
import { spawn, spawnSync } from 'node:child_process';

const COMPOSE = 'docker-compose.test.yml';
const PORTA   = process.env.PORTA_TESTE ?? '5434';
const URL_TESTE = `postgres://barbearia:barbearia@127.0.0.1:${PORTA}/barbearia_test`;

const args = process.argv.slice(2);
const manter = args.includes('--manter');
const argsVitest = args.filter((a) => a !== '--manter');

/** `docker compose` (moderno) ou `docker-compose` (antigo). */
function acharCompose() {
  for (const [cmd, base] of [['docker', ['compose']], ['docker-compose', []]]) {
    const r = spawnSync(cmd, [...base, 'version'], { stdio: 'ignore' });
    if (r.status === 0) return { cmd, base };
  }
  return null;
}

function compose(compostoCom, ...subcomando) {
  return spawnSync(compostoCom.cmd, [...compostoCom.base, '-f', COMPOSE, ...subcomando], {
    stdio: 'inherit',
    env: { ...process.env, PORTA_TESTE: PORTA },
  });
}

/** Espera o banco aceitar conexão. O healthcheck do compose já espera, mas o
 *  `--wait` não existe em todas as versões — então conferimos aqui também. */
async function esperarBanco(tentativas = 40) {
  const { default: postgres } = await import('postgres');
  for (let i = 1; i <= tentativas; i++) {
    const sql = postgres(URL_TESTE, { max: 1, onnotice: () => {}, connect_timeout: 2 });
    try {
      await sql`SELECT 1`;
      await sql.end({ timeout: 2 });
      return true;
    } catch {
      await sql.end({ timeout: 1 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

function rodarVitest(url) {
  return new Promise((resolve) => {
    const p = spawn(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', ...argsVitest],
      { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
    );
    p.on('close', (codigo) => resolve(codigo ?? 1));
    p.on('error', (e) => { console.error('Não consegui rodar o vitest:', e.message); resolve(1); });
  });
}

async function main() {
  // Banco já apontado: não mexe em Docker. É assim no servidor de integração.
  if (process.env.DATABASE_URL) {
    console.log(`→ usando o DATABASE_URL que já estava definido\n`);
    process.exitCode = await rodarVitest(process.env.DATABASE_URL);
    return;
  }

  const compostoCom = acharCompose();
  if (!compostoCom) {
    console.error(`
  ✋ Docker não encontrado.

  Este comando sobe um Postgres descartável para rodar os 84 casos que precisam
  de banco. Sem Docker há duas saídas:

    1. Abra o Docker Desktop e rode de novo.
    2. Aponte um Postgres seu:
         $env:DATABASE_URL='postgres://usuario:senha@host:5432/barbearia_test'
         npm run test:db

  ⚠️ O nome do banco precisa terminar em _test: a suíte roda DROP SCHEMA.

  Enquanto isso, \`npm test\` continua valendo — ele roda os 128 casos que não
  precisam de banco e PULA o resto.
`);
    process.exitCode = 1;
    return;
  }

  console.log(`→ subindo o banco de teste na porta ${PORTA}...`);
  const subiu = compose(compostoCom, 'up', '-d');
  if (subiu.status !== 0) {
    console.error(`
  ✋ Não consegui subir o banco de teste.

  A causa mais comum é o Docker Desktop estar fechado — abra e rode de novo.
  Se a porta ${PORTA} estiver ocupada, escolha outra:

      $env:PORTA_TESTE='5435'; npm run test:db
`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('→ esperando o banco aceitar conexão... ');
  if (!await esperarBanco()) {
    console.error('não respondeu.\n');
    compose(compostoCom, 'logs', '--tail', '30');
    if (!manter) compose(compostoCom, 'down');
    process.exitCode = 1;
    return;
  }
  console.log('pronto.\n');

  const codigo = await rodarVitest(URL_TESTE);

  if (manter) {
    console.log(`\n→ banco de pé em ${URL_TESTE}`);
    console.log(`  derrube com: ${compostoCom.cmd} ${[...compostoCom.base, '-f', COMPOSE, 'down'].join(' ')}`);
  } else {
    console.log('\n→ derrubando o banco de teste...');
    compose(compostoCom, 'down');
  }

  process.exitCode = codigo;
}

await main();
