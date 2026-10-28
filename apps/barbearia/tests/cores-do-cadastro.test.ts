// As cores prontas do `/cadastrar` — `src/lib/coresDoCadastro.ts`.
//
// O cadastro grava a cor DERIVADA (`provisionarBarbearia`), e o medidor do painel
// só conta a que não é a padrão. Cor oferecida que o medidor não conta é o painel
// dizendo "falta a cor" a quem acabou de escolher uma.
import { describe, it, expect } from 'vitest';
import { CORES_DO_CADASTRO } from '../src/lib/coresDoCadastro';
import { derivarAccent, isHex, ACCENT_PADRAO } from '../src/lib/accent';
import { calcularCompletude, type EstadoDaBarbearia } from '../src/lib/completude';

const ESTADO: EstadoDaBarbearia = {
  logoPath: null, heroPath: null, tagline: null, aboutText: null,
  whatsappNumber: '5584999990000', addressStreet: 'R. A, 1', addressCity: 'Mossoró/RN',
  instagramUrl: null, googleRating: null, googleReviewCount: null, seoTitle: null, seoDescription: null,
  accentColor: null, horariosPublicados: 1, servicosAtivos: 1, barbeirosComAgenda: 1,
  fotosNaGaleria: 0,
};

const faltaACor = (accentColor: string) =>
  calcularCompletude({ ...ESTADO, accentColor }).pendencias.some((p) => p.id === 'cor');

describe('as cores prontas do cadastro', () => {
  it('são hex válidos e não se repetem', () => {
    const hexes = CORES_DO_CADASTRO.map((c) => c.hex.toLowerCase());
    for (const h of hexes) expect(isHex(h), h).toBe(true);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it('controle: a cor padrão, o medidor NÃO conta', () => {
    expect(faltaACor(ACCENT_PADRAO.color)).toBe(true);
  });

  it('o medidor conta cada uma como cor escolhida', () => {
    for (const c of CORES_DO_CADASTRO) {
      expect(faltaACor(derivarAccent(c.hex).color), c.nome).toBe(false);
    }
  });

  it('nenhuma precisa de ajuste para o texto branco do botão', () => {
    for (const c of CORES_DO_CADASTRO) {
      expect(derivarAccent(c.hex).color, c.nome).toBe(c.hex.toLowerCase());
    }
  });
});
