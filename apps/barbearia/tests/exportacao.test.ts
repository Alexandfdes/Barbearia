// Os dados da barbearia em planilha: clientes e agendamentos em CSV, baixados pelo
// dono (`PENDENCIAS-ABERTAS.md` §3.6 — feito em 11/10/2026, `src/lib/exportacao.ts`).
//
// ── O QUE ISTO PROTEGE ───────────────────────────────────────────────────────
//
//  · só o dono baixa, e só os dados da barbearia DELE — o caso mínimo é com duas;
//  · baixa também com a barbearia fora do ar (decisão do dono): quem saiu leva a
//    lista, não fica refém dela;
//  · o nome que qualquer pessoa digita no site não vira fórmula na planilha do dono;
//  · o link de desmarcar (uma credencial) nunca sai no arquivo;
//  · dia e hora no fuso da barbearia — um horário às 23:30 em Fortaleza já é o dia
//    seguinte em UTC, e é aí que a conta à mão erra.
//
// Precisa de Postgres para as rotas. Sem DATABASE_URL, só o formato e o fonte.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import {
  arquivoCsv, celula, dataDeCalendario, dinheiroDaPlanilha, noFuso, nomeDoArquivo,
  CABECALHO_DOS_AGENDAMENTOS, CABECALHO_DOS_CLIENTES, ROTAS_DA_EXPORTACAO,
} from '../src/lib/exportacao';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const FORTALEZA = 'America/Fortaleza';

/** Lê o CSV como o Excel lê: `;`, aspas, CRLF — e exige o BOM. */
function lerCsv(texto: string): string[][] {
  expect(texto.startsWith('﻿'), 'sem o BOM, o Excel lê "José" como "JosÃ©"').toBe(true);
  const s = texto.slice(1);
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\r' && s[i + 1] === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; i++; }
    else if (c === '\n') throw new Error(`quebra de linha sem \\r fora de aspas, na posição ${i}`);
    else campo += c;
  }
  expect(campo === '' && linha.length === 0, 'o arquivo termina com CRLF').toBe(true);
  return linhas;
}

const soCodigo = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

describe('o formato (`lib/exportacao.ts`)', () => {
  it('cada célula entre aspas, aspas dobradas, e a fórmula desligada com apóstrofo', () => {
    expect(celula('Ana')).toBe('"Ana"');
    expect(celula('Zé "Navalha"')).toBe('"Zé ""Navalha"""');
    expect(celula('a;b')).toBe('"a;b"');
    expect(celula(null)).toBe('""');
    expect(celula(30)).toBe('"30"');
    for (const perigoso of ['=1+1', '+5584999990000', '-2+3', '@SOMA(A1)', '\t=1', '\r=1']) {
      expect(celula(perigoso), JSON.stringify(perigoso)).toBe(`"'${perigoso}"`);
    }
    expect(celula('Ana =1+1')).toBe('"Ana =1+1"'); // só o começo da célula importa
  });

  it('o arquivo: BOM, ponto e vírgula, CRLF — e quebra de linha DENTRO da célula sobrevive', () => {
    const a = arquivoCsv(['Nome', 'Obs'], [['Ana', 'linha 1\nlinha 2'], ['Bruno', '']]);
    expect(a.startsWith('﻿"Nome";"Obs"\r\n')).toBe(true);
    expect(lerCsv(a)).toEqual([['Nome', 'Obs'], ['Ana', 'linha 1\nlinha 2'], ['Bruno', '']]);
  });

  it('dinheiro sem "R$" e com vírgula; data de calendário sem fuso; instante no fuso da barbearia', () => {
    expect(dinheiroDaPlanilha(4000)).toBe('40,00');
    expect(dinheiroDaPlanilha(3990)).toBe('39,90');
    expect(dinheiroDaPlanilha(5)).toBe('0,05');
    expect(dataDeCalendario('1990-05-20')).toBe('20/05/1990');
    expect(dataDeCalendario(null)).toBe('');
    expect(dataDeCalendario('20/05/1990')).toBe('');
    // 02:30 em UTC é 23:30 da VÉSPERA em Fortaleza.
    expect(noFuso('2030-04-02T02:30:00.000Z', 'dd/MM/yyyy HH:mm', FORTALEZA)).toBe('01/04/2030 23:30');
    // As colunas `created_at` guardam "aaaa-mm-dd hh:mm:ss" em UTC.
    expect(noFuso('2030-03-01 12:00:00', 'dd/MM/yyyy HH:mm', FORTALEZA)).toBe('01/03/2030 09:00');
    expect(noFuso(null, 'dd/MM', FORTALEZA)).toBe('');
    expect(nomeDoArquivo('clientes', 'ze', FORTALEZA, new Date('2030-04-02T02:30:00Z'))).toBe('clientes-ze-2030-04-01.csv');
  });

  it('o fuso é o da barbearia: o mesmo instante, em Manaus, é uma hora antes — e às vezes outro dia', () => {
    expect(noFuso('2030-04-02T02:30:00.000Z', 'dd/MM/yyyy HH:mm', 'America/Manaus')).toBe('01/04/2030 22:30');
    const meiaNoiteEMeiaEmFortaleza = new Date('2030-04-02T03:30:00Z');
    expect(nomeDoArquivo('clientes', 'ze', FORTALEZA, meiaNoiteEMeiaEmFortaleza)).toBe('clientes-ze-2030-04-02.csv');
    expect(nomeDoArquivo('clientes', 'ze', 'America/Manaus', meiaNoiteEMeiaEmFortaleza)).toBe('clientes-ze-2030-04-01.csv');
  });
});

