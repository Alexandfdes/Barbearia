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

describe('o agendamento manual já vem com o barbeiro, como a venda (10/11/2026)', () => {
  // Achado no ensaio do roteiro: na barbearia de uma pessoa só, o campo vinha em "Selecione", e o
  // horário só aparecia depois de o dono escolher a si mesmo. A venda avulsa já vinha escolhida.
  const dia = soCodigo(readFileSync('src/pages/admin/dia/[date].astro', 'utf8'));
  const manual = dia.slice(dia.indexOf('<select id="m-barber"'), dia.indexOf('</select>', dia.indexOf('<select id="m-barber"')));

  it('um barbeiro só, ou a agenda filtrada por um: ele vem escolhido, e o "Selecione" some', () => {
    expect(dia).toMatch(/const barbeiroDoManual = allBarbers\.length === 1\s*\? allBarbers\[0\]\.id\s*: \(allBarbers\.find\(b => b\.id === filterBarberId\)\?\.id \?\? null\);/);
    expect(manual).toMatch(/\{barbeiroDoManual === null && <option value="">Selecione<\/option>\}/);
    expect(manual).toMatch(/selected=\{barbeiroDoManual === b\.id\}/);
  });

  it('o filtro de um barbeiro desligado não escolhe ninguém em silêncio: o "Selecione" volta', () => {
    // Com `?barber=` de quem saiu da lista dos ativos, nenhuma opção vem marcada; sem o "Selecione",
    // o navegador marcaria a primeira, e o horário iria para outro barbeiro sem ninguém ver.
    expect(manual).not.toMatch(/filterBarberId === null && <option/);
    expect(dia).not.toMatch(/const barbeiroDoManual = [^;]*\?\? filterBarberId/);
  });

  it('controle: a venda avulsa continua escolhendo o da agenda', () => {
    expect(dia).toMatch(/<select id="sale-barber"[\s\S]*?selected=\{filterBarberId === b\.id\}/);
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

describe('a projeção do mês, no relatório', () => {
  // A frase era montada em pedaços — `'supera' : 'fica abaixo d'` + `a meta` —, e o
  // ramo de quem bate a meta saía "(superaa meta)": visto num print do relatório em
  // 09/10/2026. Cada ramo agora é a frase inteira.
  const relatorio = soCodigo(readFileSync('src/pages/admin/relatorios.astro', 'utf8'));

  it('as duas frases saem inteiras', () => {
    expect(relatorio).toMatch(/'supera a meta'/);
    expect(relatorio).toMatch(/'fica abaixo da meta'/);
  });

  it('nenhum pedaço de frase colado depois da expressão', () => {
    expect(relatorio).not.toMatch(/'supera'\s*:/);
    expect(relatorio).not.toMatch(/\}a meta\)/);
  });
});
