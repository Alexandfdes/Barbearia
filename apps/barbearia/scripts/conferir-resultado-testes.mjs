/**
 * Confere o relatório JSON do vitest e RECUSA verde com teste pulado.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────────
 *
 * Sem `DATABASE_URL`, os testes que tocam o banco não falham: são PULADOS, e o
 * vitest sai com código 0. A suíte fica verde tendo conferido pouco mais da
 * metade — e a metade de fora é a que mexe com dado de cliente: login,
 * agendamento, RLS, a carga da migração, o backup.
 *
 * No CI isso seria pior do que na máquina de alguém, porque desde 10/10/2026 a
 * `main` vai para produção: um serviço de banco que não subiu, uma variável com o
 * nome trocado, e o verde autorizaria o deploy sem ninguém ver que nada de banco
 * rodou. Por isso, no CI, pulado conta como falha.
 *
 * ⚠️ Só para o CI, que é Linux. No Windows dois casos de `imagemEmDisco` pulam de
 * propósito (precisam de /proc) — rodar isto lá recusaria uma suíte correta.
 *
 * Uso: node scripts/conferir-resultado-testes.mjs <relatorio.json>
 */
import { readFileSync } from 'node:fs';

const caminho = process.argv[2];
if (!caminho) {
  console.error('Uso: node scripts/conferir-resultado-testes.mjs <relatorio.json>');
  process.exit(2);
}

let r;
try {
  r = JSON.parse(readFileSync(caminho, 'utf8'));
} catch (e) {
  console.error(`Não consegui ler o relatório do vitest em ${caminho}: ${e.message}`);
  process.exit(1);
}

const total = r.numTotalTests ?? 0;
const passaram = r.numPassedTests ?? 0;
const falharam = r.numFailedTests ?? 0;
const pulados = (r.numPendingTests ?? 0) + (r.numTodoTests ?? 0);

console.log(`Testes: ${total} no total — ${passaram} passaram, ${falharam} falharam, ${pulados} pulados.`);

const problemas = [];
if (total === 0) problemas.push('nenhum teste rodou');
if (falharam > 0) problemas.push(`${falharam} falharam`);
if (pulados > 0) {
  problemas.push(
    `${pulados} foram pulados — quase sempre é o banco que não chegou aos testes ` +
    '(DATABASE_URL ausente, ou o serviço do Postgres não subiu)',
  );
}

if (problemas.length) {
  console.error(`\nRECUSADO: ${problemas.join('; ')}.`);
  process.exit(1);
}
console.log('Nenhum pulado: a suíte inteira rodou, com banco.');
