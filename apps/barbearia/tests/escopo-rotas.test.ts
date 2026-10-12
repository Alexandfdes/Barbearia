// Guarda-corpo do passo 4: nenhuma rota nova pode tocar tabela com `tenant_id`
// sem escopar por tenant.
//
// Não precisa de banco: lê o código-fonte. Roda sempre, inclusive no `npm test`
// de uma máquina sem Postgres.
//
// COMO ISTO FUNCIONA
//   `PENDENTES` é a lista das rotas que ainda NÃO foram escopadas. O teste
//   falha de duas formas:
//     1. uma rota fora da lista toca o banco sem tenant  → alguém regrediu
//     2. uma rota da lista JÁ está escopada              → tire-a da lista
//   A segunda existe para a lista encolher de verdade em vez de virar
//   cemitério. Quando ela zerar, o passo 4 acabou.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { sep } from 'node:path';

/**
 * Tabelas com `tenant_id`: as doze da migration 0001, a galeria (0005), as duas
 * da senha nova e dos avisos (0008), a dos eventos da Asaas (0010) e o registro
 * do painel do operador (0012).
 */
const TABELAS = [
  'barbers', 'services', 'products', 'appointments', 'appointmentItems',
  'barberServices', 'workingHours', 'timeOff', 'productSales', 'reservations',
  'combos', 'settings', 'galleryImages', 'redefinicoesDeSenha', 'avisosEnviados',
  'webhookEvents', 'acoesDoOperador',
  'appointment_items', 'barber_services', 'working_hours', 'time_off', 'product_sales',
  'gallery_images', 'redefinicoes_de_senha', 'avisos_enviados', 'webhook_events',
  'acoes_do_operador',
];

/**
 * Rotas ainda não escopadas. **Só encolhe.**
 */
const PENDENTES = new Set<string>([
  // ✅ VAZIA desde 09/09/2026. Com o glob e o regex consertados em 22/09 e os
  // componentes incluídos em 24/09: 66 arquivos tocam o banco, 66 filtram.
  //
  // A última era `auth/login.ts`, e não era falta de trabalho: ela buscava o
  // barbeiro por `slug`, que a migration 0001 tornou único só POR barbearia.
  // Resolvida trocando o login para TELEFONE (migration 0002), que é único no
  // mundo e por isso identifica a pessoa e a barbearia de uma vez.
  //
  // Rota nova que toque tabela com `tenant_id` sem filtrar por tenant faz o
  // teste abaixo falhar. Não adicione nada aqui para "resolver depois" sem
  // escrever ao lado por que não dá para escopar agora.
]);

interface Rota { caminho: string; nome: string; escopada: boolean; tocaBanco: boolean; usaTenantFixo: boolean; doPainel: boolean }

/**
 * Arquivos de código em `src/` que ficam fora do guarda **de propósito** — cada um
 * com o motivo. O caso de controle no fim deste arquivo reprova qualquer outro.
 */
const FORA_DE_PROPOSITO = new Map<string, string>([
  ['src/config.ts', 'constantes do site; não importa o banco'],
]);

/**
 * ⚠️ AS ROTAS DE API NÃO SÃO A SUPERFÍCIE TODA, e este glob já foi curto demais
 * duas vezes.
 *
 * Doze páginas `.astro` consultam o banco direto no frontmatter — o painel
 * inteiro. E a auditoria de 15/09/2026 achou a segunda omissão: `src/lib/` nunca
 * era varrido, e é onde moram `slots.ts` e `reagendar.ts`, os dois sem uma única
 * menção a tenant. As duas consultavam tabela com `tenant_id` sem filtrar, e o
 * relatório de "54 de 54 rotas escopadas" nunca as contou.
 *
 * A lição não é sobre este glob: é que **guarda que varre um recorte mede o
 * recorte, não o sistema** — e ele não fica vermelho quando o recorte encolhe.
 */