describe('o painel oferece, e o middleware deixa passar fora do ar', () => {
  it('as duas rotas abrem com a barbearia fora do ar, como a do cartão', () => {
    const mw = soCodigo(readFileSync('src/middleware.ts', 'utf8'));
    expect(mw).toMatch(/caminho === ROTA_DO_CANCELAMENTO\s*\|\|\s*ROTAS_DA_EXPORTACAO\.has\(caminho\)/);
    expect([...ROTAS_DA_EXPORTACAO].sort()).toEqual(['/api/admin/exportar/agendamentos.csv', '/api/admin/exportar/clientes.csv']);
  });

  it('a seção aparece em Configurações e, só para o dono, na tela de assinatura — que abre fora do ar', () => {
    expect(soCodigo(readFileSync('src/pages/admin/configuracoes.astro', 'utf8'))).toMatch(/<ExportarDados \/>/);
    expect(soCodigo(readFileSync('src/pages/admin/assinatura.astro', 'utf8'))).toMatch(/\{dono && <ExportarDados \/>\}/);
    const secao = readFileSync('src/components/admin/ExportarDados.astro', 'utf8');
    expect(secao).toMatch(/href=\{ROTA_DOS_CLIENTES\} download/);
    expect(secao).toMatch(/href=\{ROTA_DOS_AGENDAMENTOS\} download/);
    expect(secao).toMatch(/data de nascimento de cada cliente/);
  });

  it('Configurações não diz mais que a galeria, os serviços e a cor "ainda não" se editam', () => {
    const cfg = soCodigo(readFileSync('src/pages/admin/configuracoes.astro', 'utf8'));
    expect(cfg).not.toMatch(/galeria de fotos da página inicial continua vindo do código/);
    expect(cfg).not.toMatch(/o site ainda não a lê/);
    expect(cfg).toMatch(/href="\/admin\/galeria"/);
  });
});

