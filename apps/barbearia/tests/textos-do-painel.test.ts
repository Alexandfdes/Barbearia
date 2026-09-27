// Textos que diziam uma coisa enquanto o sistema fazia outra.
//
// Achados em 27/09/2026, no primeiro teste de ponta a ponta com o dono no lugar do
// barbeiro. Nenhum quebra nada — todos fazem o dono ou o cliente acreditar em algo
// falso, e é assim que um produto parece mal-acabado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Comentário não conta: o que explica um defeito costuma citar o texto errado.
const soCodigo = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

describe('o painel não diz que a frase do topo é ignorada', () => {
  const hero = readFileSync('src/components/Hero.astro', 'utf8');
  const configuracoes = readFileSync('src/pages/admin/configuracoes.astro', 'utf8');

  it('controle: o topo do site lê a frase e o texto de baixo', () => {
    // Se um dia o topo parar de ler, o aviso do painel volta a poder dizer isso.
    expect(hero).toMatch(/s\.tagline/);
    expect(hero).toMatch(/s\.heroSubtitle/);
  });

  it('os avisos dos dois campos não dizem que eles não são usados', () => {
    const campos = soCodigo(configuracoes).split('\n')
      .filter((l) => /id: '(tagline|heroSubtitle)'/.test(l));
    expect(campos).toHaveLength(2);
    for (const campo of campos) {
      expect(campo).not.toMatch(/uso futuro|não lê|ainda não usado|não usado/i);
    }
  });

  it('o campo tem o mesmo nome que o medidor do painel cobra', () => {
    // O medidor pede "Escreva a frase do topo" (`lib/completude.ts`).
    expect(configuracoes).toMatch(/id: 'tagline', label: 'Frase do topo'/);
  });
});

describe('o rodapé do site', () => {
  const rodape = readFileSync('src/components/Footer.astro', 'utf8');

  it('não tem link que não leva a lugar nenhum', () => {
    expect(soCodigo(rodape)).not.toMatch(/href="#"/);
  });

  it('o slogan do Bayron só aparece no site do Bayron', () => {
    expect(rodape).toMatch(/\{BAYRON && \(\s*<p[^>]*>\s*Respeito e precisão em cada detalhe\./);
  });
});

describe('a agenda do dia concorda o plural', () => {
  const agenda = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');

  it('"1 agendamento considerado", não "considerados"', () => {
    expect(agenda).not.toMatch(/'agendamento' : 'agendamentos'\} considerados/);
    expect(agenda).not.toMatch(/'agendamento' : 'agendamentos'\}\s*considerados/);
    expect((agenda.match(/'agendamento considerado' : 'agendamentos considerados'/g) ?? []).length).toBe(2);
  });
});
