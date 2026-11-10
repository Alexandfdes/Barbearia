// O aviso ao operador de cada cadastro novo pela web (`src/lib/avisoAoOperador.ts`, 10/11/2026).
//
// O site novo espera a aprovação, e o dono ouve que ele abre em até `PRAZO_DA_CONFERENCIA`. Até
// aqui, o operador só sabia do site que espera quando abria o painel. Estes casos seguram: para
// quem vai (`OPERADOR_EMAIL`, conferido), o que leva — o endereço escolhido e a ficha, nada do que
// a pessoa digitou —, a parte própria do orçamento, e que o aviso nunca derruba o cadastro.
//
// O cadastro de ponta a ponta, com o e-mail que sai de verdade, está no `tests/cadastro.test.ts`.
// Não precisa de banco.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  avisarOperadorDoCadastro, avisoDeCadastroNoPainel, emailDoOperador, fichaNoPainel, textoDoAvisoDeCadastro,
} from '../src/lib/avisoAoOperador';
import { PRAZO_DA_CONFERENCIA } from '../src/lib/produto';
import type { Email } from '../src/lib/email';

const PAINEL = { PAINEL_URL: 'https://painel.fadeline.com.br' };

describe('para quem vai', () => {
  it('OPERADOR_EMAIL, conferido e normalizado — sem ele, ou fora da forma, para ninguém', () => {
    expect(emailDoOperador({})).toBeNull();
    for (const v of ['', '   ', 'operador', 'operador@gmail', 'a b@x.com']) expect(emailDoOperador({ OPERADOR_EMAIL: v }), v).toBeNull();
    expect(emailDoOperador({ OPERADOR_EMAIL: ' Operador@Exemplo.com.br ' })).toBe('operador@exemplo.com.br');
  });

  it('a tela de Sistema mostra o endereço mascarado — ou que não vai a ninguém', () => {
    expect(avisoDeCadastroNoPainel({ OPERADOR_EMAIL: 'operador@exemplo.com.br' })).toBe('o***@exemplo.com.br');
    expect(avisoDeCadastroNoPainel({})).toBeNull();
    const tela = readFileSync('src/pages/operador/sistema.astro', 'utf8');
    expect(tela).toMatch(/valor: s\.email\.avisoDeCadastro \?\? 'ninguém — falta o OPERADOR_EMAIL'/);
    // Com o cadastro aberto e sem a variável, é problema: o site espera, e ninguém sabe.
    expect(tela).toMatch(/estado: s\.email\.avisoDeCadastro \? 'ok' : s\.cadastro\.aberto \? 'problema' : 'neutro'/);
  });
});

describe('o que leva', () => {
  it('a ficha do painel do operador — e, sem endereço do painel, o caminho por extenso', () => {
    expect(fichaNoPainel(42, PAINEL)).toBe('https://painel.fadeline.com.br/operador/barbearias/42');
    expect(fichaNoPainel(42, { NODE_ENV: 'production' })).toBe('');
    expect(textoDoAvisoDeCadastro({ slug: 'cortes', ficha: '', emPreparacao: true }).texto)
      .toContain('Abra o painel do operador, em Barbearias.');
  });

  it('o site que espera: assunto fixo, o endereço escolhido, a ficha e o prazo prometido ao dono', () => {
    const { assunto, texto } = textoDoAvisoDeCadastro({
      slug: 'regularize-pix', ficha: 'https://painel.fadeline.com.br/operador/barbearias/7', emPreparacao: true,
    });
    expect(assunto).toBe('Site novo esperando a sua aprovação');
    expect(texto).toContain('O endereço escolhido: regularize-pix\n');
    expect(texto).toContain('https://painel.fadeline.com.br/operador/barbearias/7');
    expect(texto).toContain(`em até ${PRAZO_DA_CONFERENCIA}`);
    // O endereço vai sem o domínio: com ele, o leitor de e-mail o transforma em link.
    expect(texto).not.toMatch(/regularize-pix\./);
  });

  it('sem a aprovação (SITE_SEM_APROVACAO=1): o site já está no ar, e o aviso diz isso', () => {
    const { assunto, texto } = textoDoAvisoDeCadastro({ slug: 'cortes', ficha: 'https://p/operador/barbearias/1', emPreparacao: false });
    expect(assunto).toBe('Cadastro novo — o site já está no ar');
    expect(texto).toMatch(/já está no ar/);
    expect(texto).not.toMatch(/espera a sua aprovação/);
  });

  it('a rota passa só o que o sistema montou: o número da barbearia, o endereço e se o site espera', () => {
    // Nome, dono, telefone e e-mail são do formulário — nenhum entra na chamada.
    const rota = readFileSync('src/pages/api/cadastrar.ts', 'utf8');
    expect(rota).toMatch(/avisarOperadorDoCadastro\(\{ tenantId: r\.tenantId, slug: r\.slug, emPreparacao: r\.siteEmPreparacao \}\);/);
    // E ela vem depois de a barbearia existir: antes da resposta, depois das boas-vindas.
    expect(rota.indexOf('avisarOperadorDoCadastro({')).toBeGreaterThan(rota.indexOf('await pedirConfirmacao({'));
    expect(rota.indexOf('avisarOperadorDoCadastro({')).toBeLessThan(rota.indexOf("status: 201,"));
  });
});

describe('o envio', () => {
  const p = { tenantId: 9, slug: 'cortes', emPreparacao: true };

  it('sem OPERADOR_EMAIL, não chama ninguém', () => {
    const enviar = vi.fn(async () => {});
    expect(avisarOperadorDoCadastro({ ...p, env: {}, enviar })).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('com ele: um e-mail, da parte do operador, contado na barbearia nova', () => {
    const enviados: Email[] = [];
    const enviar = vi.fn(async (e: Email) => { enviados.push(e); });
    expect(avisarOperadorDoCadastro({ ...p, env: { ...PAINEL, OPERADOR_EMAIL: 'Operador@Exemplo.com.br' }, enviar })).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ para: 'operador@exemplo.com.br', tipo: 'operador', barbearia: 9, assunto: 'Site novo esperando a sua aprovação' });
    expect(enviados[0].texto).toContain('https://painel.fadeline.com.br/operador/barbearias/9');
  });

  it('o provedor que recusa — ou o envio que estoura na hora — não derruba o cadastro', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = { ...PAINEL, OPERADOR_EMAIL: 'operador@exemplo.com.br' };
    expect(avisarOperadorDoCadastro({ ...p, env, enviar: async () => { throw new Error('provedor fora do ar'); } })).toBe(true);
    await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/aviso ao operador do cadastro 9 não saiu/), 'provedor fora do ar'));
    expect(avisarOperadorDoCadastro({ ...p, env, enviar: () => { throw new Error('estourou'); } })).toBe(false);
    aviso.mockRestore();
  });
});
