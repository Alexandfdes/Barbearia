// O prazo da conferência do site novo (decisão do dono em 10/11/2026, `docs/PENDENCIAS-ABERTAS.md`
// §2.70): o site espera a aprovação do operador, e quem se cadastra ouve que ele abre em até
// `PRAZO_DA_CONFERENCIA`. A promessa aparece em seis lugares de dois aplicativos — a landing, a tela
// de fim do cadastro, as boas-vindas, a faixa do painel, a tela de assinatura e o aviso ao operador.
// Estes casos seguram que todos dizem o mesmo, e que ninguém escreve o prazo à mão.
//
// Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { PRAZO_DA_CONFERENCIA } from '../src/lib/produto';

const prazoDoVendas = () =>
  readFileSync('../vendas/src/config.ts', 'utf8').match(/export const PRAZO_DA_CONFERENCIA = '([^']+)';/)?.[1];

const ONDE_SE_PROMETE = [
  'src/pages/cadastrar.astro',
  'src/pages/api/cadastrar.ts',
  'src/layouts/AdminLayout.astro',
  'src/pages/admin/assinatura.astro',
  'src/lib/avisoAoOperador.ts',
  '../vendas/src/pages/index.astro',
];

describe('o prazo da conferência', () => {
  it('é o mesmo na landing e no painel', () => {
    expect(PRAZO_DA_CONFERENCIA).toBe('1 dia útil');
    expect(prazoDoVendas()).toBe(PRAZO_DA_CONFERENCIA);
  });

  it('cada lugar que promete usa a constante, sempre depois de "em até"', () => {
    for (const arquivo of ONDE_SE_PROMETE) {
      expect(readFileSync(arquivo, 'utf8'), arquivo).toMatch(/em até \$?\{PRAZO_DA_CONFERENCIA\}/);
    }
  });

  it('ninguém escreve o prazo à mão — trocar o prazo é trocar as duas constantes', () => {
    const normal = (f: string) => f.replace(/\\/g, '/');
    const fontes = [
      ...globSync('src/**/*.ts'), ...globSync('src/**/*.astro'),
      ...globSync('../vendas/src/**/*.ts'), ...globSync('../vendas/src/**/*.astro'),
    ].map(normal).filter((f) => f !== 'src/lib/produto.ts' && f !== '../vendas/src/config.ts');
    // Controle: a busca enxerga os arquivos que prometem.
    expect(fontes).toEqual(expect.arrayContaining(['src/layouts/AdminLayout.astro', '../vendas/src/pages/index.astro']));
    const aMao = fontes.filter((f) => /dias? úte?is|dia útil/i.test(readFileSync(f, 'utf8')));
    expect(aMao).toEqual([]);
  });

  it('o e-mail de boas-vindas de quem espera diz o prazo', async () => {
    const { emailDeBoasVindas } = await import('../src/pages/api/cadastrar.ts');
    const { texto } = emailDeBoasVindas({
      painel: 'https://painel.fadeline.com.br', whatsapp: '(84) 99999-0000', ultimoDiaDoTeste: null,
      siteEmPreparacao: true, linkDeConfirmacao: 'https://painel.fadeline.com.br/confirmar/x',
    });
    expect(texto).toContain(`O seu site abre depois de uma conferência nossa, em até ${PRAZO_DA_CONFERENCIA}`);
  });
});
