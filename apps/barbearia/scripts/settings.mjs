/**
 * Lê e edita a configuração de uma barbearia (tabela `settings`) sem depender do
 * `psql` — que não vem instalado no Windows.
 *
 * Uso:
 *   node scripts/settings.mjs
 *       mostra a configuração da barbearia (pede --tenant se houver mais de uma)
 *
 *   node scripts/settings.mjs 'business_name=Barbearia Sete Cortes' 'short_name=Sete Cortes'
 *       altera as colunas informadas
 *
 *   node scripts/settings.mjs --tenant=cortes-do-ze
 *       escolhe a barbearia quando há mais de uma no banco
 *
 * No PowerShell, envolva CADA par em aspas simples — sem isso o espaço quebra
 * o argumento em dois.
 *
 * ⚠️ O servidor guarda as settings em cache por barbearia (`lib/settings.ts`),
 * então reinicie-o para ver a mudança no site. Pela tela /admin/configuracoes
 * isso não é necessário: ela invalida o cache sozinha.
 *
 * Vars de ambiente:
 *   DATABASE_URL (obrigatória)
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ERRO: DATABASE_URL não definido.');
  process.exit(1);
}

const tenantSlug = process.argv.find((a) => a.startsWith('--tenant='))?.slice(9);
const pares = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const colunas = (await sql`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'settings'
     ORDER BY ordinal_position
  `).map((c) => c.column_name);

  if (colunas.length === 0) {
    console.error('ERRO: a tabela `settings` não existe neste banco.');
    console.error('Rode as migrations primeiro:  node scripts/startup.mjs');
    process.exit(1);
  }

  // Cada barbearia tem a própria linha de settings (migration 0001). Escolher
  // sozinho a linha errada significaria reescrever a configuração do cliente
  // errado — por isso o script para e pergunta.
  const linhas = await sql`
    SELECT s.*, t.slug AS tenant_slug, t.business_name AS tenant_nome
      FROM settings s
      JOIN tenants t ON t.id = s.tenant_id
     ${tenantSlug ? sql`WHERE t.slug = ${tenantSlug}` : sql``}
     ORDER BY t.slug
  `;

  if (linhas.length === 0) {
    const tenants = await sql`SELECT slug, business_name FROM tenants ORDER BY slug`;
    console.error(tenantSlug
      ? `ERRO: nenhuma configuração para a barbearia "${tenantSlug}".`
      : 'ERRO: nenhuma linha em `settings`.');
    console.error('Barbearias no banco:', tenants.map((t) => t.slug).join(', ') || '(nenhuma)');
    process.exit(1);
  }

  if (linhas.length > 1) {
    console.error(`ERRO: há ${linhas.length} barbearias neste banco. Escolha uma:`);
    for (const l of linhas) console.error(`  --tenant=${l.tenant_slug}   (${l.tenant_nome})`);
    process.exit(1);
  }

  const atual = linhas[0];

  // Sem argumentos: só mostra o que está lá hoje.
  if (pares.length === 0) {
    console.log(`Configuração de ${atual.tenant_nome} (${atual.tenant_slug}):\n`);
    for (const k of colunas) {
      const v = atual[k];
      const texto = v === null ? '(vazio)' : String(v);
      console.log(`  ${k.padEnd(24)} ${texto.length > 70 ? texto.slice(0, 70) + '…' : texto}`);
    }
    console.log("\nPara alterar:  node scripts/settings.mjs 'business_name=Nova Barbearia'");
    process.exit(0);
  }

  const imutaveis = new Set(['id', 'tenant_id']);
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
      console.error('Colunas válidas:\n  ' + colunas.filter((c) => !imutaveis.has(c)).join('\n  '));
      process.exit(1);
    }
    if (imutaveis.has(coluna)) {
      console.error(`ERRO: "${coluna}" identifica a linha e não pode ser alterada por aqui.`);
      process.exit(1);
    }
    mudancas.push([coluna, valor]);
  }

  // `sql(objeto, ...colunas)` monta o SET com os nomes já escapados pelo driver.
  const patch = Object.fromEntries(mudancas);
  patch.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await sql`UPDATE settings SET ${sql(patch, ...Object.keys(patch))} WHERE id = ${atual.id}`;

  console.log(`✓ Configuração de ${atual.tenant_nome} atualizada\n`);
  for (const [c, v] of mudancas) {
    const antes = atual[c] === null ? '(vazio)' : String(atual[c]);
    console.log(`  ${c}`);
    console.log(`    antes:  ${antes}`);
    console.log(`    depois: ${v}`);
  }
  console.log('\nReinicie o servidor para ver a mudança no site (as settings ficam em cache no processo).');
} catch (erro) {
  console.error('✕ Falhou:', erro.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
