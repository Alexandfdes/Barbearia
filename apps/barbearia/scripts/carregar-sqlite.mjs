/**
 * Carga única: o banco SQLite da barbearia → Postgres.
 *
 * ── O QUE ESTE SCRIPT É ───────────────────────────────────────────────────────
 *
 * A operação de maior risco do projeto inteiro, e a única sem volta: os
 * agendamentos, os clientes e o histórico de uma barbearia que está funcionando
 * mudam de banco. `ARQUITETURA-MULTI-TENANT-V1.md` §9 e o `LEIA-ME` do porte
 * descrevem a ordem obrigatória e paravam aqui — o passo "carrega os dados" era
 * uma frase, sem ferramenta nenhuma atrás.
 *
 * ── A ORDEM É OBRIGATÓRIA E NÃO PODE SER TROCADA ──────────────────────────────
 *
 *   1. node scripts/startup.mjs --ate=0000    # só as tabelas, sem tenant_id
 *   2. node scripts/carregar-sqlite.mjs ...   # este script
 *   3. node scripts/startup.mjs               # a 0001 cria o tenant e backfilla
 *
 * A `0001` só cria o tenant `bayron` **se encontrar dados** para atribuir a ele.
 * Rodar as duas migrations antes da carga deixa as linhas carregadas sem
 * `tenant_id` — num sistema onde o `tenant_id` é o que separa uma barbearia da
 * outra, isso não é um campo vazio, é o dado no lugar errado.
 *
 * ── O QUE ELE FAZ E NÃO FAZ ───────────────────────────────────────────────────
 *
 * Copia as 12 tabelas na ordem das chaves estrangeiras, **preservando os ids**
 * (porque os ids estão gravados nos links de agendamento que já foram mandados
 * para os clientes por WhatsApp), numa transação só, e no fim recoloca cada
 * sequence à frente do maior id — sem isso o primeiro agendamento novo tentaria
 * o id 1 e bateria de frente com o que já existe.
 *
 * `active` era `integer` 0/1 no SQLite e é `boolean` no Postgres; é a única
 * conversão de tipo do porte inteiro, e vai explícita.
 *
 * Ele **recusa** rodar se o banco de destino já tiver linha em qualquer tabela.
 * Rodar duas vezes duplicaria o histórico da barbearia.
 */
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { existsSync } from 'node:fs';

/**
 * ⚠️ `node:sqlite` é o leitor de SQLite que já vem no Node 22 — de propósito.
 *
 * O `better-sqlite3` saiu das dependências no porte para Postgres, e trazê-lo de
 * volta significaria compilar módulo nativo no Windows e na imagem, para uma
 * ferramenta que roda **uma vez na vida de cada barbearia**. O módulo embutido
 * lê o arquivo sem instalar nada.
 *
 * Ele imprime um aviso de recurso experimental na saída. É barulho, não erro:
 * o que usamos aqui é `SELECT *` em tabela, a parte mais estável da API.
 */

/**
 * Ordem de carga: pai antes de filho.
 *
 * Não é estética — as chaves estrangeiras agora valem sempre. No SQLite elas
 * dependiam de `PRAGMA foreign_keys = ON`, que o app não ligava; aqui o banco
 * recusa a linha órfã. É bom que recuse: órfã carregada é agendamento apontando
 * para um barbeiro que não existe, e isso só aparece quando alguém abre a agenda.
 */
const ORDEM = [
  'barbers',
  'services',
  'products',
  'combos',
  'settings',
  'working_hours',
  'barber_services',
  'appointments',
  'appointment_items',
  'product_sales',
  'reservations',
  'time_off',
];

/** Colunas `integer` no SQLite que são `boolean` no Postgres. */
const BOOLEANAS = new Set([
  'barbers.active',
  'services.active',
  'products.active',
  'combos.active',
  'barber_services.active',
]);

const caminhoDb = process.argv[2];
const url = process.env.DATABASE_URL;

