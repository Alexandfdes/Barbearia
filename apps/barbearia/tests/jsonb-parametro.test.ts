// JSON pelo `sqlConn` vai como `::text::jsonb` — nunca só `::jsonb`.
//
// ── O DEFEITO (achado em 12/10/2026, escrevendo as telas do operador) ─────────
//
// `${JSON.stringify(x)}::jsonb` deixa o parâmetro tipado jsonb, e o driver
// (postgres.js) serializa parâmetro jsonb com `JSON.stringify` — de novo, por cima
// do texto que já era JSON. O banco recebia `"{\"a\":1}"` e gravava uma STRING. Só
// não acontecia depois de o Drizzle tocar o pool: ele troca esse serializador por
// um que passa o texto como está.
//
// Por isso o defeito dependia de quem chegava primeiro no processo. O webhook da
// Asaas e o painel do operador não passam pelo Drizzle no começo da requisição — e
// depois de um deploy a Asaas reenvia a fila de uma vez. O corpo do evento ficava
// gravado como string (`payload->'payment'` não achava o valor), e o registro do
// "tirar do ar" também (`detalhe->>'statusAnterior'`, e o reativar perguntava como a
// barbearia estava, com a resposta gravada ali).
//
// `::text::jsonb` tipa o parâmetro como TEXTO: o driver manda o JSON como está, e
// o banco o lê como objeto, com ou sem Drizzle. A 0014 conserta as linhas antigas.
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import { exigirBancoDeTeste } from './guardaBanco.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/**
 * Um parâmetro (`${…}`) convertido direto para json/jsonb, sem passar por `::text` —
 * pelo `::` ou pelo `CAST`. O fim do parâmetro é o `}` colado no `::`, e não o
 * primeiro `}` depois do `${`: o parâmetro pode ter chaves dentro
 * (`${JSON.stringify({ texto })}::jsonb`), e a primeira versão desta guarda, que
 * parava no primeiro `}`, deixava esse passar — visto reintroduzindo o defeito na
 * anotação, em 12/10/2026.
 */
const DIRETO = /\}\s*::\s*jsonb?\b|\bCAST\s*\(\s*\$\{[\s\S]*?\}\s+AS\s+jsonb?\b/i;

describe('JSON vai ao banco como texto', () => {
  it('controle: o padrão pega o parâmetro direto, e deixa passar o que vai pelo texto', () => {
    expect(DIRETO.test('VALUES (${JSON.stringify(e)}::jsonb)')).toBe(true);
    expect(DIRETO.test('VALUES (${bruto} :: json)')).toBe(true);
    expect(DIRETO.test('VALUES (${JSON.stringify({ texto: limpo })}::jsonb)')).toBe(true);
    expect(DIRETO.test('VALUES (CAST(${bruto} AS JSONB))')).toBe(true);
    expect(DIRETO.test('VALUES (${JSON.stringify(e)}::text::jsonb)')).toBe(false);
    expect(DIRETO.test('VALUES (${JSON.stringify({ texto: limpo })}::text::jsonb)')).toBe(false);
    expect(DIRETO.test('VALUES (to_jsonb(${bruto}::text))')).toBe(false);
    expect(DIRETO.test("VALUES ('{}'::jsonb, '{\"a\":1}'::jsonb)")).toBe(false);
  });

  it('nenhum arquivo de src/ manda parâmetro direto para jsonb', () => {
    const arquivos = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')].map((c) => c.split(sep).join('/'));
    expect(arquivos.length).toBeGreaterThan(50);
    const diretos = arquivos.filter((c) => DIRETO.test(semComentarios(readFileSync(c, 'utf8'))));
    expect(diretos).toEqual([]);
  });
});

describe.skipIf(!TEM_BANCO)('com banco, antes de o Drizzle tocar o pool', () => {
  // Este arquivo não importa nada que use o Drizzle: o pool do `sqlConn` nasce aqui
  // com o serializador do driver — o estado do processo logo depois de um deploy.
  let sqlConn: typeof import('../src/db/index.js').sqlConn;

  afterAll(async () => {
    if (!sqlConn) return;
    await sqlConn`DROP TABLE IF EXISTS prova_jsonb`.catch(() => {});
    await sqlConn.end({ timeout: 5 });
  });

  it('pelo texto, o objeto chega como objeto', async () => {
    ({ sqlConn } = await import('../src/db/index.js'));
    await sqlConn`DROP TABLE IF EXISTS prova_jsonb`;
    await sqlConn`CREATE TABLE prova_jsonb (n int, j jsonb)`;
    await sqlConn`INSERT INTO prova_jsonb VALUES (1, ${JSON.stringify({ statusAnterior: 'active' })}::text::jsonb)`;
    const [l] = await sqlConn`SELECT jsonb_typeof(j) AS tipo, j->>'statusAnterior' AS antes FROM prova_jsonb WHERE n = 1`;
    expect(l).toEqual({ tipo: 'object', antes: 'active' });
  });

  it('o defeito que a guarda evita: direto para jsonb, a mesma linha vira STRING', async () => {
    // Se este caso falhar um dia, o driver mudou: a guarda continua certa, e este
    // parágrafo é que precisa ser reescrito.
    await sqlConn`INSERT INTO prova_jsonb VALUES (2, ${JSON.stringify({ statusAnterior: 'active' })}::jsonb)`;
    const [l] = await sqlConn`SELECT jsonb_typeof(j) AS tipo, j->>'statusAnterior' AS antes FROM prova_jsonb WHERE n = 2`;
    expect(l).toEqual({ tipo: 'string', antes: null });
  });
});
