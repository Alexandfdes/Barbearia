// O medidor de completude (`PENDENCIAS-ABERTAS.md` §4.4).
//
// Função pura: não precisa de banco nem de tela. É a regra que precisa de
// teste — o HTML só a desenha.
import { describe, it, expect } from 'vitest';
import { calcularCompletude, type EstadoDaBarbearia } from '../src/lib/completude.js';

/** Barbearia recém-provisionada: existe, mas não faz nada ainda. */
const RECEM_CRIADA: EstadoDaBarbearia = {
  logoPath: null, heroPath: null, tagline: null, aboutText: null,
  whatsappNumber: '84999990000',        // o provisionar já grava
  addressStreet: 'Rua das Flores, 42',  // idem
  addressCity: 'Mossoró/RN',            // idem
  instagramUrl: null, googleReviewsUrl: null,
  seoTitle: null, seoDescription: null,
  accentColor: '#0f766e',               // o padrão do template
  horariosPublicados: 3,                // o provisionar grava o comercial
  servicosAtivos: 0,                    // ⚠️ o dono ainda não cadastrou
  barbeirosComAgenda: 1,                // o dono, criado pelo provisionar
};

const COMPLETA: EstadoDaBarbearia = {
  logoPath: '/api/media/logo/a.png', heroPath: '/api/media/hero/b.jpg',
  tagline: 'Estilo com respeito.', aboutText: 'Barbearia desde 2010.',
  whatsappNumber: '84999990000',
  addressStreet: 'Rua das Flores, 42', addressCity: 'Mossoró/RN',
  instagramUrl: 'https://instagram.com/x', googleReviewsUrl: 'https://g.page/x',
  seoTitle: 'Barbearia X', seoDescription: 'A melhor de Mossoró',
  accentColor: '#7c3aed',
  horariosPublicados: 3, servicosAtivos: 5, barbeirosComAgenda: 2,
};

describe('o que impede de FUNCIONAR', () => {
  it('sem serviço, o bloqueio aparece — é o que trava o agendamento', () => {
    const r = calcularCompletude(RECEM_CRIADA);
    expect(r.bloqueios.map((b) => b.id)).toContain('servicos');
  });

  it('sem barbeiro com expediente, a agenda não tem vaga', () => {
    const r = calcularCompletude({ ...COMPLETA, barbeirosComAgenda: 0 });
    expect(r.bloqueios.map((b) => b.id)).toEqual(['agenda']);
  });

  it('sem WhatsApp e sem endereço, os dois bloqueiam', () => {
    const r = calcularCompletude({
      ...COMPLETA, whatsappNumber: null, addressStreet: '  ', addressCity: null,
    });
    expect(r.bloqueios.map((b) => b.id).sort()).toEqual(['endereco', 'whatsapp']);
  });

  it('campo com só espaços conta como vazio', () => {
    const r = calcularCompletude({ ...COMPLETA, whatsappNumber: '   ' });
    expect(r.bloqueios.map((b) => b.id)).toContain('whatsapp');
  });

  it('barbearia completa não tem bloqueio nenhum', () => {
    expect(calcularCompletude(COMPLETA).bloqueios).toEqual([]);
  });
});

describe('o que falta para ficar APRESENTÁVEL', () => {
  it('a barbearia completa chega a 100% e o card pode sumir', () => {
    const r = calcularCompletude(COMPLETA);
    expect(r.percentual).toBe(100);
    expect(r.completo).toBe(true);
  });

  it('⚠️ percentual alto NÃO significa que funciona', () => {
    // O caso que motivou separar as duas listas: tudo preenchido, menos o
    // catálogo. Dizer "quase pronto" aqui esconderia que ninguém consegue
    // agendar.
    const r = calcularCompletude({ ...COMPLETA, servicosAtivos: 0 });
    expect(r.percentual).toBe(100);
    expect(r.completo).toBe(false);
    expect(r.bloqueios.length).toBeGreaterThan(0);
  });

  it('a cor padrão do template não conta como escolhida', () => {
    const r = calcularCompletude({ ...COMPLETA, accentColor: '#0f766e' });
    expect(r.pendencias.map((p) => p.id)).toContain('cor');
  });

  it('as pendências vêm da mais pesada para a mais leve', () => {
    const r = calcularCompletude(RECEM_CRIADA);
    const pesos = r.pendencias.map((p) => p.peso);
    expect(pesos).toEqual([...pesos].sort((a, b) => b - a));
    expect(r.pendencias[0].id).toBe('logo'); // peso 20
  });

  it('SEO só conta completo com título E descrição', () => {
    const r = calcularCompletude({ ...COMPLETA, seoDescription: null });
    expect(r.pendencias.map((p) => p.id)).toContain('seo');
  });

  it('a barbearia recém-criada não fica em 0% — ela já tem algo', () => {
    // 0% desanima; o provisionar já preencheu horário, WhatsApp e endereço.
    const r = calcularCompletude(RECEM_CRIADA);
    expect(r.percentual).toBeGreaterThan(0);
    expect(r.percentual).toBeLessThan(50);
  });

  it('cada pendência diz PARA ONDE ir — senão o dono liga perguntando', () => {
    const r = calcularCompletude(RECEM_CRIADA);
    for (const item of [...r.bloqueios, ...r.pendencias]) {
      expect(item.href).toMatch(/^\/admin\//);
      expect(item.porque.length).toBeGreaterThan(20);
    }
  });

  it('nenhum texto expõe nome de coluna do banco', () => {
    // O dono não sabe o que é `about_text`. Se souber, é porque a mensagem está
    // escrita para o programador, não para ele.
    const r = calcularCompletude(RECEM_CRIADA);
    const texto = [...r.bloqueios, ...r.pendencias].map((i) => i.titulo + i.porque).join(' ');
    for (const coluna of ['about_text', 'logo_path', 'hero_path', 'accent_color',
                          'seo_title', 'whatsapp_number', 'business_hours']) {
      expect(texto).not.toContain(coluna);
    }
  });
});
