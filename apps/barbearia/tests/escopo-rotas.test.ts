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
const PENDENTES = new Set([
  // 🔴 BLOQUEADA POR DECISÃO, não por falta de trabalho.
  //
  // O login do painel busca o barbeiro por `slug`, que era único no mundo. Com
  // vários tenants ele vira único POR TENANT — e o painel é central
  // (painel.barbearianoar.com.br), então não há host de onde tirar a barbearia.
  // Dois donos chamados "bayron" colidem no login.
  //
  // A recomendação registrada no §6 do ARQUITETURA-MULTI-TENANT-V1.md é login
  // por telefone: todo barbeiro tem, é único, e é consistente com o portal do
  // cliente. Enquanto essa decisão não for tomada, escopar esta rota é chutar.
  'auth/login.ts',
]);

interface Rota { nome: string; escopada: boolean; tocaBanco: boolean }

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
    return {
      nome: caminho.replace('src/pages/api/', '').replace('src/pages/', 'PÁGINA:'),
      tocaBanco: tocaTabela && consulta,
      escopada: /tenant\.id|tenantId/.test(s),
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
  it('o passo 4 está no ponto que a documentação afirma', () => {
    const escopadas = rotas.filter((r) => r.tocaBanco && r.escopada).length;
    const total = rotas.filter((r) => r.tocaBanco).length;
    expect({ escopadas, total }).toEqual({ escopadas: 53, total: 54 });
  });
});