describe.skipIf(!TEM_BANCO)('as rotas, com duas barbearias e uma fora do ar', () => {
  let sql: ReturnType<typeof postgres>;
  let CLIENTES: typeof import('../src/pages/api/admin/exportar/clientes.csv.ts').GET;
  let AGENDAMENTOS: typeof import('../src/pages/api/admin/exportar/agendamentos.csv.ts').GET;
  let comTenant: typeof import('../src/db/index.js')['comTenant'];
  const cookies: Record<string, string> = {};
  const UM = { id: 1, slug: 'export-um', status: 'active' as const, domain: null, fuso: 'America/Fortaleza' };
  const DOIS = { id: 2, slug: 'export-dois', status: 'active' as const, domain: null, fuso: 'America/Fortaleza' };
  const TRES = { id: 3, slug: 'export-tres', status: 'suspended' as const, domain: null, fuso: 'America/Fortaleza' };

  type Barbearia = { id: number; slug: string; status: string; domain: string | null };
  const baixar = async (rota: typeof CLIENTES, cookie: string | undefined, tenant: Barbearia = UM) => {
    const r = await comTenant(tenant, async () => rota({
      request: new Request('http://painel.test/api/admin/exportar/x.csv', { headers: cookie ? { cookie } : {} }),
    } as never));
    // Os BYTES, como o navegador grava o arquivo: `r.text()` tira o BOM do começo
    // (a decodificação UTF-8 do padrão faz isso), e o teste não veria se ele sumisse.
    const texto = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await r.arrayBuffer());
    return { status: r.status, headers: r.headers, texto };
  };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
                (1, 'export-um', 'Export Um', 'active'), (2, 'export-dois', 'Export Dois', 'active'),
                (3, 'export-tres', 'Export Três', 'suspended')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active) VALUES
                (1, 1, 'Dona Um', 'dona', 'admin', 'x', true), (2, 1, 'Barbeiro Um', 'barbeiro', 'barber', 'x', true),
                (3, 2, 'Dono Dois', 'dono', 'admin', 'x', true), (4, 3, 'Dono Três', 'dono', 'admin', 'x', true)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES
                (1, 1, 'Corte', 'corte', 4000), (2, 2, 'Corte', 'corte', 4000), (3, 3, 'Corte', 'corte', 4000)`;
    await sql`INSERT INTO appointments (id, tenant_id, barber_id, service_id, customer_name, customer_phone, customer_birthdate,
                                        starts_at, ends_at, duration_minutes, price_cents, status, cancelled_by, notes,
                                        manage_token, created_at, created_by) VALUES
      (1, 1, 2, 1, 'Ana Souza', '84988880001', '1990-05-20', '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z',
          30, 4000, 'completed', NULL, ${'Prefere "degradê"; volta em 15 dias\nmáquina 2'}, 'tk-segredo-1', '2030-03-01 12:00:00', 'customer'),
      (2, 1, 2, 1, 'Ana S. Souza', '84988880001', NULL, '2030-04-02T02:30:00.000Z', '2030-04-02T03:00:00.000Z',
          30, 4000, 'cancelled', 'customer', NULL, 'tk-segredo-2', '2030-03-20 15:00:00', 'customer'),
      (3, 1, 1, 1, '=HYPERLINK("http://mal.example","clique")', '84988880002', NULL, '2030-05-10T14:00:00.000Z',
          '2030-05-10T14:30:00.000Z', 30, 4000, 'no_show', NULL, NULL, 'tk-segredo-3', '2030-05-01 10:00:00', 'barber'),
      (4, 2, 3, 2, 'Cliente da Dois', '84977770000', '1980-01-01', '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z',
          30, 4000, 'confirmed', NULL, NULL, 'tk-segredo-4', '2030-03-01 12:00:00', 'customer'),
      (5, 3, 4, 3, 'Cliente da Três', '84955550000', NULL, '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z',
          30, 4000, 'confirmed', NULL, NULL, 'tk-segredo-5', '2030-03-01 12:00:00', 'customer')`;
    await sql`INSERT INTO appointment_items (tenant_id, appointment_id, name, price_cents) VALUES
                (1, 1, 'Barba', 2500), (1, 1, 'Pomada', 3000)`;
    await sql`INSERT INTO reservations (tenant_id, product_name, price_cents, customer_name, customer_phone) VALUES
                (1, 'Óleo', 3500, 'Bruno Reserva', '84966660000'), (1, 'Pomada', 3000, 'Ana', '84988880001'),
                (2, 'Óleo', 3500, 'Reserva da Dois', '84944440000')`;
    const { makeSessionCookie } = await import('../src/lib/session.js');
    const valor = (c: string) => c.split(';')[0];
    cookies.donaUm   = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
    cookies.barbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
    cookies.donoDois = valor(await makeSessionCookie({ barberId: 3, role: 'admin',  tenantId: 2 }));
    cookies.donoTres = valor(await makeSessionCookie({ barberId: 4, role: 'admin',  tenantId: 3 }));
    await (await import('../src/lib/tenant.js')).carregarTenants(true);
    ({ GET: CLIENTES } = await import('../src/pages/api/admin/exportar/clientes.csv.ts'));
    ({ GET: AGENDAMENTOS } = await import('../src/pages/api/admin/exportar/agendamentos.csv.ts'));
    ({ comTenant } = await import('../src/db/index.js'));
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });

  it('a lista de clientes: um por telefone, com o nome mais recente, a data e as contas', async () => {
    const r = await baixar(CLIENTES, cookies.donaUm);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="clientes-export-um-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(r.headers.get('cache-control')).toBe('no-store');

    const [cabecalho, ...linhas] = lerCsv(r.texto);
    expect(cabecalho).toEqual(CABECALHO_DOS_CLIENTES);
    expect(linhas).toHaveLength(3);
    const por = (tel: string) => linhas.find((l) => l[1] === tel)!;
    expect(por('(84) 98888-0001')).toEqual([
      'Ana S. Souza', '(84) 98888-0001', '20/05/1990', '2', '1', '0', '1', '95,00', '1', '15/03/2030', '01/04/2030',
    ]);
    // O nome digitado no site, desarmado: o apóstrofo na frente desliga a fórmula.
    expect(por('(84) 98888-0002')[0]).toBe(`'=HYPERLINK("http://mal.example","clique")`);
    expect(por('(84) 98888-0002').slice(3, 7)).toEqual(['1', '0', '1', '0']);
    // Quem só reservou produto também é cliente.
    expect(por('(84) 96666-0000').slice(0, 4)).toEqual(['Bruno Reserva', '(84) 96666-0000', '', '0']);
    expect(por('(84) 96666-0000')[8]).toBe('1');
  });

  it('os agendamentos: dia e hora no fuso, extras, situação em português, e a observação inteira', async () => {
    const r = await baixar(AGENDAMENTOS, cookies.donaUm);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/filename="agendamentos-export-um-/);
    const [cabecalho, ...linhas] = lerCsv(r.texto);
    expect(cabecalho).toEqual(CABECALHO_DOS_AGENDAMENTOS);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toEqual([
      '15/03/2030', '10:00', '30', 'Ana Souza', '(84) 98888-0001', '20/05/1990', 'Corte', 'Barbeiro Um',
      '40,00', '55,00', 'Barba, Pomada', 'Atendido', '', 'Prefere "degradê"; volta em 15 dias\nmáquina 2',
      '01/03/2030 09:00', 'Cliente, pelo site',
    ]);
    // 02:30 UTC do dia 2 é 23:30 do dia 1 em Fortaleza.
    expect(linhas[1].slice(0, 2)).toEqual(['01/04/2030', '23:30']);
    expect(linhas[1].slice(11, 13)).toEqual(['Desmarcado', 'Cliente']);
    expect(linhas[2][3]).toBe(`'=HYPERLINK("http://mal.example","clique")`);
    expect(linhas[2].slice(7, 8)).toEqual(['Dona Um']);
    expect(linhas[2][11]).toBe('Faltou');
    expect(linhas[2][15]).toBe('Barbearia, pelo painel');
  });

  it('nada de outra barbearia, e nunca o link de desmarcar', async () => {
    for (const rota of [CLIENTES, AGENDAMENTOS]) {
      const { texto } = await baixar(rota, cookies.donaUm);
      for (const alheio of ['Cliente da Dois', 'Reserva da Dois', '97777-0000', '94444-0000', 'Cliente da Três']) {
        expect(texto, alheio).not.toContain(alheio);
      }
      expect(texto).not.toMatch(/tk-segredo/);
    }
    // E a outra barbearia baixa só a dela.
    const dois = lerCsv((await baixar(CLIENTES, cookies.donoDois, DOIS)).texto).slice(1).map((l) => l[0]).sort();
    expect(dois).toEqual(['Cliente da Dois', 'Reserva da Dois']);
  });

  it('a primeira parede: mesmo como dono do banco, por cima do RLS, a consulta só traz a barbearia pedida', async () => {
    // Dentro da requisição o RLS também filtra — e esconderia uma consulta sem o
    // filtro da barbearia. Fora dela, a conexão é a do dono das tabelas: aqui só o
    // `WHERE tenant_id` separa.
    const { arquivoDosClientes, arquivoDosAgendamentos } = await import('../src/lib/exportacao.js');
    const clientes = (await arquivoDosClientes(1, FORTALEZA)).conteudo;
    const agendamentos = (await arquivoDosAgendamentos(1, FORTALEZA)).conteudo;
    for (const alheio of ['Cliente da Dois', 'Reserva da Dois', 'Cliente da Três']) {
      expect(clientes, alheio).not.toContain(alheio);
      expect(agendamentos, alheio).not.toContain(alheio);
    }
    expect(lerCsv(clientes)).toHaveLength(4);
  });

  it('só o dono: barbeiro recebe 403, sem sessão 401', async () => {
    for (const rota of [CLIENTES, AGENDAMENTOS]) {
      expect((await baixar(rota, cookies.barbeiro)).status).toBe(403);
      expect((await baixar(rota, undefined)).status).toBe(401);
    }
  });

  it('com a barbearia FORA DO AR, o dono ainda baixa — os dados são dele', async () => {
    const { getSession } = await import('../src/lib/session.js');
    const pedido = new Request('http://painel.test/x', { headers: { cookie: cookies.donoTres } });
    expect(await getSession(pedido)).toBeNull(); // para o resto do painel, ele não entra
    const r = await baixar(CLIENTES, cookies.donoTres, TRES);
    expect(r.status).toBe(200);
    expect(lerCsv(r.texto)[1][0]).toBe('Cliente da Três');
    expect((await baixar(AGENDAMENTOS, cookies.donoTres, TRES)).status).toBe(200);
  });
});
