// O nome do produto aparece nos dois aplicativos: no site de vendas, pelo
// `NOME_PRODUTO` de `apps/vendas/src/config.ts`, e aqui (login do painel e
// cadastro), pelo de `src/lib/produto.ts`.
//
// Em 08/10/2026 o nome trocou de "Barbearia no Ar" para "Fadeline", provisório
// até o cadastro abrir (`docs/PENDENCIAS-ABERTAS.md` §0.1). Antes, o app da
// barbearia escrevia o nome à mão em quatro lugares, e trocar era uma busca.
// Esta guarda garante que a próxima troca seja mudar duas constantes.
import { describe, it, expect } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { NOME_PRODUTO } from '../src/lib/produto';

const NOME_ANTIGO = 'Barbearia no Ar';
const CONSTANTES = ['src/lib/produto.ts', '../vendas/src/config.ts'];

const nomeDoVendas = () =>
  readFileSync('../vendas/src/config.ts', 'utf8').match(/export const NOME_PRODUTO = '([^']+)'/)?.[1];

/** O texto escreve o nome do produto à mão: o de agora ou o antigo. */
const cravaONome = (texto: string) => texto.includes(NOME_PRODUTO) || texto.includes(NOME_ANTIGO);

describe('o nome do produto', () => {
  it('é o mesmo nos dois aplicativos', () => {
    expect(nomeDoVendas()).toBe(NOME_PRODUTO);
  });

  it('controle: a guarda pega o nome escrito à mão, o novo e o antigo', () => {
    expect(cravaONome(`<title>Entrar — ${NOME_PRODUTO}</title>`)).toBe(true);
    expect(cravaONome('<title>Entrar — Barbearia no Ar</title>')).toBe(true);
    expect(cravaONome('<title>Entrar — {NOME_PRODUTO}</title>')).toBe(false);
    expect(cravaONome('No fim o site já está no ar com os seus serviços.')).toBe(false);
  });

  it('nenhuma tela dos dois aplicativos escreve o nome à mão — só as duas constantes', () => {
    const arquivos = [
      ...globSync('src/**/*.ts'), ...globSync('src/**/*.astro'),
      ...globSync('../vendas/src/**/*.ts'), ...globSync('../vendas/src/**/*.astro'),
    ].map((c) => c.split(sep).join('/'));
    expect(arquivos.length).toBeGreaterThan(80);
    const achados = arquivos
      .filter((c) => !CONSTANTES.includes(c))
      .filter((c) => cravaONome(readFileSync(c, 'utf8')));
    expect(achados).toEqual([]);
  });
});
