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
import { backupDoBanco } from './backup.mjs';

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

/**
 * `--so-migrations`: aplica as migrations e confere o papel do app, sem o aviso
 * do `pg_dump`. É o que o `npm run dev` roda antes de subir (`predev`, no
 * `package.json`): na máquina de desenvolvimento o `pg_dump` quase nunca está no
 * PATH, e um aviso que aparece a cada `npm run dev` vira ruído que ninguém lê —
 * inclusive no dia em que importar.
 *
 * Existe desde 09/10/2026: o `npm run dev` não aplicava migration, e a 0007
 * derrubou o ambiente do dono com "column trial_ends_at does not exist" em toda
 * página, até ele rodar o `db:migrate` à mão.
 */
const soMigrations = process.argv.includes('--so-migrations');

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

  // Antes de mudar qualquer coisa: o backup do banco como ele está (17/10/2026).
  const pendentes = arquivos.filter((nome) => !jaAplicadas.has(nome));
  if (pendentes.length > 0) await backupAntesDasMigrations(pendentes, jaAplicadas.size);

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
 * O backup do banco ANTES de aplicar migration nova — e, se ele falha, nada se aplica.
 *
 * ── POR QUE (17/10/2026) ─────────────────────────────────────────────────────
 *
 * O CMD do Dockerfile roda este script e só DEPOIS lança o daemon do backup, cujo
 * backup de boot vem portanto depois das migrations — e é pulado se houver um com
 * menos de 12 horas. Com um app e um banco para todas as barbearias, uma migration
 * que estragasse dado estragava o de todas, e a volta era o backup das 03:00: o dia
 * de agendamentos de todo mundo perdido. Achado na revisão de 16/10/2026
 * (`docs/PENDENCIAS-ABERTAS.md` §3.2).
 *
 * ⚠️ Derruba o boot de propósito se o backup falhar — ao contrário do aviso do
 * `pg_dump` mais abaixo, que deixa o app subir sem backup diário. Lá, subir não
 * muda o banco; aqui, subir É mudar o banco. Saída para uma vez só, sabendo o que
 * faz: `MIGRAR_SEM_BACKUP=1` — e tirar a variável depois.
 *
 * Só no boot de produção (`NODE_ENV=production`, o do Dockerfile) e na rodada
 * completa. Fica de fora:
 *  - o `--so-migrations` do `npm run dev`: na máquina de desenvolvimento o `pg_dump`
 *    quase nunca está no PATH, e o `BACKUP_DIR` padrão (`/data/backups`) nem existe;
 *  - o `--ate=`, da carga do Bayron: ele roda num banco recém-criado — e a rodada
 *    completa depois da carga faz o backup, com os dados carregados;
 *  - o banco novo, sem migration nenhuma aplicada: não há o que guardar.
 */
