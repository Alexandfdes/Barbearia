/**
 * Lê e edita a configuração da barbearia (tabela `settings`, linha 1) sem
 * depender do CLI do sqlite — que não vem instalado no Windows.
 *
 * Uso:
 *   node scripts/settings.mjs
 *       mostra a configuração atual
 *
 *   node scripts/settings.mjs 'business_name=Barbearia Sete Cortes' 'short_name=Sete Cortes'
 *       altera as colunas informadas
 *
 * No PowerShell, envolva CADA par em aspas simples — sem isso o espaço quebra
 * o argumento em dois.
 *
 * Pode rodar com o dev server ligado (SQLite em WAL aguenta). Mas o servidor
 * guarda as settings em cache na memória, então reinicie-o para ver a mudança
 * no site. A partir da tela /admin/configuracoes isso deixa de ser necessário.
 *
 * Vars de ambiente (opcionais):
 *   DATABASE_PATH   (default: ./data/appointments.db)
 */
import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_PATH ?? './data/appointments.db';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const colunas = db.prepare('PRAGMA table_info(settings)').all().map((c) => c.name);
if (colunas.length === 0) {
  console.error('ERRO: a tabela `settings` não existe neste banco.');
  console.error('Rode as migrations primeiro:  npm run db:migrate');
  process.exit(1);
}

const atual = db.prepare('SELECT * FROM settings WHERE id = 1').get();
if (!atual) {
  console.error('ERRO: a linha id = 1 não existe em `settings`.');
  console.error('A migration 0009 deveria tê-la criado. Rode:  npm run db:migrate');
  process.exit(1);
}

const pares = process.argv.slice(2);

// Sem argumentos: só mostra o que está lá hoje.
if (pares.length === 0) {
  console.log(`Configuração atual (${DB_PATH}):\n`);
  for (const [k, v] of Object.entries(atual)) {
    const texto = v === null ? '(vazio)' : String(v);
    console.log(`  ${k.padEnd(24)} ${texto.length > 70 ? texto.slice(0, 70) + '…' : texto}`);
  }
  console.log('\nPara alterar:  node scripts/settings.mjs \'business_name=Nova Barbearia\'');
  db.close();
  process.exit(0);
}

const mudancas = [];
for (const par of pares) {
  const i = par.indexOf('=');
  if (i < 1) {
    console.error(`ERRO: "${par}" não está no formato coluna=valor.`);
    process.exit(1);
  }
  const coluna = par.slice(0, i).trim();
  const valor = par.slice(i + 1);
  if (!colunas.includes(coluna)) {
    console.error(`ERRO: a coluna "${coluna}" não existe em settings.`);
    console.error('Colunas válidas:\n  ' + colunas.filter((c) => c !== 'id').join('\n  '));
    process.exit(1);
  }
  if (coluna === 'id') {
    console.error('ERRO: o id é fixo em 1 e não pode ser alterado.');
    process.exit(1);
  }
  mudancas.push([coluna, valor]);
}

const sets = mudancas.map(([c]) => `\`${c}\` = ?`).join(', ');
const res = db
  .prepare(`UPDATE settings SET ${sets}, \`updated_at\` = datetime('now') WHERE id = 1`)
  .run(...mudancas.map(([, v]) => v));

console.log(`✓ ${res.changes} linha atualizada em ${DB_PATH}\n`);
for (const [c, v] of mudancas) {
  const antes = atual[c] === null ? '(vazio)' : String(atual[c]);
  console.log(`  ${c}`);
  console.log(`    antes:  ${antes}`);
  console.log(`    depois: ${v}`);
}
console.log('\nReinicie o dev server para ver a mudança no site (as settings ficam em cache no processo).');

db.close();