if (!caminhoDb || !url) {
  console.error(`
  USO:
      DATABASE_URL='postgres://...' node scripts/carregar-sqlite.mjs <caminho-do.db>

  ORDEM OBRIGATÓRIA (ver o cabeçalho deste arquivo):
      node scripts/startup.mjs --ate=0000
      DATABASE_URL='...' node scripts/carregar-sqlite.mjs ./data/appointments.db
      node scripts/startup.mjs
`);
  process.exit(1);
}

if (!existsSync(caminhoDb)) {
  console.error(`Banco SQLite não encontrado: ${caminhoDb}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(caminhoDb, { readOnly: true });
const sql = postgres(url, { max: 1, onnotice: () => {} });

/** Converte a linha do SQLite para o que o Postgres espera. */
function converter(tabela, linha) {
  const saida = {};
  for (const [coluna, valor] of Object.entries(linha)) {
    saida[coluna] = BOOLEANAS.has(`${tabela}.${coluna}`) && valor !== null
      ? Boolean(valor)
      : valor;
  }
  return saida;
}

async function main() {
  // ── Guarda 1: as tabelas existem? ────────────────────────────────────────────
  const existentes = (
    await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  ).map((r) => r.table_name);

  const faltando = ORDEM.filter((t) => !existentes.includes(t));
  if (faltando.length) {
    throw new Error(
      `As tabelas ${faltando.join(', ')} não existem no destino.\n` +
      `Rode primeiro: node scripts/startup.mjs --ate=0000`
    );
  }

  // ── Guarda 2: o destino tem que estar vazio ──────────────────────────────────
  //
  // Carga rodada duas vezes duplica o histórico da barbearia: o mesmo
  // agendamento vira dois, o relatório do mês dobra, e desfazer significa
  // decidir qual das duas cópias de cada linha é a verdadeira.
  for (const tabela of ORDEM) {
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM ${sql(tabela)}`;
    if (n > 0) {
      throw new Error(
        `RECUSANDO CARREGAR: a tabela "${tabela}" do destino já tem ${n} linha(s).\n\n` +
        `  Este script é de carga única, em banco recém-criado. Rodar de novo\n` +
        `  duplicaria o histórico da barbearia.\n\n` +
        `  Se a carga anterior deu errado, recrie o banco do zero:\n` +
        `      dropdb <banco> && createdb <banco>\n` +
        `      node scripts/startup.mjs --ate=0000\n`
      );
    }
  }

  // ── Guarda 3: a 0001 ainda não rodou ─────────────────────────────────────────
  const [{ temTenant }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'tenant_id'
    ) AS "temTenant"`;

  if (temTenant) {
    throw new Error(
      `RECUSANDO CARREGAR: a coluna tenant_id já existe, ou seja, a 0001 já rodou.\n\n` +
      `  A 0001 cria o tenant e distribui o tenant_id nas linhas que ENCONTRA.\n` +
      `  Carregar depois dela deixa tudo sem tenant_id — num sistema multi-tenant\n` +
      `  isso não é campo vazio, é o dado no lugar errado.\n\n` +
      `  Recrie o banco e rode na ordem: --ate=0000, carga, resto.\n`
    );
  }

  // ── Guarda 4: o que o destino exige e a origem não tem ──────────────────────
  //
  // O Postgres tem colunas NOT NULL que o SQLite aceitava vazias. A carga falha
  // nelas de qualquer jeito — está tudo numa transação, então nada é gravado —
  // mas a mensagem que o banco dá ("null value in column X violates not-null
  // constraint") diz o que quebrou e não diz quanto, nem onde, nem o que fazer.
  //
  // Quem roda isto está com o sistema parado e o dono da barbearia esperando.
  // A diferença entre uma linha de erro e a lista completa do que precisa ser
  // preenchido é a diferença entre resolver agora e remarcar a migração.
  const exigidas = await sql`
    SELECT table_name AS tabela, column_name AS coluna
    FROM information_schema.columns
    WHERE table_schema = 'public' AND is_nullable = 'NO' AND table_name = ANY(${ORDEM})
    ORDER BY table_name, ordinal_position`;

  const buracos = [];
  for (const { tabela, coluna } of exigidas) {
    try {
      const { n } = sqlite
        .prepare(`SELECT COUNT(*) AS n FROM "${tabela}" WHERE "${coluna}" IS NULL`)
        .get();
      if (n > 0) buracos.push({ tabela, coluna, n });
    } catch {
      // Coluna que só existe no Postgres (tenant_id não chega aqui, mas colunas
      // novas de migrations futuras podem): não há nada para conferir na origem.
    }
  }

  if (buracos.length) {
    throw new Error(
      `RECUSANDO CARREGAR: a origem tem vazio onde o destino exige valor.\n\n` +
      buracos.map((b) => `      ${b.tabela}.${b.coluna}: ${b.n} linha(s) em branco`).join('\n') +
      `\n\n  Preencha no SQLite antes de migrar. A carga inteira está numa\n` +
      `  transação, então nada foi gravado no destino.\n`
    );
  }

  const contagens = [];

  await sql.begin(async (tx) => {
    for (const tabela of ORDEM) {
      const linhas = sqlite.prepare(`SELECT * FROM "${tabela}"`).all();
      if (linhas.length === 0) {
        contagens.push({ tabela, origem: 0, destino: 0 });
        continue;
      }

      const convertidas = linhas.map((l) => converter(tabela, l));
      const colunas = Object.keys(convertidas[0]);

      // Em lotes: uma tabela com milhares de linhas num INSERT só estoura o
      // limite de parâmetros do protocolo.
      const LOTE = 500;
      for (let i = 0; i < convertidas.length; i += LOTE) {
        await tx`INSERT INTO ${tx(tabela)} ${tx(convertidas.slice(i, i + LOTE), colunas)}`;
      }

      const [{ n }] = await tx`SELECT COUNT(*)::int AS n FROM ${tx(tabela)}`;
      contagens.push({ tabela, origem: linhas.length, destino: n });
      process.stdout.write(`→ ${tabela.padEnd(18)} ${String(linhas.length).padStart(5)} linha(s)\n`);
    }

    // ── Sequences ───────────────────────────────────────────────────────────────
    //
    // Os ids vieram prontos, então a sequence continua em 1 e o primeiro
    // agendamento novo colidiria com o id 1 que já existe. O erro apareceria
    // no primeiro cliente que tentasse marcar horário depois da migração.
    for (const { tabela } of contagens) {
      await tx.unsafe(`
        SELECT setval(
          pg_get_serial_sequence('${tabela}', 'id'),
          COALESCE((SELECT MAX(id) FROM "${tabela}"), 0) + 1,
          false
        ) WHERE pg_get_serial_sequence('${tabela}', 'id') IS NOT NULL`);
    }
  });

  // ── Conferência ──────────────────────────────────────────────────────────────
  const divergentes = contagens.filter((c) => c.origem !== c.destino);
  console.log('');
  if (divergentes.length) {
    console.error('✗ CONTAGEM NÃO BATE:');
    for (const d of divergentes) console.error(`    ${d.tabela}: origem ${d.origem}, destino ${d.destino}`);
    throw new Error('A carga não reproduziu o banco de origem.');
  }

  const total = contagens.reduce((s, c) => s + c.origem, 0);
  console.log(`✓ ${total} linha(s) carregada(s), contagem confere em ${contagens.length} tabelas`);
  console.log('');
  console.log('  PRÓXIMO PASSO (obrigatório):  node scripts/startup.mjs');
  console.log('  Sem ele as linhas ficam sem tenant_id.');
}

try {
  await main();
} catch (erro) {
  console.error(`\n✗ Carga não foi feita. Nada mudou no destino.\n`);
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  sqlite.close();
  await sql.end({ timeout: 5 });
}
