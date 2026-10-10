// O WhatsApp DA LOJA — o número para onde vão todos os botões do site.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// O cadastro gravava o número sem o 55 ("84996658951"), e o site montava
// `wa.me/84996658951`. O wa.me lê o começo do número como código do país: o botão
// abria "Conversar com +84 99 665 89 51", um número do Vietnã. Visto ao vivo em
// 27/09/2026, no primeiro teste de ponta a ponta, e valia para toda barbearia
// criada pelo cadastro: o botão flutuante, o do contato, o do rodapé e o da
// confirmação do agendamento.
//
// E o teste do cadastro EXIGIA o número sem o 55 — a suíte ficava verde com o
// defeito dentro. O formato gravado é conferido em `tests/cadastro.test.ts`; aqui
// fica a leitura, que precisa aguentar os números que já estão no banco sem o 55.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { numeroDaLojaInternacional, waUrl } from '../src/lib/settings.js';
import { formatarTelefone } from '../src/lib/phone.js';

const loja = (whatsappNumber: string) => ({ whatsappNumber }) as Parameters<typeof waUrl>[1];

describe('o número da loja sai com o código do país', () => {
  it('completa o 55 do celular gravado sem ele — o caso do cadastro', () => {
    expect(numeroDaLojaInternacional(loja('84996658951'))).toBe('5584996658951');
    expect(waUrl(undefined, loja('84996658951'))).toBe('https://wa.me/5584996658951');
  });

  it('completa o 55 do fixo, de 10 dígitos', () => {
    expect(numeroDaLojaInternacional(loja('8433334444'))).toBe('558433334444');
  });

  it('não duplica o 55 de quem já tem', () => {
    expect(numeroDaLojaInternacional(loja('5584996658951'))).toBe('5584996658951');
  });

  it('número que não passa na regra brasileira fica como está — o botão não some', () => {
    expect(numeroDaLojaInternacional(loja('15551547238'))).toBe('15551547238');
  });

  it('sem número, sem link', () => {
    expect(numeroDaLojaInternacional(loja(''))).toBe('');
    expect(waUrl('oi', loja(''))).toBe('');
  });

  it('a mensagem continua indo url-encoded', () => {
    expect(waUrl('Olá, quero agendar', loja('84996658951'))).toBe(
      'https://wa.me/5584996658951?text=Ol%C3%A1%2C%20quero%20agendar',
    );
  });
});

describe('o telefone que aparece escrito no site', () => {
  it('celular', () => expect(formatarTelefone('84996658951')).toBe('(84) 99665-8951'));
  it('fixo', () => expect(formatarTelefone('8433334444')).toBe('(84) 3333-4444'));
  it('com DDI e máscara', () => expect(formatarTelefone('+55 84 99665-8951')).toBe('(84) 99665-8951'));
  it('o que não normaliza volta como veio', () => expect(formatarTelefone(' 123 ')).toBe('123'));
});

describe('o schema.org usa o mesmo número dos botões', () => {
  // O Google lê o `telephone` para montar o cartão da barbearia na busca. Com o
  // número cru, saía "+84996658951".
  const layout = readFileSync('src/layouts/Layout.astro', 'utf8');

  it('o bloco existe — controle: sem ele, o caso de baixo passaria à toa', () => {
    expect(layout).toMatch(/"telephone":/);
  });

  it('não monta o telefone com o número cru do banco', () => {
    expect(layout).not.toMatch(/"telephone":\s*`\+\$\{s\.whatsappNumber\}`/);
    expect(layout).toMatch(/"telephone":[^\n]*numeroDaLojaInternacional\(s\)/);
  });
});
