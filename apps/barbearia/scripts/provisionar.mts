/**
 * Cria uma barbearia nova no banco: tenant, configuração, o dono como admin e
 * um horário de funcionamento inicial.
 *
 * Uso (com `tsx`, porque importa `src/lib/accent.ts` para derivar a cor com
 * contraste garantido — duplicar essa conta aqui era pedir para as duas versões
 * divergirem):
 *
 *   npx tsx scripts/provisionar.mjs \
 *     --slug=cortes-do-ze \
 *     --nome="Barbearia Cortes do Zé" \
 *     --dono="José da Silva" \
 *     --telefone="84 99999-0000" \
 *     --endereco="Rua das Flores, 42" \
 *     --cidade="Mossoró/RN"
 *
 * Opcionais:
 *   --cor=#7c3aed        cor de destaque da marca (o contraste é derivado)
 *   --dominio=x.com.br   domínio próprio; sem isso usa só o subdomínio
 *   --curto="Cortes"     nome curto (o do topo e do rodapé); sem isso, o --nome
 *                        sem o prefixo "Barbearia"/"Salão"
 *   --telefone-dono=...  telefone com que o DONO entra no painel; sem isso, o
 *                        mesmo --telefone da barbearia
 *
 * A senha inicial NÃO vai por argumento — argumento fica no histórico do shell.
 * Use a variável de ambiente SENHA_INICIAL.
 *
 * ⚠️ Este script é o oposto do `seed-bayron.mjs`: ele não traz conteúdo de
 * barbearia nenhuma. A barbearia nasce **sem serviços** e o dono cadastra os
 * dele em /admin/servicos. Enquanto não cadastrar, a seção de serviços do site
 * simplesmente não é renderizada (`PENDENCIAS-ABERTAS.md` §4.1) — o site fica
 * apresentável, mas **ninguém consegue agendar**. O script avisa isso no fim.
 *
 * Var de ambiente obrigatória:
 *   DATABASE_URL
 *   SENHA_INICIAL   — senha do dono, mínimo 8 caracteres
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { derivarAccent, ACCENT_PADRAO, isHex } from '../src/lib/accent.js';

const BCRYPT_COST = 12;

function arg(nome: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : undefined;
}

/**
 * Encerra o script quando falta informação.
 *
 * O `never` no retorno é o que faz o TypeScript entender que, depois desta
 * chamada, as variáveis conferidas não são mais `undefined`. Sem ele, cada uso
 * adiante exigiria um `!` — e `!` é exatamente o que esconde o campo que alguém
 * esqueceu de validar.
 */