const rotas: Rota[] = [
  ...globSync('src/pages/api/**/*.ts'),
  ...globSync('src/pages/**/*.astro'),
  ...globSync('src/lib/**/*.ts'),
  ...globSync('src/db/**/*.ts'),
  // ⚠️ A TERCEIRA OMISSÃO, achada em 24/09/2026 — dois dias depois de eu ter
  // escrito o parágrafo acima. `Products.astro` e `Services.astro` consultam o
  // banco para decidir se a seção existe, e nenhum dos dois filtrava por
  // barbearia. O glob de 22/09 tinha ganhado `src/lib/` e esquecido que
  // componente também faz consulta. Em vez de listar mais uma pasta, a regra
  // agora é: tudo em `src/`, menos o que comprovadamente não é código.
  ...globSync('src/components/**/*.astro'),
  ...globSync('src/layouts/**/*.astro'),
  ...globSync('src/middleware.ts'),
]
  .sort()
  .map((caminho) => {
    const s = readFileSync(caminho, 'utf8');
    const tocaTabela = TABELAS.some((t) => new RegExp(`\\b${t}\\b`).test(s));
    // ⚠️ `\s`, NÃO UM ESPAÇO LITERAL. A versão anterior era `/SELECT /`, e por
    // isso toda consulta que quebra a linha logo depois do `SELECT` — o estilo
    // de metade das consultas cruas deste projeto — dava `tocaBanco: false` e
    // ficava invisível. Foi assim que `appointments/search.ts` e
    // `appointments/calendar.ts` passaram despercebidas até 15/09/2026.
    const consulta = /\.(select|insert|update|delete)\(|\bSELECT\s|\bINSERT\s+INTO\b|\bUPDATE\s|\bDELETE\s+FROM\b/.test(s);
    // ⚠️ `globSync` devolve o separador do sistema: `/` no Linux, `\` no Windows.
    // Sem normalizar, no Windows nenhum `replace` abaixo casa — os nomes saem
    // como `src\pages\api\auth\login.ts`, não batem com `PENDENTES`, e a
    // contagem de páginas dá zero. O desenvolvimento é em Windows e a produção
    // em Linux: teste que só roda num dos dois não é guarda-corpo.
    const norm = caminho.split(sep).join('/');
    return {
      caminho: norm,
      nome: norm
        .replace('src/pages/api/', '')
        .replace('src/pages/', 'PÁGINA:')
        .replace('src/lib/', 'LIB:')
        .replace('src/db/', 'LIB:db/')
        .replace('src/components/', 'COMPONENTE:')
        .replace('src/layouts/', 'LAYOUT:')
        .replace('src/middleware.ts', 'MIDDLEWARE'),
      tocaBanco: tocaTabela && consulta,
      escopada: /tenant\.id|tenantId/.test(s),
      // ⚠️ De ONDE veio o tenant importa tanto quanto se ele foi usado.
      usaTenantFixo: /tenantAtual\(\)/.test(s),
      // Componente de `components/admin/` só é renderizado dentro do painel.
      doPainel: norm.includes('pages/admin/') || norm.includes('pages/api/admin/')
        || norm.includes('components/admin/'),
    };
  });

describe('escopo por tenant nas rotas de API', () => {
  it('encontra as rotas e as páginas (guarda contra o glob quebrar em silêncio)', () => {
    expect(rotas.filter((r) => !r.nome.startsWith('PÁGINA:')).length).toBeGreaterThan(40);
    expect(rotas.filter((r) => r.nome.startsWith('PÁGINA:')).length).toBeGreaterThan(10);
  });

  it('nenhum arquivo de código em src/ fica fora do guarda — o recorte não encolhe em silêncio', () => {
    // O glob deste guarda já foi curto três vezes (páginas, `src/lib/`,
    // `src/components/`), e nas três ele continuou VERDE, medindo menos do que
    // dizia. Este caso é o controle: pasta nova com código faz o teste falhar
    // até alguém decidir se ela entra no glob ou na lista FORA_DE_PROPOSITO.
    const cobertos = new Set(rotas.map((r) => r.caminho));
    const fora = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')]
      .map((c) => c.split(sep).join('/'))
      .filter((c) => !cobertos.has(c) && !FORA_DE_PROPOSITO.has(c))
      .sort();
    expect(fora, 'ponha no glob, ou em FORA_DE_PROPOSITO com o motivo').toEqual([]);
  });

  it('nenhuma rota FORA da lista de pendentes toca o banco sem tenant', () => {
    const regrediram = rotas
      .filter((r) => r.tocaBanco && !r.escopada && !PENDENTES.has(r.nome))
      .map((r) => r.nome);
    expect(regrediram).toEqual([]);
  });

  it('a lista de pendentes não guarda rota que já foi escopada', () => {
    const jaFeitas = rotas.filter((r) => r.escopada && PENDENTES.has(r.nome)).map((r) => r.nome);
    expect(jaFeitas, 'já escopadas — tire da lista PENDENTES').toEqual([]);
  });

  it('a lista de pendentes não cita rota que não existe mais', () => {
    const nomes = new Set(rotas.map((r) => r.nome));
    const fantasmas = [...PENDENTES].filter((p) => !nomes.has(p));
    expect(fantasmas).toEqual([]);
  });

  // Documenta o progresso. Ajuste o número ao tirar rotas de PENDENTES.
  it('nenhuma tela do painel resolve o tenant com tenantAtual()', () => {
    // `tenantAtual()` devolve TENANT_UNICO — id 1, sempre. Numa tela do painel
    // isso significa ler e ESCREVER os dados da barbearia 1, qualquer que seja
    // quem esteja logado.
    //
    // O caso que motivou este teste: `admin/configuracoes.astro` filtrava por
    // `tenantAtual().id`. Como o arquivo mencionava `tenantId`, ele contava como
    // "escopado" — mas o dono da barbearia 2 editaria a configuração da 1.
    //
    // Contar que o filtro existe não basta: o tenant tem que vir da SESSÃO.
    const erradas = rotas
      .filter((r) => r.doPainel && r.usaTenantFixo)
      .map((r) => r.nome);
    expect(erradas).toEqual([]);
  });

  it('TODA rota que toca o banco é escopada — sem exceção pendente', () => {
    const escopadas = rotas.filter((r) => r.tocaBanco && r.escopada).length;
    const total = rotas.filter((r) => r.tocaBanco).length;

    // ⚠️ O que importa é a IGUALDADE, não o número.
    //
    // Este caso já afirmou `{escopadas: 54, total: 54}` — e quebrou no dia em
    // que uma rota nova e corretamente escopada entrou, porque virou 55 de 55.
    // Vermelho por crescer é vermelho que ensina a ignorar vermelho.
    //
    // O piso abaixo continua existindo para o caso de o glob deixar de achar os
    // arquivos: sem ele, "0 de 0" passaria como sucesso. Subiu de 54 para 63 em
    // 22/09/2026, quando o glob passou a varrer `src/lib/` e o regex parou de
    // exigir espaço depois do `SELECT` — o número antigo era o do recorte, não
    // o do sistema. E para 66 em 24/09, com `src/components/` e `src/layouts/`.
    expect(total).toBeGreaterThanOrEqual(66);
    expect({ escopadas, total }).toEqual({ escopadas: total, total });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O GUARDA ACIMA OLHA O ARQUIVO. ESTE OLHA CADA CONSULTA.
//
// ⚠️ Achado em 25/09/2026: "66 arquivos tocam o banco, 66 filtram" era verdade e
// enganava. `escopada` pergunta se o arquivo MENCIONA `tenant.id` em algum lugar —
// e quase toda tela do painel menciona, na primeira consulta, a que confere o
// barbeiro logado. A consulta seguinte, a que lista o conteúdo da tela, podia não
// filtrar nada e o arquivo continuava contando como escopado.
//
// Eram doze consultas assim, em dez arquivos: a lista de produtos, de combos, de
// reservas, de barbeiros, e o ramo do dono em serviços e bloqueios. Nenhuma
// vazava — o RLS (a segunda parede) segurava todas. Mas a primeira parede, a
// que o documento dizia estar completa, tinha doze buracos.
//
// O recorte aqui é o construtor do Drizzle (`.from()`, `.update()`, `.delete()`).
// SQL cru foi conferido à mão no mesmo dia: a única consulta crua sem filtro é a
// de `provisionarBarbearia.ts`, que roda como dono de propósito.

/** As tabelas com `tenant_id`, pelo nome da variável do Drizzle — e os apelidos. */
const TABELAS_DRIZZLE = [
  'barbers', 'services', 'products', 'appointments', 'appointmentItems',
  'barberServices', 'workingHours', 'timeOff', 'productSales', 'reservations',
  'combos', 'settings', 'galleryImages', 'redefinicoesDeSenha', 'avisosEnviados',
  'webhookEvents', 'acoesDoOperador',
  // apelidos de importação (`import { services as servicesTable }`)
  'servicesTable', 'settingsTable',
];

/**
 * Consultas que NÃO filtram por barbearia de propósito. Uma linha por consulta:
 * se o arquivo ganhar outra igual, o teste falha até alguém justificar.
 */
const CONSULTAS_SEM_FILTRO: [string, string][] = [
  ['src/pages/api/auth/login.ts .from(barbers)', 'acha o barbeiro pelo TELEFONE antes de saber a barbearia (único no mundo), como dono'],
  ['src/pages/api/auth/login.ts .from(barbers)', 'idem, pelo slug legado — só enquanto houver uma barbearia'],
  // A senha nova (09/10/2026) começa como o login: o pedido chega antes de se
  // saber de qual barbearia ele é. As outras consultas do arquivo filtram.
  ['src/lib/redefinicaoDeSenha.ts .from(barbers)', 'acha o barbeiro pelo TELEFONE do "esqueci minha senha", como o login'],
  ['src/lib/redefinicaoDeSenha.ts .from(redefinicoesDeSenha)', 'acha o pedido pelo hash do TOKEN do link — o token é a identidade, e a barbearia sai dele'],
];

const FILTRO = /tenantId|tenant\.id/;

/**
 * O comando que contém a posição `i`: do `;` anterior ao próximo.
 *
 * Grosseiro de propósito. Erra para o lado de reprovar: um `;` dentro de um
 * comentário no meio do comando corta o `.where()` e o teste acusa — basta tirar
 * o `;` do comentário. O contrário (aprovar consulta sem filtro) exigiria o
 * filtro aparecer no mesmo comando, o que é justamente o que se quer.
 */
function comandoEm(fonte: string, i: number): string {
  const ini = fonte.lastIndexOf(';', i) + 1;
  const fim = fonte.indexOf(';', i);
  return fonte.slice(ini, fim === -1 ? undefined : fim);
}

/**
 * `.where(filtro)` com o filtro montado antes, numa variável, vale se ela filtra.
 *
 * ⚠️ O que isto pega é OMISSÃO, não filtro errado. Uma variável montada como
 * `papel === 'admin' ? undefined : eq(x.tenantId, ...)` passaria: o texto dela
 * menciona `tenantId`. Por isso o padrão da casa é o filtro da barbearia FORA do
 * ramo — `and(eq(x.tenantId, tenant.id), papel === 'admin' ? undefined : ...)` —,
 * onde tirar o filtro tira a menção e o teste acusa.
 */
function filtraPorVariavel(comando: string, fonte: string): boolean {
  for (const m of comando.matchAll(/\.where\(\s*(\w+)\s*\)/g)) {
    const def = new RegExp(`(?:const|let)\\s+${m[1]}\\b[^;]*`).exec(fonte);
    if (def && FILTRO.test(def[0])) return true;
  }
  return false;
}

function consultasSemFiltro(): string[] {
  const achadas: string[] = [];
  for (const r of rotas) {
    const fonte = readFileSync(r.caminho, 'utf8');
    for (const m of fonte.matchAll(/\.(from|update|delete)\(\s*(\w+)\s*\)/g)) {
      if (!TABELAS_DRIZZLE.includes(m[2])) continue;
      const comando = comandoEm(fonte, m.index!);
      if (FILTRO.test(comando) || filtraPorVariavel(comando, fonte)) continue;
      achadas.push(`${r.caminho} .${m[1]}(${m[2]})`);
    }
  }
  return achadas.sort();
}

describe('escopo por tenant em CADA consulta, não só no arquivo', () => {
  it('toda consulta do Drizzle a tabela de barbearia filtra por barbearia', () => {
    const permitidas = CONSULTAS_SEM_FILTRO.map(([c]) => c).sort();
    expect(consultasSemFiltro(), 'filtre por tenant.id, ou justifique em CONSULTAS_SEM_FILTRO').toEqual(permitidas);
  });

  it('o recorte acha as consultas (guarda contra o regex quebrar em silêncio)', () => {
    // Se o padrão parasse de casar, "nenhuma consulta sem filtro" passaria por
    // não ter olhado nada. Conta quantas consultas ele enxerga no total.
    let total = 0;
    for (const r of rotas) {
      const fonte = readFileSync(r.caminho, 'utf8');
      for (const m of fonte.matchAll(/\.(from|update|delete)\(\s*(\w+)\s*\)/g)) {
        if (TABELAS_DRIZZLE.includes(m[2])) total++;
      }
    }
    expect(total).toBeGreaterThanOrEqual(140);
  });

  it('um apelido novo de tabela não escapa do recorte', () => {
    // `import { services as servicesTable }` faz a consulta dizer
    // `.from(servicesTable)`. Apelido fora da lista seria consulta invisível.
    const apelidos = new Set<string>();
    for (const r of rotas) {
      const fonte = readFileSync(r.caminho, 'utf8');
      for (const imp of fonte.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*db\/schema(?:\.js)?['"]/g)) {
        for (const m of imp[1].matchAll(/(\w+)\s+as\s+(\w+)/g)) {
          if (m[1] !== 'tenants') apelidos.add(m[2]);
        }
      }
    }
    const fora = [...apelidos].filter((a) => !TABELAS_DRIZZLE.includes(a));
    expect(fora, 'ponha o apelido em TABELAS_DRIZZLE').toEqual([]);
  });
});

describe('as listas de tabelas deste arquivo acompanham o schema', () => {
  it('toda tabela com tenantId em src/db/schema.ts está nas duas listas', () => {
    // As listas acima são escritas à mão. Tabela nova com `tenant_id` que não
    // entrasse nelas ficaria fora dos dois guardas — verde, sem olhar.
    const schema = readFileSync('src/db/schema.ts', 'utf8');
    const comTenant = [...schema.matchAll(/export const (\w+) = pgTable\('(\w+)',\s*\{([\s\S]*?)\n\}/g)]
      .filter((m) => /tenantId:/.test(m[3]))
      .map((m) => ({ variavel: m[1], tabela: m[2] }));

    expect(comTenant.length).toBeGreaterThanOrEqual(13);
    const faltando = comTenant
      .filter(({ variavel, tabela }) =>
        !TABELAS_DRIZZLE.includes(variavel) || !TABELAS.includes(variavel)
        || (tabela.includes('_') && !TABELAS.includes(tabela)))
      .map(({ variavel }) => variavel);
    expect(faltando, 'ponha em TABELAS e TABELAS_DRIZZLE').toEqual([]);
  });
});