async function backupAntesDasMigrations(pendentes, quantasJaAplicadas) {
  if (ate || soMigrations || process.env.NODE_ENV !== 'production') return;
  if (quantasJaAplicadas === 0) {
    console.log('ⓘ banco novo: sem backup antes das migrations — não há o que guardar');
    return;
  }
  if (process.env.MIGRAR_SEM_BACKUP === '1') {
    console.warn(
      `⚠️  MIGRAR_SEM_BACKUP=1: ${pendentes.length} migration(s) vão rodar SEM o backup de antes.\n` +
      '   Tire a variável depois deste deploy — o próximo também migraria sem.',
    );
    return;
  }
  const primeira = pendentes[0].slice(0, 4);
  try {
    const { dest, bytes } = await backupDoBanco(`antes-da-${primeira}`);
    const tamanho = bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
    console.log(`✓ backup antes das migrations: ${dest} (${tamanho})`);
  } catch (erro) {
    console.error(
      '\n' +
      '  ┌──────────────────────────────────────────────────────────────┐\n' +
      '  │  ✗  SEM O BACKUP DE ANTES — NENHUMA MIGRATION FOI APLICADA    │\n' +
      '  └──────────────────────────────────────────────────────────────┘\n' +
      `  Pendentes: ${pendentes.join(', ')}\n` +
      `  O backup falhou: ${erro instanceof Error ? erro.message : String(erro)}\n\n` +
      '  Migration muda o banco de todas as barbearias, e a volta de uma que dê errado\n' +
      '  é este backup — por isso o boot para aqui, antes de mudar qualquer coisa.\n' +
      '  Conserte o motivo (espaço em disco, o pg_dump, a pasta do BACKUP_DIR) e suba\n' +
      '  de novo. Para subir assim mesmo, uma vez: MIGRAR_SEM_BACKUP=1 — e tire depois.\n'
    );
    throw new ErroDeBoot('sem o backup de antes das migrations');
  }
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

/**
 * `TZ_BARBEARIA` deixou de ser lida em 12/10/2026: o fuso é de cada barbearia,
 * a coluna `tenants.timezone` (migration 0013, `src/lib/timezone.ts`). Quem a
 * deixou nas variáveis do servidor pode achar que ela ainda manda — e trocá-la
 * não mudaria hora nenhuma. Avisa no boot, sem derrubar nada.
 *
 * Mais alto se ela tinha OUTRO fuso: a 0013 pôs as barbearias que já existiam no
 * padrão, Fortaleza — e um servidor que rodava em Manaus mudaria a hora de todas.
 */
function avisarFusoAntigo() {
  const antigo = process.env.TZ_BARBEARIA?.trim();
  if (!antigo) return;
  if (antigo !== 'America/Fortaleza') {
    console.warn(
      `⚠️  TZ_BARBEARIA=${antigo} não é mais lida: cada barbearia tem o fuso dela, e as que já\n` +
      '   existiam ficaram em America/Fortaleza (migration 0013). Se estavam no outro fuso,\n' +
      '   troque em Configurações → Fuso horário. Depois, tire a variável do servidor.',
    );
    return;
  }
  console.log(
    'ⓘ TZ_BARBEARIA não é mais lida: o fuso é de cada barbearia (Configurações, ou a\n' +
    '  coluna tenants.timezone). Pode tirar a variável do servidor.',
  );
}

/**
 * A trava de horário duplo (migration 0015): o banco recusa dois agendamentos do
 * mesmo barbeiro no mesmo horário. Num banco que já tinha pares sobrepostos, ela
 * vale a partir do fim do último — o histórico fica como estava —, e num com
 * horário fora do formato, esses ficam fora dela. Diz qual é o caso, uma linha.
 * Nunca derruba o boot: é aviso, e a conferência do código continua de pé.
 */
async function avisarTravaDeHorario() {
  if (ate) return;
  try {
    const regras = await sql`
      SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conrelid = to_regclass('public.appointments')
         AND conname IN ('appointments_sem_horario_duplo', 'appointments_horario_utc')`;
    const trava = regras.find((r) => r.conname === 'appointments_sem_horario_duplo');
    const formato = regras.find((r) => r.conname === 'appointments_horario_utc');
    if (!trava) {
      console.warn('⚠️  A trava de horário duplo não existe neste banco (migration 0015): só a conferência do código segura.');
      return;
    }
    const corte = /starts_at >= '([^']+)'/.exec(trava.def)?.[1];
    const quando = corte && `${corte.slice(8, 10)}/${corte.slice(5, 7)}/${corte.slice(0, 4)} ${corte.slice(11, 16)} UTC`;
    if (corte && corte > new Date().toISOString()) {
      // O par mais recente ainda está por vir: dois clientes marcados na mesma cadeira,
      // e a trava sem valer até lá.
      console.warn(
        `⚠️  horário duplo: o banco só recusa a partir de ${quando} — há agendamentos do mesmo\n` +
        '   barbeiro no mesmo horário marcados para depois de agora. Desmarque um de cada par e rode\n' +
        '   a 0015 de novo (docs/ROTEIRO-MIGRACAO-PRODUCAO.md §4.4).',
      );
    } else if (corte) {
      console.log(
        `ⓘ horário duplo: o banco recusa a partir de ${quando} — antes disso, este banco já tinha agendamentos\n` +
        '  sobrepostos, que ficaram como estavam (migration 0015).',
      );
    } else {
      console.log('✓ horário duplo: o banco recusa dois agendamentos do mesmo barbeiro no mesmo horário');
    }
    if (formato && !formato.convalidated) {
      const [{ n }] = await sql`
        SELECT count(*)::int AS n FROM appointments
         WHERE NOT (starts_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
                AND ends_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
                AND ends_at > starts_at)`;
      if (n > 0) {
        console.warn(
          `⚠️  ${n} agendamento(s) com o horário fora do formato do app: ficam fora da trava, e não\n` +
          '   aceitam cancelar nem concluir até o horário ser corrigido (migration 0015).',
        );
      }
    }
  } catch (erro) {
    console.warn(`⚠️  Não deu para conferir a trava de horário duplo: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

/**
 * Confere, no boot de produção, que o e-mail consegue sair — a senha nova e os
 * avisos do teste e da cobrança dependem dele (`src/lib/email.ts`).
 *
 * Não derruba o boot, pelo mesmo motivo do `pg_dump`: barbearia fora do ar é
 * pior que barbearia sem e-mail. Mas e-mail desligado não dá erro em lugar
 * nenhum — o dono pede a senha nova e espera, o aviso do fim do teste não chega —,
 * e este é o lugar onde se olha quando o deploy termina.
 */
function conferirEmail() {
  if (process.env.NODE_ENV !== 'production') return;
  const faltam = [];
  if (!process.env.SMTP_URL?.trim()) {
    faltam.push('SMTP_URL — o endereço do provedor de envio, ex: smtps://usuario:senha@smtp.provedor.com:465');
  }
  if (!process.env.PAINEL_URL?.trim() && !process.env.DOMINIO_BASE?.trim()) {
    faltam.push('PAINEL_URL ou DOMINIO_BASE — sem eles, o link do e-mail não tem para onde apontar');
  }
  if (faltam.length === 0) {
    console.log('✓ e-mail: SMTP configurado');
    return;
  }
  console.warn(
    '\n' +
    '  ┌──────────────────────────────────────────────────────────────┐\n' +
    '  │  ⚠️  E-MAIL DESLIGADO — SENHA NOVA E AVISOS NÃO VÃO SAIR     │\n' +
    '  └──────────────────────────────────────────────────────────────┘\n' +
    faltam.map((f) => `  Falta: ${f}\n`).join('') +
    '  O app vai subir e atender normalmente.\n'
  );
}

/** Falha de boot que JÁ se explicou sozinha — o `catch` final não repete nada. */
class ErroDeBoot extends Error {}

/**
 * Confere, no boot, que ESTE usuário consegue assumir `barbearia_app`.
 *
 * ⚠️ Derruba o boot de propósito — ao contrário do aviso do `pg_dump`.
 *
 * O app faz `SET ROLE barbearia_app` em TODA requisição (`src/db/index.ts`,
 * `comTenant()`). Sem poder assumir o papel, o container sobe, o deploy fica
 * verde e o site responde 500 em tudo. Barbearia fora do ar com deploy verde é
 * pior que container que não sobe: no segundo caso você fica sabendo na hora.
 *
 * A migration `0004` já concede o papel — mas migration roda UMA vez. Se a
 * credencial do `DATABASE_URL` for trocada depois, a `0004` não roda de novo e
 * o usuário novo não é membro de nada. É esse caso que esta função pega.
 */
async function conferirPapelDoApp() {
  // ⚠️ Rodada parcial não tem como passar nesta conferência, e ela é passo do
  // roteiro de migração: `--ate=0000` cria só as tabelas, e `barbearia_app` só
  // nasce na 0003. Sem esta saída, o passo 4.2 de
  // `docs/ROTEIRO-MIGRACAO-PRODUCAO.md` morreria com "role does not exist" —
  // no meio da janela, com o site já fora do ar.
  if (ate) {
    console.log('(parcial: a conferência do papel do app fica para a rodada completa)');
    return;
  }

  const [{ current_user: usuario }] = await sql`SELECT current_user`;
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE barbearia_app`;
      await tx`SELECT 1`;
    });
  } catch (erro) {
    console.error(
      '\n' +
      '  ┌──────────────────────────────────────────────────────────────┐\n' +
      '  │  ✗  O APP NÃO CONSEGUE ASSUMIR O PAPEL barbearia_app         │\n' +
      '  └──────────────────────────────────────────────────────────────┘\n' +
      `  Usuário do DATABASE_URL: ${usuario}\n` +
      `  Postgres disse: ${erro instanceof Error ? erro.message : String(erro)}\n\n` +
      '  Toda requisição faz SET ROLE. Sem isso o site responde 500 em tudo,\n' +
      '  com o deploy verde — por isso o boot para aqui.\n\n' +
      '  Quem administra o Postgres resolve com:\n\n' +
      `      GRANT barbearia_app TO ${usuario};\n`
    );
    throw new ErroDeBoot('barbearia_app não pode ser assumido por ' + usuario);
  }
  console.log(`✓ papel do app: ${usuario} pode assumir barbearia_app`);

  // ⚠️ ASSUMIR O PAPEL NÃO BASTA — e até 11/10/2026 esta conferência parava acima.
  //
  // Banco restaurado de um backup sem os privilégios — todo backup feito até essa
  // data rodava `pg_dump --no-privileges` — passa no SET ROLE e não lê tabela
  // nenhuma: o site responderia 500 em tudo, com o boot verde. E num servidor novo,
  // sem o papel na hora de restaurar, as políticas de RLS nem chegam a ser criadas.
  // Achado restaurando de verdade, no ensaio da troca do usuário do banco. As duas
  // coisas se conferem aqui: o papel lê as tabelas que toda tela usa, e toda tabela
  // de barbearia tem a rede (a mesma conferência de `tests/rls.test.ts`).
  const ESSENCIAIS = ['tenants', 'settings', 'barbers', 'services', 'appointments'];
  const semLeitura = (await sql`
    SELECT t FROM unnest(${ESSENCIAIS}::text[]) AS t
     WHERE NOT COALESCE(has_table_privilege('barbearia_app', to_regclass('public.' || t), 'SELECT'), false)
     ORDER BY 1`).map((r) => r.t);
  const semRede = (await sql`
    SELECT c.relname FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
       AND (NOT c.relrowsecurity OR NOT EXISTS (
             SELECT 1 FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolado'))
     ORDER BY 1`).map((r) => r.relname);
  if (semLeitura.length || semRede.length) {
    console.error(
      '\n' +
      '  ┌──────────────────────────────────────────────────────────────┐\n' +
      '  │  ✗  O PAPEL DO APP NÃO LÊ AS TABELAS, OU FALTA A REDE DE RLS  │\n' +
      '  └──────────────────────────────────────────────────────────────┘\n' +
      (semLeitura.length ? `  barbearia_app sem leitura em: ${semLeitura.join(', ')}\n` : '') +
      (semRede.length ? `  Sem RLS ou sem a política tenant_isolado: ${semRede.join(', ')}\n` : '') +
      '\n  É o banco restaurado de um backup sem as permissões (todo backup feito até\n' +
      '  11/10/2026), ou restaurado num servidor novo. Toda tela responderia 500 —\n' +
      '  por isso o boot para aqui. Resolve com:\n\n' +
      '      node scripts/permissoes-do-app.mjs\n'
    );
    throw new ErroDeBoot('barbearia_app sem acesso às tabelas, ou tabela sem a rede de RLS');
  }
  console.log('✓ papel do app: lê as tabelas, e toda tabela de barbearia tem a rede de RLS');
}

try {
  await main();
  await conferirPapelDoApp();
  if (!soMigrations) {
    conferirPgDump();
    conferirEmail();
    avisarFusoAntigo();
    await avisarTravaDeHorario();
  }
} catch (erro) {
  // Erro de boot já imprimiu o próprio diagnóstico. Dizer "migration falhou"
  // em cima dele mandaria procurar defeito no lugar errado.
  if (!(erro instanceof ErroDeBoot)) {
    console.error('\n✗ Migration falhou. O que ela mudaria foi desfeito.\n');
    console.error(erro);
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
