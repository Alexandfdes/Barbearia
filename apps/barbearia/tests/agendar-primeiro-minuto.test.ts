// O primeiro minuto do cliente da barbearia no `/agendar` — o que a correção de
// 09/10/2026 não deixa voltar.
//
// ── OS DEFEITOS ──────────────────────────────────────────────────────────────
//
// - Barbearia sem serviço (`PENDENCIAS-ABERTAS.md` §4.9): a tela dizia "Escolha
//   o serviço — Passo 1 de 4" e mais nada. Toda barbearia nasce sem serviço, e o
//   botão "Reservar horário" do site levava a uma página em branco, sem saída.
// - Um barbeiro só (§2.2): o cliente passava por uma tela com um botão, e o
//   contador dizia "de 4" quando eram 3. É o caso de toda barbearia criada pelo
//   cadastro, que nasce com o dono e mais ninguém.
// - O resumo do combo (§2.24) dizia "Combo Boris" — o combo do Bayron — em toda
//   barbearia, e o nome do produto entrava cru no `innerHTML`.
// - O calendário do combo (§2.16, a metade da tela) abria todos os dias.
//
// A regra mora em `lib/agendamento.ts`, `lib/combo.ts` e `lib/html.ts`, testada
// aqui como função. O script da página não roda no vitest — não há navegador —,
// então a outra metade lê o fonte: a página usa a regra, e não a reescreve. O que
// aparece na tela foi conferido num navegador, contra o build, em 09/10/2026.
//
// Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { passosDoAgendamento, rotuloDoPasso } from '../src/lib/agendamento';
import { comboValeNaData, diasDoCombo } from '../src/lib/combo';
import { escaparHtml } from '../src/lib/html';

const umBarbeiro = { barbers: [{ id: 1 }] };
const doisBarbeiros = { barbers: [{ id: 1 }, { id: 2 }] };

describe('os passos do agendamento', () => {
  it('barbearia de um barbeiro só: três passos, sem o do barbeiro', () => {
    const passos = passosDoAgendamento([umBarbeiro, umBarbeiro], null);
    expect(passos).toEqual(['servico', 'horario', 'dados']);
    expect(rotuloDoPasso('servico', passos)).toBe('Passo 1 de 3');
    expect(rotuloDoPasso('dados', passos)).toBe('Passo 3 de 3');
  });

  it('com barbeiro para escolher: quatro', () => {
    const passos = passosDoAgendamento([umBarbeiro, doisBarbeiros], null);
    expect(passos).toEqual(['servico', 'barbeiro', 'horario', 'dados']);
    expect(rotuloDoPasso('dados', passos)).toBe('Passo 4 de 4');
  });

  it('o serviço escolhido decide: com um barbeiro só, o passo some mesmo havendo dois na barbearia', () => {
    expect(passosDoAgendamento([umBarbeiro, doisBarbeiros], umBarbeiro)).toEqual(['servico', 'horario', 'dados']);
    expect(passosDoAgendamento([umBarbeiro, doisBarbeiros], doisBarbeiros)).toContain('barbeiro');
  });
});

describe('o combo vale nos dias que o dono marcou', () => {
  // 11/10/2026 é domingo; 12, segunda; 13, terça.
  const SEGUNDA = 1 << 1;

  it('combo de segunda vale na segunda, e não na terça nem no domingo', () => {
    expect(comboValeNaData(SEGUNDA, '2026-10-12')).toBe(true);
    expect(comboValeNaData(SEGUNDA, '2026-10-13')).toBe(false);
    expect(comboValeNaData(SEGUNDA, '2026-10-11')).toBe(false);
  });

  it('o bit 0 é o domingo, como no painel', () => {
    expect(comboValeNaData(1, '2026-10-11')).toBe(true);
    expect(comboValeNaData(1, '2026-10-12')).toBe(false);
  });

  it('127 vale todo dia; 0, nenhum', () => {
    const semana = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
    expect(semana.every((d) => comboValeNaData(127, d))).toBe(true);
    expect(semana.some((d) => comboValeNaData(0, d))).toBe(false);
  });

  it('os dias por extenso, para o cliente', () => {
    expect(diasDoCombo(SEGUNDA)).toBe('segunda');
    expect(diasDoCombo(SEGUNDA | (1 << 3))).toBe('segunda e quarta');
    expect(diasDoCombo(SEGUNDA | (1 << 3) | (1 << 6))).toBe('segunda, quarta e sábado');
    expect(diasDoCombo(1)).toBe('domingo');
    expect(diasDoCombo(127)).toBe('todos os dias');
    expect(diasDoCombo(0)).toBe('');
  });
});

