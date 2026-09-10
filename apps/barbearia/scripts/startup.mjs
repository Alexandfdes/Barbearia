/**
 * Migrations no boot — Postgres.
 *
 * Passo 2 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9. Antes do porte este
 * script usava `migrate()` do Drizzle, que depende de `drizzle/meta/_journal.json`.
 * Esse journal não existe mais: as migrations do Postgres são arquivos `.sql`
 * numerados, escritos à mão, e o journal do Drizzle não descreveria o que elas
 * fazem (a 0001 recompõe 16 chaves estrangeiras dentro de um bloco `DO $$`).
 *
 * Por que um migrador próprio em vez do `drizzle-kit migrate`:
 *
 * 1. O `drizzle-kit` decide o que rodar pelo **timestamp** do journal e nunca
 *    compara o hash do arquivo. Editar uma migration já aplicada passa em
 *    silêncio — foi assim que o seed do Bayron ficou meses invisível dentro das
 *    migrations (`PENDENCIAS-ABERTAS.md` §4.6). Aqui o hash é conferido e a
 *    divergência **aparece na saída do boot**.
 * 2. Migration escrita à mão é a única forma honesta de fazer o que a 0001 faz.
 *    Gerador de schema não escreve backfill nem recomposição de chave estrangeira.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PASTA = resolve(__dirname, '..', 'drizzle');

/**
 * `--ate=0000` para na migration cujo nome começa assim.
 *
 * Existe por causa de UMA operação: a carga do Bayron, de SQLite para Postgres.
 * A 0001 só cria o tenant de backfill se encontrar dados, então a ordem tem que
 * ser 0000 → carregar os dados → 0001. Rodar as duas de uma vez deixaria as
 * linhas carregadas sem `tenant_id`.
 *
 *   node scripts/startup.mjs --ate=0000   # só as tabelas
 *   <carrega os dados>
 *   node scripts/startup.mjs              # o resto
 */
const ate = process.argv.find((a) => a.startsWith('--ate='))?.slice(6);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definido. Ex: postgres://usuario:senha@host:5432/barbearia');
  process.exit(1);
}

// `max: 1` de propósito: migration é serial. Pool maior aqui só cria chance de
// duas conexões tentarem o mesmo DDL ao mesmo tempo.
const sql = postgres(url, { max: 1, onnotice: () => {} });

const hashDe = (texto) => createHash('sha256').update(texto).digest('hex');

/**
 * Tira o `BEGIN;` / `COMMIT;` do arquivo.
 *
 * Cada migration abre a própria transação para poder rodar sozinha no `psql`.
 * Aqui quem controla a transação é este script, porque o registro em
 * `schema_migrations` precisa entrar na MESMA transação da migration: sem isso,
 * um processo morto entre aplicar e registrar faria a migration rodar de novo.
 * Um `COMMIT;` no meio fecharia a transação externa e quebraria essa garantia.
 */
function semTransacao(texto) {
  return texto
    .split('\n')
    .filter((linha) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(linha))
    .join('\n');
}

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome        text PRIMARY KEY,
      hash        text NOT NULL,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )
  `;

  const jaAplicadas = new Map(
    (await sql`SELECT nome, hash FROM schema_migrations`).map((r) => [r.nome, r.hash])
  );

  let arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort();
  if (ate) {
    const corte = arquivos.findIndex((f) => f.startsWith(ate));
    if (corte === -1) {
      console.error(`--ate=${ate} não casa com nenhuma migration em ${PASTA}.`);
      process.exit(1);
    }
    arquivos = arquivos.slice(0, corte + 1);
    console.log(`(parando em ${arquivos[arquivos.length - 1]})`);
  }
  if (arquivos.length === 0) {
    console.error(`Nenhuma migration em ${PASTA}. Algo está errado no build.`);
    process.exit(1);
  }

  let aplicadas = 0;

  for (const nome of arquivos) {
    const texto = readFileSync(join(PASTA, nome), 'utf8');
    const hash = hashDe(texto);
    const anterior = jaAplicadas.get(nome);

    if (anterior === hash) continue;

    if (anterior !== undefined) {
      // Migration já aplicada cujo conteúdo mudou. Reaplicar é arriscado e ficar
      // calado é pior: o banco deixou de ser o que o arquivo diz que ele é.
      console.warn(
        `\n⚠️  ${nome} já foi aplicada, mas o arquivo MUDOU desde então.\n` +
        `    Este banco tem a versão antiga; bancos novos recebem a nova.\n` +
        `    Se a mudança precisa valer aqui, escreva uma migration nova.\n`
      );
      continue;
    }

    process.stdout.write(`→ ${nome} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(semTransacao(texto));
      await tx`INSERT INTO schema_migrations (nome, hash) VALUES (${nome}, ${hash})`;
    });
    console.log('ok');
    aplicadas++;
  }

  console.log(
    aplicadas === 0 ? '✓ Banco já estava em dia' : `✓ ${aplicadas} migration(s) aplicada(s)`
  );
}

/**
 * Avisa, no boot, se o backup não tem como funcionar.
 *
 * `scripts/backup.mjs` é um wrapper de `pg_dump`, que **não vem** na imagem
 * node:22-alpine. Sem o binário, o app sobe perfeitamente e todo backup falha:
 * o container roda, a barbearia atende, e a primeira notícia de que não existe
 * backup chega no dia em que alguém precisa restaurar.
 *
 * Não derruba o boot de propósito: barbearia fora do ar é pior que barbearia
 * sem backup de hoje. Mas o aviso sai aqui, no lugar onde se olha quando o
 * deploy termina — e não escondido no log do daemon 24 horas depois.
 */
function conferirPgDump() {
  const r = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.warn(
      '\n' +
      '  ┌──────────────────────────────────────────────────────────────┐\n' +
      '  │  ⚠️  pg_dump NÃO ENCONTRADO — NÃO EXISTE BACKUP NESTA IMAGEM │\n' +
      '  └──────────────────────────────────────────────────────────────┘\n' +
      '  O app vai subir e atender normalmente. Todo backup vai falhar.\n' +
      '  Corrija na imagem: apk add --no-cache postgresql16-client\n'
    );
    return;
  }
  console.log(`✓ backup: ${r.stdout.trim()}`);
}

try {
  await main();
  conferirPgDump();
} catch (erro) {
  console.error('\n✗ Migration falhou. O que ela mudaria foi desfeito.\n');
  console.error(erro);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
