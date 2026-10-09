/**
 * Cria uma barbearia nova no banco: tenant, configuração, o dono como admin e
 * um horário de funcionamento inicial.
 *
 * Uso (com `tsx`, porque importa `src/lib/accent.ts` para derivar a cor com
 * contraste garantido — duplicar essa conta aqui era pedir para as duas versões
 * divergirem):
 *
 *   npm run db:provisionar -- \
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
 *   --sem-teste          nasce pagando, sem o teste de 7 dias — para barbearia
 *                        que você combinou por fora. Sem isso, nasce no teste,
 *                        como pelo cadastro da web (decisão de 08/10/2026)
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
import { provisionarBarbearia } from '../src/lib/provisionarBarbearia.js';
import { ultimoDia } from '../src/lib/situacao.js';

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

  // ⚠️ O erro mais provável não é esquecer um campo — é escrever
  // `--slug valor` em vez de `--slug=valor`.
  //
  // `arg()` só reconhece a forma com `=`, então a forma com espaço faz TODOS os
  // campos aparecerem como faltando. Quem está provisionando o primeiro cliente,
  // com ele esperando do outro lado, vai procurar erro de digitação num campo
  // que digitou certo. Melhor dizer.
  const comEspaco = process.argv
    .slice(2)
    .filter((a, i, todos) => /^--[a-z]+$/.test(a) && todos[i + 1] !== undefined && !todos[i + 1].startsWith('--'));

  if (comEspaco.length > 0) {
    console.error(
      `\n⚠️  Parece que você usou espaço no lugar de '=':\n` +
      comEspaco.map((a) => `      ${(a + ' valor').padEnd(22)}→   ${a}=valor`).join('\n') +
      `\n\n   Só a forma com '=' é reconhecida.`
    );
  }

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
const curto = arg('curto');
const telefoneDono = arg('telefone-dono');
const cor = arg('cor');
const dominio = arg('dominio') ?? null;
const semTeste = process.argv.includes('--sem-teste');

// Só o que impede a função de rodar fica aqui. O RESTO das recusas — slug
// inválido, senha curta, telefone repetido — mora em `provisionarBarbearia()`,
// porque a tela de cadastro precisa exatamente das mesmas, e duas listas de
// regras é como as duas versões divergem.
const faltando: string[] = [];
if (!url) faltando.push('DATABASE_URL (variável de ambiente)');
if (!senha) faltando.push('SENHA_INICIAL (variável de ambiente)');
for (const [k, v] of [['slug', slug], ['nome', nome], ['dono', dono],
                      ['telefone', telefone], ['endereco', endereco], ['cidade', cidade]] as const) {
  if (!v) faltando.push(`--${k}`);
}
if (faltando.length) faltou(faltando);
if (!url || !senha || !slug || !nome || !dono || !telefone || !endereco || !cidade) {
  faltou(faltando.length ? faltando : ['(erro interno: validação inconsistente)']);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const r = await provisionarBarbearia(sql, {
    slug, nome, dono, telefone, endereco, cidade, senha,
    curto, telefoneDono, cor, dominio, semTeste,
  });

  if (!r.ok) {
    console.error(`\nERRO (${r.campo}): ${r.erro}`);
    if (r.campo === 'telefone-dono' && r.conflito) {
      console.error('Use --telefone-dono com outro número.');
    }
    process.exit(1);
  }

  console.log(`\n✓ ${r.nome} criada.\n`);
  console.log(`  barbearia   ${r.slug} (id ${r.tenantId})`);
  console.log(`  dono        ${dono}`);
  console.log(`  entra com   ${r.telefoneLogin}  (WhatsApp, não usuário)`);
  console.log(`  cor         ${r.accent.color}${r.corVeioDoCliente ? '' : ' (padrão)'}`);
  console.log(`  horário     seg–sex 09:00–19:00, sáb 09:00–18:00`);
  console.log(r.testeAte
    ? `  teste       até ${ultimoDia(r.testeAte, undefined, 'dd/MM/yyyy')} — depois, 3 dias de carência e fora do ar sem cartão`
    : `  teste       nenhum: nasceu pagando (--sem-teste)`);
  console.log(`\n  ⓘ  Se o painel já estiver no ar, ele leva até 30s para enxergar`);
  console.log(`     esta barbearia — é o cache de tenants (src/lib/tenant.ts).`);
  console.log(`\n⚠️  A barbearia está SEM SERVIÇOS. Enquanto não houver o primeiro,`);
  console.log(`   ninguém consegue agendar — a seção de serviços do site nem aparece.`);
  console.log(`\n   Em /admin/servicos, com a lista vazia, aparece o botão "usar catálogo`);
  console.log(`   sugerido": oito serviços comuns, já ligados aos barbeiros. Eles entram`);
  console.log(`   DESLIGADOS e sem preço de propósito — o dono põe o preço dele e liga.`);
  console.log(`\n   Peça a ele para, no primeiro acesso: trocar a senha, montar o`);
  console.log(`   catálogo com os preços, conferir o horário e subir a logo.\n`);
} catch (erro) {
  console.error('\n✕ Não criou nada:', erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