describe('escaparHtml', () => {
  it('o nome com HTML vira texto', () => {
    expect(escaparHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('o & e as aspas, que quebram atributo', () => {
    expect(escaparHtml('Corte & Barba "VIP"')).toBe('Corte &amp; Barba &quot;VIP&quot;');
    expect(escaparHtml("Pomada D'Ávila")).toBe('Pomada D&#39;Ávila');
  });

  it('nulo vira vazio, não "null"', () => {
    expect(escaparHtml(null)).toBe('');
    expect(escaparHtml(undefined)).toBe('');
  });
});

// ── A página ─────────────────────────────────────────────────────────────────

const PAGINA = readFileSync('src/pages/agendar.astro', 'utf8');
const SCRIPT = codigo(PAGINA.slice(PAGINA.lastIndexOf('<script>')));

/** O código sem os comentários — é neles que o defeito antigo fica registrado. */
function codigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

/**
 * Nome que vem do painel — serviço, barbeiro, produto, combo — ou mensagem de
 * erro, sem `esc(` logo antes. O único uso que não vai para HTML é montar o
 * objeto do produto (`name: comboData.productName`).
 */
function nomesSemEscape(fonte: string): string[] {
  const NOME = /[\w$]+(?:[!?]?\.[\w$]+)*?[!?]?\.(?:name|productName|serviceName|barberName|message)\b/g;
  return [...fonte.matchAll(NOME)]
    .filter((m) => {
      const antes = fonte.slice(0, m.index);
      return !/esc\(\s*$/.test(antes) && !/\bname:\s*$/.test(antes);
    })
    .map((m) => m[0]);
}

describe('a tela do /agendar usa as regras, e não as reescreve', () => {
  it('controle: o guarda do escape pega o nome cru e deixa passar o escapado', () => {
    // Sem este caso, um guarda cego ficaria verde para sempre.
    expect(nomesSemEscape('`<span>${selProduct!.name}</span>`')).toEqual(['selProduct!.name']);
    expect(nomesSemEscape('`${stepHeader(comboData.name, x)}`')).toEqual(['comboData.name']);
    expect(nomesSemEscape('`${b.name.charAt(0)}`')).toEqual(['b.name']);
    expect(nomesSemEscape('`${esc(selProduct!.name)} ${esc(b.name.charAt(0))} ${esc(err.message)}`')).toEqual([]);
    expect(nomesSemEscape('selProduct = { slug: c.productSlug, name: comboData.productName };')).toEqual([]);
  });

  it('nenhum nome entra no innerHTML sem escape', () => {
    expect(SCRIPT.length).toBeGreaterThan(5000); // o recorte achou o script
    expect(nomesSemEscape(SCRIPT)).toEqual([]);
  });

  it('o resumo não fala do combo do Bayron', () => {
    // No código; o comentário que conta a história pode citar.
    expect(codigo(PAGINA)).not.toMatch(/Boris/i);
    expect(SCRIPT).toMatch(/esc\(comboData\?\.name/);
  });

  it('nenhum "Passo N de M" escrito à mão: o contador sai de rotuloDoPasso', () => {
    expect(SCRIPT).not.toMatch(/Passo \d+ de \d+/);
    expect(SCRIPT).toMatch(/rotuloDoPasso\(/);
    expect(SCRIPT).toMatch(/passosDoAgendamento\(services, selService\)/);
  });

  it('o serviço — ou o combo — com um barbeiro só pula a tela do barbeiro', () => {
    expect(SCRIPT).toMatch(/if \(selService\.barbers\.length === 1\) escolherBarbeiro\(selService\.barbers\[0\]\)/);
    expect(SCRIPT).toMatch(/case 'select-service':[^]*?avancarDoServico\(\)[^]*?break;/);
    expect(SCRIPT).toMatch(/case 'combo-continue':[^]*?avancarDoServico\(\)[^]*?break;/);
  });

  it('sem serviço, a tela oferece o WhatsApp da barbearia em vez de ficar em branco', () => {
    expect(SCRIPT).toMatch(/if \(services\.length === 0\) return renderSemServico\(\)/);
    expect(SCRIPT).toMatch(/Chamar no WhatsApp/);
    // O link vem do servidor, montado pela mesma função do rodapé — com o 55.
    expect(PAGINA).toMatch(/const whatsappUrl = waUrl\(/);
    expect(PAGINA).toMatch(/data-whatsapp=\{whatsappUrl\}/);
  });

  it('o calendário do combo fecha os dias em que ele não vale', () => {
    expect(SCRIPT).toMatch(/comboValeNaData\(comboData\.weekdays, d\.dateStr\)/);
  });

  it('"Voltar", no combo, não apaga o serviço do combo', () => {
    // Até 09/10/2026 o "Voltar" do topo apagava, e a tela do combo respondia "Este
    // combo não está mais disponível". Um lugar só limpa o serviço, e não no combo.
    const limpezas = [...SCRIPT.matchAll(/(.{0,20})selService = null;/g)].map((m) => m[1].trim());
    expect(limpezas).toEqual(['if (!comboMode)']);
  });
});

describe('a seção do combo na página inicial', () => {
  const COMBO = readFileSync('src/components/ComboBoris.astro', 'utf8');

  it('acha o dia de hoje no fuso da barbearia, e não no relógio de quem abre o site', () => {
    expect(codigo(COMBO)).not.toMatch(/getDay\(\)/);
    // O fuso é o DESTA barbearia (`tenants.timezone`, desde 12/10/2026), não um do processo.
    expect(COMBO).toMatch(/const fuso = fusoDe\(tenantAtual\(\)\)/);
    expect(COMBO).toMatch(/data-tz=\{fuso\}/);
    expect(COMBO).toMatch(/comboValeNaData\(c\.weekdays, hoje\)/);
  });
});

describe('o dia destacado nos horários do rodapé', () => {
  const RODAPE = readFileSync('src/components/Footer.astro', 'utf8');

  it('é o de hoje no fuso da barbearia, como o combo — não o do relógio de quem abre o site', () => {
    expect(codigo(RODAPE)).not.toMatch(/getDay\(\)/);
    expect(RODAPE).toMatch(/const fuso = fusoDe\(tenantAtual\(\)\)/);
    expect(RODAPE).toMatch(/<footer id="contato"[^>]*data-tz=\{fuso\}/);
    expect(codigo(RODAPE)).toMatch(/timeZone: fuso, weekday: 'short'/);
  });
});
