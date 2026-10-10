// O que o roteiro de 10/10/2026 achou USANDO o produto: o dono abrindo cada tela
// na máquina dele, com uma barbearia nascida pelo cadastro. Nenhum destes
// aparecia na suíte — e o guarda que já existia para o rodapé ("não tem link que
// não leva a lugar nenhum") procurava só `href="#"`, não o link que fica vazio
// porque o dado nunca foi preenchido.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { buscaDoMapa, linkDaRota, linkDoMapa } from '../src/lib/mapa';

// Comentário não conta: o que explica um defeito costuma citar a forma errada.
const soCodigo = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const semNada = { mapsUrl: '', mapsEmbedQuery: '', addressStreet: '', addressCity: '' };
const doCadastro = { ...semNada, addressStreet: 'Av. Rio Branco, 100', addressCity: 'Natal/RN' };
const busca = 'Av. Rio Branco, 100, Natal/RN';

describe('o mapa e a rota da barbearia (`lib/mapa.ts`)', () => {
  it('sem o link do dono — toda barbearia nascida pelo cadastro —, a rota e o mapa saem do endereço', () => {
    expect(buscaDoMapa(doCadastro)).toBe(busca);
    expect(linkDaRota(doCadastro)).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(busca)}`);
    expect(linkDoMapa(doCadastro)).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`);
  });

  it('a busca configurada vale para o mapa da página e para a rota: os dois não podem discordar', () => {
    const s = { ...doCadastro, mapsEmbedQuery: 'Barbearia do Zé, Natal' };
    expect(buscaDoMapa(s)).toBe('Barbearia do Zé, Natal');
    expect(linkDaRota(s)).toContain(encodeURIComponent('Barbearia do Zé, Natal'));
    expect(linkDoMapa(s)).toContain(encodeURIComponent('Barbearia do Zé, Natal'));
  });

  it('o link que o dono cadastrou vale para tudo — é o lugar que ele escolheu', () => {
    const s = { ...doCadastro, mapsUrl: ' https://maps.app.goo.gl/abc ' };
    expect(linkDaRota(s)).toBe('https://maps.app.goo.gl/abc');
    expect(linkDoMapa(s)).toBe('https://maps.app.goo.gl/abc');
  });

  it('sem nada para buscar: null, e o botão some — nunca um link vazio', () => {
    expect(buscaDoMapa(semNada)).toBe('');
    expect(linkDaRota(semNada)).toBeNull();
    expect(linkDoMapa({ ...semNada, addressStreet: '   ', addressCity: '' })).toBeNull();
  });

  it('nenhuma tela usa o link do mapa direto — o vazio voltaria a abrir o próprio site', () => {
    const DIRETO = /href=\{s\.mapsUrl\}/;
    // Controle: o padrão pega a forma de antes, que existia em três telas.
    expect(DIRETO.test('<a href={s.mapsUrl} target="_blank">')).toBe(true);
    const telas = globSync('src/**/*.astro');
    expect(telas.length).toBeGreaterThan(20);
    expect(telas.filter((t) => DIRETO.test(soCodigo(readFileSync(t, 'utf8'))))).toEqual([]);
    for (const t of ['src/components/Location.astro', 'src/components/Footer.astro', 'src/pages/a/[token].astro']) {
      expect(readFileSync(t, 'utf8')).toMatch(/from '(\.\.\/)+lib\/mapa'/);
    }
  });

  it('Configurações diz que os dois campos do mapa são opcionais, e o que cada um decide', () => {
    const cfg = soCodigo(readFileSync('src/pages/admin/configuracoes.astro', 'utf8'));
    expect(cfg).toMatch(/id: 'mapsUrl',[^\n]*hint: 'Opcional\. Em branco, o site monta a rota pelo endereço\./);
    expect(cfg).toMatch(/id: 'mapsEmbedQuery',[^\n]*e a rota também, se o link acima estiver em branco/);
  });

  it('o mapa da página busca o mesmo texto que a rota', () => {
    const local = soCodigo(readFileSync('src/components/Location.astro', 'utf8'));
    expect(local).toMatch(/const queryMapa = buscaDoMapa\(s\);/);
    expect(local).toMatch(/\{rota && \(\s*<a\s+href=\{rota\}/);
  });
});

describe('o rodapé não mostra o que a barbearia não preencheu', () => {
  const rodape = soCodigo(readFileSync('src/components/Footer.astro', 'utf8'));

  it('o Instagram só aparece com Instagram cadastrado — vazio, ele abria o próprio site', () => {
    expect(rodape).toMatch(/\{instagram && \(\s*<a\s+href=\{instagram\}/);
    expect(rodape).not.toMatch(/href=\{s\.instagramUrl\}/);
  });

  it('o texto sobre só aparece com texto — vazio, sobrava um buraco', () => {
    expect(rodape).toMatch(/\{sobre && \(\s*<p[^>]*>\s*\{sobre\}/);
  });

  it('o endereço só vira link com mapa; sem, é texto', () => {
    expect(rodape).toMatch(/\{mapa \? \(\s*<a\s+href=\{mapa\}/);
  });

  it('e o medidor do painel não promete mais o buraco', () => {
    expect(readFileSync('src/lib/completude.ts', 'utf8')).not.toMatch(/buraco/);
  });
});

describe('textos e menus que diziam o que não é', () => {
  it('a tela de assinatura sem a Asaas não fala de uma "próxima etapa" que já foi feita', () => {
    const tela = readFileSync('src/pages/admin/assinatura.astro', 'utf8');
    expect(tela).toMatch(/Ainda não dá para pagar por aqui/); // controle: o aviso existe
    expect(soCodigo(tela)).not.toMatch(/próxima etapa/);
  });

  it('"Início" é o resumo; "Agenda do dia" leva à agenda de hoje, no dia da barbearia', () => {
    const menu = soCodigo(readFileSync('src/layouts/AdminLayout.astro', 'utf8'));
    expect(menu).toMatch(/href: '\/admin',\s+label: 'Início',\s+ativo: norm === '\/admin',/);
    expect(menu).toMatch(/href: `\/admin\/dia\/\$\{hoje\}`, label: 'Agenda do dia'/);
    expect(menu).toMatch(/const hoje = formatInTimeZone\(new Date\(\), TZ, 'yyyy-MM-dd'\)/);
  });

  it('as reservas do menu dizem que são de produto — o site chama o agendamento de "Reservar horário"', () => {
    const menu = soCodigo(readFileSync('src/layouts/AdminLayout.astro', 'utf8'));
    expect(menu).toMatch(/href: '\/admin\/reservas', label: 'Reservas de produto'/);
  });

  it('o cadastro avisa dos dias grátis e do cartão ANTES de ele enviar', () => {
    const cadastro = readFileSync('src/pages/cadastrar.astro', 'utf8');
    const marcacao = cadastro.slice(0, cadastro.indexOf('<script>'));
    expect(marcacao).toMatch(/\{DIAS_DE_TESTE\} dias grátis, sem cartão: ele só é pedido no fim do teste\./);
    expect(cadastro).toMatch(/import \{ DIAS_DE_TESTE \} from '\.\.\/lib\/situacao\.js';/);
  });
});
