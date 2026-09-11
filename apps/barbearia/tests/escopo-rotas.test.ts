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

/** Tabelas que ganharam `tenant_id` na migration 0001. */
const TABELAS = [
  'barbers', 'services', 'products', 'appointments', 'appointmentItems',
  'barberServices', 'workingHours', 'timeOff', 'productSales', 'reservations',
  'combos', 'settings',
  'appointment_items', 'barber_services', 'working_hours', 'time_off', 'product_sales',
];

/**
 * Rotas ainda não escopadas. **Só encolhe.**
 * Ver `migracao-tenants/LEIA-ME.md` para a ordem sugerida.
 */
const PENDENTES = new Set<string>([
  // ✅ VAZIA desde 09/09/2026 — as 54 rotas e páginas estão escopadas.
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

interface Rota { nome: string; escopada: boolean; tocaBanco: boolean; usaTenantFixo: boolean; doPainel: boolean }

/**
 * ⚠️ As rotas de API NÃO são a superfície toda. Doze páginas `.astro` consultam
 * o banco direto no frontmatter — o painel inteiro. A contagem de "49 rotas" dos
 * documentos subestima a exposição; o número real é 41 rotas + 12 páginas.
 */
const rotas: Rota[] = [...globSync('src/pages/api/**/*.ts'), ...globSync('src/pages/**/*.astro')]
  .sort()
  .map((caminho) => {
    const s = readFileSync(caminho, 'utf8');
    const tocaTabela = TABELAS.some((t) => new RegExp(`\\b${t}\\b`).test(s));
    const consulta = /\.(select|insert|update|delete)\(|SELECT |INSERT INTO|UPDATE |DELETE FROM/.test(s);
    // ⚠️ `globSync` devolve o separador do sistema: `/` no Linux, `\` no Windows.
    // Sem normalizar, no Windows nenhum `replace` abaixo casa — os nomes saem
    // como `src\pages\api\auth\login.ts`, não batem com `PENDENTES`, e a
    // contagem de páginas dá zero. O desenvolvimento é em Windows e a produção
    // em Linux: teste que só roda num dos dois não é guarda-corpo.
    const norm = caminho.split(sep).join('/');
    return {
      nome: norm.replace('src/pages/api/', '').replace('src/pages/', 'PÁGINA:'),
      tocaBanco: tocaTabela && consulta,
      escopada: /tenant\.id|tenantId/.test(s),
      // ⚠️ De ONDE veio o tenant importa tanto quanto se ele foi usado.
      usaTenantFixo: /tenantAtual\(\)/.test(s),
      doPainel: norm.includes('pages/admin/') || norm.includes('pages/api/admin/'),
    };
  });

describe('escopo por tenant nas rotas de API', () => {
  it('encontra as rotas e as páginas (guarda contra o glob quebrar em silêncio)', () => {
    expect(rotas.filter((r) => !r.nome.startsWith('PÁGINA:')).length).toBeGreaterThan(40);
    expect(rotas.filter((r) => r.nome.startsWith('PÁGINA:')).length).toBeGreaterThan(10);
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
    // arquivos: sem ele, "0 de 0" passaria como sucesso.
    expect(total).toBeGreaterThanOrEqual(54);
    expect({ escopadas, total }).toEqual({ escopadas: total, total });
  });
});