function faltou(itens: string[]): never {
  console.error('ERRO: falta informar:\n  ' + itens.join('\n  '));
  console.error('\nVeja o cabeçalho deste arquivo para um exemplo completo.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const senha = process.env.SENHA_INICIAL;

const slug = arg('slug')?.toLowerCase();
const nome = arg('nome');
const dono = arg('dono');
const telefone = arg('telefone');
const endereco = arg('endereco');
const cidade = arg('cidade');
// O nome curto vai no topo e no rodapé, em maiúsculas e com espaçamento largo:
// "BARBEARIA CORTES DO ZÉ" estoura a barra. Sem `--curto`, tiramos o prefixo
// genérico e ficamos com a parte que identifica a barbearia.
const semPrefixo = nome?.replace(/^\s*(barbearia|barber\s*shop|salão|salao)\s+(do\s+|da\s+|de\s+)?/i, '').trim();
const curto = arg('curto') ?? (semPrefixo || nome);
// ⚠️ É por este número que o dono ENTRA no painel (migration 0002). Por padrão
// é o mesmo da barbearia — no negócio de uma pessoa só costuma ser —, mas numa
// barbearia com recepção o número do balcão não é o de ninguém, e aí o dono
// precisa do dele.
const telefoneDono = arg('telefone-dono') ?? telefone;
const cor = arg('cor');
const dominio = arg('dominio') ?? null;

const faltando: string[] = [];
if (!url) faltando.push('DATABASE_URL (variável de ambiente)');
if (!senha) faltando.push('SENHA_INICIAL (variável de ambiente)');
for (const [k, v] of [['slug', slug], ['nome', nome], ['dono', dono],
                      ['telefone', telefone], ['endereco', endereco], ['cidade', cidade]] as const) {
  if (!v) faltando.push(`--${k}`);
}
if (faltando.length) faltou(faltando);

// Depois do `faltou()` acima, nada aqui é undefined — mas o TypeScript não
// consegue ligar o `push` dentro do laço às variáveis. Estreitamos uma vez, aqui,
// em vez de espalhar `!` pelo arquivo.
if (!url || !senha || !slug || !nome || !dono || !telefone || !telefoneDono || !endereco || !cidade || !curto) {
  faltou(faltando.length ? faltando : ['(erro interno: validação inconsistente)']);
}

if (senha.length < 8) {
  console.error('ERRO: SENHA_INICIAL precisa de pelo menos 8 caracteres.');
  process.exit(1);
}
// O slug vira subdomínio: precisa ser um rótulo de DNS válido.
if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
  console.error(`ERRO: "${slug}" não serve como subdomínio. Use só letras minúsculas, números e hífen.`);
  process.exit(1);
}
if (cor && !isHex(cor)) {
  console.error(`ERRO: --cor="${cor}" não é um hex de 6 dígitos (ex: #7c3aed).`);
  process.exit(1);
}

// Só dígitos, como o resto do sistema guarda (migration 0004).
const limpar = (t: string) => t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
const telefoneDigitos = limpar(telefone);
if (telefoneDigitos.length < 10 || telefoneDigitos.length > 11) {
  console.error(`ERRO: telefone "${telefone}" não tem 10 ou 11 dígitos depois de limpo.`);
  process.exit(1);
}
const telefoneLogin = limpar(telefoneDono);
if (telefoneLogin.length < 10 || telefoneLogin.length > 11) {
  console.error(`ERRO: --telefone-dono "${telefoneDono}" não tem 10 ou 11 dígitos depois de limpo.`);
  process.exit(1);
}

// Slug do dono dentro da barbearia. Único por tenant, então o primeiro nome basta.
const slugDono = dono.trim().split(/\s+/)[0]
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin';

// Horário comercial inicial. Não é conteúdo de outra barbearia — é um padrão
// neutro que o dono ajusta em /admin/horarios. Sem NENHUM horário não existem
// vagas e o site de agendamento nasce vazio, o que é pior.
const HORARIO_INICIAL = [
  ...[1, 2, 3, 4, 5].map((d) => ({ weekday: d, startTime: '09:00', endTime: '19:00' })),
  { weekday: 6, startTime: '09:00', endTime: '18:00' },
];
const HORARIO_TEXTO = JSON.stringify([
  { label: 'Segunda — Sexta', hours: '09:00 — 19:00', closed: false },
  { label: 'Sábado', hours: '09:00 — 18:00', closed: false },
  { label: 'Domingo', hours: 'Fechado', closed: true },
]);

const accent = cor ? derivarAccent(cor) : ACCENT_PADRAO;
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const jaExiste = await sql`SELECT slug FROM tenants WHERE slug = ${slug}`;
  if (jaExiste.length) {
    console.error(`ERRO: já existe uma barbearia com o slug "${slug}".`);
    process.exit(1);
  }

  // O telefone de login é único NO MUNDO (migration 0002). Conferimos antes para
  // dar uma mensagem útil, em vez de estourar a constraint no meio da transação.
  const telefoneEmUso = await sql`SELECT 1 FROM barbers WHERE phone = ${telefoneLogin}`;
  if (telefoneEmUso.length) {
    console.error(`ERRO: o telefone ${telefoneLogin} já é o login de outro barbeiro.`);
    console.error('Use --telefone-dono com outro número.');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(senha, BCRYPT_COST);

  // Tudo numa transação: barbearia meio criada — com tenant e sem dono, por
  // exemplo — é pior que criação nenhuma, porque o slug fica ocupado e o
  // provisionamento não pode simplesmente rodar de novo.
  const resultado = await sql.begin(async (tx) => {
    const [tenant] = await tx`
      INSERT INTO tenants (slug, domain, business_name)
      VALUES (${slug}, ${dominio}, ${nome})
      RETURNING id
    `;

    await tx`
      INSERT INTO settings (
        tenant_id, business_name, short_name, whatsapp_number, whatsapp_display,
        address_street, address_city, business_hours,
        accent_color, accent_hover, accent_light,
        seo_title, products_section_title
      ) VALUES (
        ${tenant.id}, ${nome}, ${curto}, ${telefoneDigitos}, ${telefone},
        ${endereco}, ${cidade}, ${HORARIO_TEXTO},
        ${accent.color}, ${accent.hover}, ${accent.light},
        ${nome}, 'Produtos'
      )
    `;

    // Sem `phone` o dono é criado e NÃO consegue entrar: o login do painel é
    // por telefone. A falha só apareceria no primeiro acesso dele.
    const [barbeiro] = await tx`
      INSERT INTO barbers (tenant_id, name, slug, phone, role, password_hash)
      VALUES (${tenant.id}, ${dono}, ${slugDono}, ${telefoneLogin}, 'admin', ${hash})
      RETURNING id
    `;

    for (const h of HORARIO_INICIAL) {
      await tx`
        INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
        VALUES (${tenant.id}, ${barbeiro.id}, ${h.weekday}, ${h.startTime}, ${h.endTime})
      `;
    }

    return { tenantId: tenant.id, barbeiroId: barbeiro.id };
  });

  console.log(`\n✓ ${nome} criada.\n`);
  console.log(`  barbearia   ${slug} (id ${resultado.tenantId})`);
  console.log(`  dono        ${dono}`);
  console.log(`  entra com   ${telefoneLogin}  (telefone, não usuário)`);
  console.log(`  cor         ${accent.color}${cor ? '' : ' (padrão)'}`);
  console.log(`  horário     seg–sex 09:00–19:00, sáb 09:00–18:00`);
  console.log(`\n⚠️  A barbearia está SEM SERVIÇOS. Enquanto o dono não cadastrar o`);
  console.log(`   primeiro em /admin/servicos, ninguém consegue agendar — a seção`);
  console.log(`   de serviços do site nem aparece.`);
  console.log(`\n   Peça a ele para, no primeiro acesso: trocar a senha, cadastrar os`);
  console.log(`   serviços com preço, conferir o horário e subir a logo.\n`);
} catch (erro) {
  console.error('\n✕ Não criou nada:', erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
