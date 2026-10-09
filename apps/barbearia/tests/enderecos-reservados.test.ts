// Endereços que nenhuma barbearia pode pegar — `src/lib/enderecosReservados.ts`,
// `docs/PENDENCIAS-ABERTAS.md` §4.16.
//
// O primeiro rótulo de qualquer endereço vira slug. Até 08/10/2026, o primeiro a
// se cadastrar como `painel` passava a ser servido na raiz de `painel.<domínio>`
// — o endereço que todo dono digita para entrar.
import { describe, it, expect } from 'vitest';
import type postgres from 'postgres';
import { ENDERECOS_RESERVADOS, enderecoReservado, rotuloDoNome } from '../src/lib/enderecosReservados';
import { NOME_PRODUTO } from '../src/lib/produto';
import { provisionarBarbearia } from '../src/lib/provisionarBarbearia';

const semBanco = (() => { throw new Error('tocou o banco'); }) as unknown as postgres.Sql;

const BASE = {
  slug: 'x', nome: 'Barbearia Teste', dono: 'José', telefone: '84 99999-0000',
  endereco: 'R. A, 1', cidade: 'Mossoró/RN', senha: 'segredo123', email: 'ze@exemplo.com.br',
};

describe('os endereços reservados', () => {
  it('as portas do produto estão na lista', () => {
    for (const s of ['painel', 'admin', 'www', 'api', 'app', 'mail']) {
      expect(enderecoReservado(s), s).toBe(true);
    }
  });

  it('o nome do produto também — o de agora, sem cravar, e o de antes', () => {
    expect(ENDERECOS_RESERVADOS.has(rotuloDoNome(NOME_PRODUTO))).toBe(true);
    expect(enderecoReservado('barbearianoar')).toBe(true);
  });

  it('não confunde barbearia de verdade', () => {
    for (const s of ['cortes-do-ze', 'painel-do-ze', 'barbearia-admin', 'demo']) {
      expect(enderecoReservado(s), s).toBe(false);
    }
  });

  it('o cadastro RECUSA o reservado no campo do endereço — antes de tocar o banco', async () => {
    for (const s of ['painel', 'PAINEL', 'www']) {
      const r = await provisionarBarbearia(semBanco, { ...BASE, slug: s });
      expect(r.ok, s).toBe(false);
      if (!r.ok) {
        expect(r.campo).toBe('slug');
        expect(r.erro).toMatch(/reservado/);
      }
    }
  });
});
