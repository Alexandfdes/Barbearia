/**
 * Define/reseta a senha de um barbeiro direto no banco — o caminho de suporte
 * para quando o dono perdeu o acesso ao painel.
 *
 * Desde 09/10/2026 existe o "Esqueci minha senha" do login, que manda o link ao
 * e-mail cadastrado (`src/lib/redefinicaoDeSenha.ts`). Este script continua sendo
 * o caminho de quem NÃO tem e-mail no cadastro — o dono do Bayron é um deles.
 * ⚠️ A regra de sempre: só troque se o pedido vier do próprio número de login
 * (`docs/PENDENCIAS-ABERTAS.md` §4.17).
 *
 * Uso:
 *   node scripts/set-admin-password.mjs <slug> <novaSenha>
 *   node scripts/set-admin-password.mjs bayron "<senha-nova>"
 *
 * Com várias barbearias no mesmo banco, o slug deixou de ser único no mundo
 * (`UNIQUE (tenant_id, slug)` na migration 0001). Quando o mesmo slug existir em
 * mais de uma, o script mostra quais são e pede a barbearia:
 *
 *   node scripts/set-admin-password.mjs bayron "senha" --tenant=cortes-do-ze
 *
 * Vars de ambiente:
 *   DATABASE_URL        (obrigatória)
 *   ADMIN_NEW_PASSWORD  (usada se a senha não vier por argumento)
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ERRO: DATABASE_URL não definido.');
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const tenantSlug = process.argv.find((a) => a.startsWith('--tenant='))?.slice(9);

const slug = (args[0] ?? 'bayron').toLowerCase();
const password = args[1] ?? process.env.ADMIN_NEW_PASSWORD;

if (!password) {
  console.error('ERRO: informe a senha. Ex: node scripts/set-admin-password.mjs bayron "<senha-nova>"');
  process.exit(1);
}
if (password.length < 6) {
  console.error('ERRO: a senha precisa ter ao menos 6 caracteres.');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const candidatos = await sql`
    SELECT b.id, b.name, b.active, t.slug AS tenant_slug, t.business_name
      FROM barbers b
      JOIN tenants t ON t.id = b.tenant_id
     WHERE b.slug = ${slug}
       ${tenantSlug ? sql`AND t.slug = ${tenantSlug}` : sql``}
  `;

  if (candidatos.length === 0) {
    const todos = await sql`
      SELECT b.slug, t.slug AS tenant_slug FROM barbers b JOIN tenants t ON t.id = b.tenant_id
       ORDER BY t.slug, b.slug
    `;
    console.error(`ERRO: nenhum barbeiro com slug "${slug}"${tenantSlug ? ` na barbearia "${tenantSlug}"` : ''}.`);
    console.error('Existentes:', todos.map((r) => `${r.tenant_slug}/${r.slug}`).join(', ') || '(nenhum)');
    process.exit(1);
  }

  // Trocar a senha do barbeiro errado é pior do que não trocar nenhuma: dá
  // acesso ao painel de outra barbearia. Na dúvida, o script não escolhe.
  if (candidatos.length > 1) {
    console.error(`ERRO: o slug "${slug}" existe em ${candidatos.length} barbearias:`);
    for (const c of candidatos) console.error(`  --tenant=${c.tenant_slug}   (${c.business_name})`);
    console.error('Repita o comando com --tenant=<slug da barbearia>.');
    process.exit(1);
  }

  const barbeiro = candidatos[0];
  const hash = bcrypt.hashSync(password, BCRYPT_COST);

  // Reativa junto: senão o login recusa mesmo com a senha certa, e o suporte
  // fica caçando por que "a senha nova não funciona".
  //
  // E grava `senha_trocada_em` (migration 0008): toda sessão aberta com a senha
  // antiga cai na requisição seguinte (`src/lib/session.ts`). Quem pede a senha
  // ao suporte porque desconfia de alguém quer esse alguém fora.
  await sql`
    UPDATE barbers
       SET password_hash = ${hash}, active = true, senha_trocada_em = ${new Date().toISOString()}
     WHERE id = ${barbeiro.id}
  `;

  if (!barbeiro.active) console.log('(barbeiro estava inativo — reativado)');
  console.log(`✓ Senha de "${barbeiro.name}" (${barbeiro.tenant_slug}/${slug}) atualizada.`);
  console.log('As sessões abertas com a senha antiga foram encerradas. Agora é só logar no painel com a nova.');
} catch (erro) {
  console.error('✕ Falhou:', erro.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
