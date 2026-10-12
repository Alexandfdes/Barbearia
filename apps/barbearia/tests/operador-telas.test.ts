// As telas do painel do operador (decisão do dono em 12/10/2026,
// `docs/PENDENCIAS-ABERTAS.md` §3.9): Início, Barbearias e a ficha de cada uma,
// Cobrança, Registro e Sistema — e as anotações na ficha.
//
// ── O QUE ISTO PROTEGE ───────────────────────────────────────────────────────
//
//  · O `src/middleware.ts` deixa `/operador/…` inteiro passar sem barbearia, como
//    dono do banco. Então TODA página de lá tem de abrir com a porta do operador
//    antes de qualquer consulta — e a lista das páginas fecha: tela nova passa por
//    aqui.
//  · A tela de entrar devolve para a tela de onde a pessoa veio, e só para tela
//    do painel: nunca para um endereço que quem mandou o link escolheu.
//  · Os números contam certo: cada pagamento uma vez, o mês no relógio do
//    operador, a conversão do teste, o que pede atenção.
//  · Nenhum dado de cliente de barbearia, nenhum CPF do corpo do evento da Asaas,
//    e nenhum segredo do ambiente chegam a uma tela.
//  · A anotação: só com a sessão de operador, com limite, e só se acrescenta.
//
// Precisa de Postgres para os números, a ficha, a cobrança, o registro e a
// anotação. Sem DATABASE_URL, só a porta, as contas de data e a tela de sistema.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync, mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations, migrationSql, recriarSchema } from './migrations.js';
import { abrirPorta, cookieDoOperador, exigirOperador, gerarHash, voltaValida } from '../src/lib/operador';
import { descreverAcao } from '../src/lib/operadorBarbearias';
import { alertasDoSistema, backupNoPainel, configuracaoNoPainel } from '../src/lib/operadorSistema';
import { dinheiro, grupoDoEvento, inicioDoMes, rotuloDoEvento, ultimasSemanas } from '../src/lib/operadorTela';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const SENHA = 'frase de teste das telas do operador';
const HOST_DO_PAINEL = 'painel.test';
const PAINEL_URL = `http://${HOST_DO_PAINEL}`;

let HASH = '';
beforeAll(async () => { HASH = await gerarHash(SENHA, 14); }, 30_000);

/** O código sem os comentários — que podem citar o que quiserem. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// ── A porta de cada tela ────────────────────────────────────────────────────

/** As telas do operador. Tela nova entra aqui de propósito — e passa pela conferência abaixo. */
const TELAS = [
  'src/pages/operador/barbearias/[id].astro',
  'src/pages/operador/barbearias/index.astro',
  'src/pages/operador/cobranca.astro',
  'src/pages/operador/index.astro',
  'src/pages/operador/registro.astro',
  'src/pages/operador/sistema.astro',
];

/**
 * A primeira coisa que a tela espera (`await`) é a porta, e a linha seguinte
 * encerra a requisição quando ela manda. Nada de consulta antes.
 */
function abreComAPorta(fonte: string): boolean {
  const frontmatter = semComentarios(fonte.split(/^---\s*$/m)[1] ?? '');
  const primeiro = frontmatter.indexOf('await ');
  if (primeiro === -1) return false;
  const daPorta = frontmatter.slice(primeiro);
  return /^await exigirOperador\(Astro\.request, Astro\.response\.headers\);\s*\nif \(fechada\) return fechada;/.test(daPorta)
    || /^await abrirPorta\(Astro\.request, Astro\.response\.headers\);\s*\nif \('resposta' in porta\) return porta\.resposta;/.test(daPorta);
}

describe('toda tela do operador abre com a porta, antes de qualquer outra coisa', () => {
  it('as telas são estas — tela nova entra na lista de propósito', () => {
    const achadas = globSync('src/pages/operador/**/*.astro').map((c) => c.split(sep).join('/')).sort();
    expect(achadas).toEqual(TELAS);
  });

  it('controle: o critério reprova a tela que consulta antes da porta, ou que pergunta e não obedece', () => {
    const certa = "---\nconst fechada = await exigirOperador(Astro.request, Astro.response.headers);\nif (fechada) return fechada;\nconst x = await listar();\n---\n";
    expect(abreComAPorta(certa)).toBe(true);
    expect(abreComAPorta("---\nconst x = await listar();\nconst fechada = await exigirOperador(Astro.request, Astro.response.headers);\nif (fechada) return fechada;\n---\n")).toBe(false);
    expect(abreComAPorta("---\nconst fechada = await exigirOperador(Astro.request, Astro.response.headers);\nconst x = await listar();\n---\n")).toBe(false);
    expect(abreComAPorta('---\nconst x = 1;\n---\n')).toBe(false);
  });

  it('cada uma abre com a porta', () => {
    const sem = TELAS.filter((c) => !abreComAPorta(readFileSync(c, 'utf8')));
    expect(sem).toEqual([]);
  });

  it('só a tela de entrar usa a porta que deixa passar sem sessão', () => {
    const comAPortaDeEntrar = TELAS.filter((c) => /\babrirPorta\(/.test(semComentarios(readFileSync(c, 'utf8'))));
    expect(comAPortaDeEntrar).toEqual(['src/pages/operador/index.astro']);
  });

  it('as rotas de /api/operador/ conferem o endereço primeiro — e as que agem, a sessão antes de ler o corpo', () => {
    const rotas = globSync('src/pages/api/operador/*.ts').map((c) => c.split(sep).join('/')).sort();
    expect(rotas).toEqual(['src/pages/api/operador/acao.ts', 'src/pages/api/operador/entrar.ts', 'src/pages/api/operador/sair.ts']);
    for (const r of rotas) {
      const corpo = semComentarios(readFileSync(r, 'utf8')).split('=> {')[1] ?? '';
      expect(corpo.trimStart().startsWith("if (portaoDoOperador(request) !== 'aberto') return naoEncontrado();"), r).toBe(true);
    }
    const acao = semComentarios(readFileSync('src/pages/api/operador/acao.ts', 'utf8'));
    expect(acao.indexOf('operadorAutenticado(request)')).toBeGreaterThan(0);
    expect(acao.indexOf('operadorAutenticado(request)')).toBeLessThan(acao.indexOf('request.json()'));
  });

  it('nenhuma tela e nenhum arquivo do operador lê coluna de cliente de barbearia', () => {
    const arquivos = [...TELAS, ...globSync('src/lib/operador*.ts').map((c) => c.split(sep).join('/')),
      ...globSync('src/components/operador/*.astro').map((c) => c.split(sep).join('/'))];
    expect(arquivos.length).toBeGreaterThan(10);
    // `\b`: `asaas_customer_id` é o cliente do PRODUTO na Asaas — o dono —, não o da barbearia.
    const leem = arquivos.filter((c) => /\bcustomer_|\bcustomer(Name|Phone|Birthdate)\b/.test(semComentarios(readFileSync(c, 'utf8'))));
    expect(leem).toEqual([]);
  });
});

describe('a porta, rodando', () => {
  const env = () => ({ ...process.env, OPERADOR_SENHA_HASH: HASH, PAINEL_URL });
  const pedido = (caminho: string, o: { host?: string; cookie?: string } = {}) => new Request(`http://${o.host ?? HOST_DO_PAINEL}${caminho}`, {
    headers: { host: o.host ?? HOST_DO_PAINEL, ...(o.cookie ? { cookie: o.cookie } : {}) },
  });

  it('desligada ou fora do endereço do painel: o 404 de qualquer endereço', async () => {
    const semHash = await exigirOperador(pedido('/operador/cobranca'), new Headers(), { ...process.env, OPERADOR_SENHA_HASH: '', PAINEL_URL });
    expect(semHash?.status).toBe(404);
    expect(await semHash?.text()).toBe('Não encontrado');
    const noSite = await exigirOperador(pedido('/operador/cobranca', { host: 'barbearia.test' }), new Headers(), env());
    expect(noSite?.status).toBe(404);
    const entrar = await abrirPorta(pedido('/operador', { host: 'barbearia.test' }), new Headers(), env());
    expect('resposta' in entrar && entrar.resposta.status).toBe(404);
  });

  it('sem sessão: a tela de entrar, com a volta para a tela pedida — e só para tela do painel', async () => {
    const r = await exigirOperador(pedido('/operador/barbearias/7'), new Headers(), env());
    expect(r?.status).toBe(303);
    expect(r?.headers.get('location')).toBe('/operador?volta=%2Foperador%2Fbarbearias%2F7');
    expect(r?.headers.get('cache-control')).toBe('no-store');
    const inventada = await exigirOperador(pedido('/operador/qualquer-coisa'), new Headers(), env());
    expect(inventada?.headers.get('location')).toBe('/operador');
  });

  it('com a sessão: segue — e a tela sai sem cache, fora de moldura e fora da busca', async () => {
    const cookie = (await cookieDoOperador(env())).split(';')[0];
    const cabecalhos = new Headers();
    expect(await exigirOperador(pedido('/operador/sistema', { cookie }), cabecalhos, env())).toBeNull();
    expect(cabecalhos.get('cache-control')).toBe('no-store');
    expect(cabecalhos.get('x-frame-options')).toBe('DENY');
    expect(cabecalhos.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(cabecalhos.get('referrer-policy')).toBe('same-origin');
    expect(cabecalhos.get('x-robots-tag')).toBe('noindex, nofollow');
    const entrar = await abrirPorta(pedido('/operador', { cookie }), new Headers(), env());
    expect(entrar).toEqual({ dentro: true });
  });

  it('a volta aceita só as telas do painel', () => {
    for (const ok of ['/operador', '/operador/barbearias', '/operador/barbearias/1', '/operador/barbearias/123456789',
      '/operador/cobranca', '/operador/registro', '/operador/sistema']) {
      expect(voltaValida(ok), ok).toBe(ok);
    }
    for (const nao of [null, '', '//outro.site', 'https://outro.site/operador', '/operador/../admin', '/operadorx',
      '/operador/barbearias/0', '/operador/barbearias/abc', '/operador/barbearias/1234567890', '/operador/sistema?x=1',
      '/admin', '/operador/', '/\\outro.site']) {
      expect(voltaValida(nao), String(nao)).toBeNull();
    }
  });
});

// ── As contas de data, no relógio do operador ───────────────────────────────

describe('o relógio do operador', () => {
  it('as semanas vão de segunda a domingo, e a última é a de agora', () => {
    const segunda = ultimasSemanas(new Date('2026-10-12T12:00:00-03:00'), 8);
    expect(segunda).toHaveLength(8);
    expect(segunda[7]).toEqual({ inicio: new Date('2026-10-12T03:00:00Z'), rotulo: '12/10' });
    expect(segunda[0]).toEqual({ inicio: new Date('2026-08-24T03:00:00Z'), rotulo: '24/08' });
    // Domingo às 23:30 em Mossoró ainda é a semana que começou na segunda, dia 05.
    const domingo = ultimasSemanas(new Date('2026-10-11T23:30:00-03:00'), 2);
    expect(domingo.map((s) => s.rotulo)).toEqual(['28/09', '05/10']);
  });

  it('o mês é o do relógio do operador: 22h do dia 30/09 em Mossoró ainda é setembro', () => {
    expect(inicioDoMes(new Date('2026-10-01T01:00:00Z'))).toEqual(new Date('2026-09-01T03:00:00Z'));
    expect(inicioDoMes(new Date('2026-10-01T03:00:00Z'))).toEqual(new Date('2026-10-01T03:00:00Z'));
  });

  it('os eventos da Asaas, em português e no grupo certo', () => {
    expect(rotuloDoEvento('CHECKOUT_PAID')).toBe('Cartão cadastrado');
    expect(rotuloDoEvento('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED')).toBe('Cartão recusado');
    expect(rotuloDoEvento('EVENTO_NOVO_DA_ASAAS')).toBe('EVENTO_NOVO_DA_ASAAS');
    expect(['PAYMENT_RECEIVED', 'SUBSCRIPTION_DELETED', 'CHECKOUT_PAID', 'ACCOUNT_STATUS_UPDATED'].map(grupoDoEvento))
      .toEqual(['pagamentos', 'assinaturas', 'checkout', 'outros']);
  });

  it('a anotação no registro: numa linha, e cortada quando é longa', () => {
    const base = { ip: null, quando: null, fuso: null, slug: 'ze' };
    expect(descreverAcao({ ...base, acao: 'anotou', detalhe: { texto: 'liguei dia 12,\n\npaga sexta' } }))
      .toBe('Anotou em ze: liguei dia 12, paga sexta');
    const longa = descreverAcao({ ...base, acao: 'anotou', detalhe: { texto: 'a'.repeat(300) } });
    expect(longa.endsWith('…')).toBe(true);
    expect(longa.length).toBe('Anotou em ze: '.length + 120);
  });
});

// ── A tela de sistema: nenhum segredo ───────────────────────────────────────

/** Segredos de mentira, cada um com uma marca que não pode aparecer em tela nenhuma. */
const SEGREDOS: Record<string, string> = {
  SESSION_SECRET: 'SEGREDO-sessao-0123456789abcdef0123456789abcdef',
  ASAAS_API_KEY: '$aact_SEGREDO-chave-da-asaas',
  ASAAS_WEBHOOK_TOKEN: 'SEGREDO-token-do-webhook',
  SMTP_URL: 'smtps://usuario:SEGREDO-senha-smtp@smtp.provedor.test:465',
  S3_ACCESS_KEY_ID: 'SEGREDO-id-s3',
  S3_SECRET_ACCESS_KEY: 'SEGREDO-chave-s3',
  DATABASE_URL_APP: 'postgres://fadeline_app:SEGREDO-senha-app@banco.test:5432/fadeline',
  ADMIN_INITIAL_PASSWORD: 'SEGREDO-senha-inicial',
  EMAIL_REMETENTE: 'nao-responda@dominio.test',
};

describe('a tela de sistema não mostra segredo', () => {
  let pasta = '';
  beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), 'backups-operador-'));
  });
  afterAll(() => { rmSync(pasta, { recursive: true, force: true }); });

  const envDe = (extra: Record<string, string> = {}) => ({
    ...SEGREDOS, OPERADOR_SENHA_HASH: HASH, NODE_ENV: 'production', CADASTRO_ABERTO: '1',
    S3_ENDPOINT: 's3.provedor.test', S3_BUCKET: 'backups', BACKUP_DIR: pasta,
    PAINEL_URL: 'https://painel.exemplo.test', DOMINIO_BASE: 'exemplo.test', ...extra,
  });

  it('o último backup, o das fotos e quantos dias — e o que vale como "sai do servidor"', () => {
    const agora = Date.now();
    const escrever = (nome: string, horasAtras: number) => {
      writeFileSync(join(pasta, nome), 'x'.repeat(2048));
      const t = new Date(agora - horasAtras * 3600_000);
      utimesSync(join(pasta, nome), t, t);
    };
    escrever('barbearia_2026-10-10-03-00-00.sql.gz', 26);
    escrever('barbearia_2026-10-11-03-00-00.sql.gz', 2);
    escrever('barbearia_2026-10-11-03-00-00-fotos.tar.gz', 2);
    escrever('outro-arquivo.txt', 1);
    const b = backupNoPainel(envDe());
    expect(b.ultimo?.arquivo).toBe('barbearia_2026-10-11-03-00-00.sql.gz');
    expect(b.ultimo?.bytes).toBe(2048);
    expect(b.fotos?.arquivo).toBe('barbearia_2026-10-11-03-00-00-fotos.tar.gz');
    // Arquivos, não dias: o daemon faz um no boot e um às 03:00 — dois podem ser do mesmo dia.
    expect(b.quantos).toBe(2);
    expect(b.retencaoDias).toBe(30);
    expect(backupNoPainel(envDe({ BACKUP_RETENTION_DAYS: '7' })).retencaoDias).toBe(7);
    expect(backupNoPainel(envDe({ BACKUP_RETENTION_DAYS: 'sete' })).retencaoDias).toBe(30);
    // A hora do diário, como o daemon a lê: 03:00 sem a variável; fora de 0 a 23, o daemon
    // nunca roda o diário — e a tela não pode dizer uma hora.
    expect(b.horaDoDiario).toBe(3);
    expect(backupNoPainel(envDe({ BACKUP_HOUR: '5' })).horaDoDiario).toBe(5);
    expect(backupNoPainel(envDe({ BACKUP_HOUR: '25' })).horaDoDiario).toBeNull();
    expect(b.foraDoServidor).toBe(true);
    expect(backupNoPainel(envDe({ S3_SECRET_ACCESS_KEY: '' })).foraDoServidor).toBe(false);
    expect(backupNoPainel(envDe({ BACKUP_DIR: join(pasta, 'nao-existe') })).ultimo).toBeNull();
  });

  it('nenhum valor de variável secreta chega à resposta — só se ela existe', () => {
    const config = configuracaoNoPainel(envDe());
    const tudo = JSON.stringify({ config, backup: backupNoPainel(envDe()) });
    expect(tudo).not.toMatch(/SEGREDO/);
    expect(tudo).not.toContain(HASH);
    expect(config.email.transporte).toBe('smtp');
    expect(config.cobranca).toEqual({ ligada: true, ambiente: 'sandbox', tokenDoWebhook: true });
    expect(config.cadastro.aberto).toBe(true);
    expect(config.enderecos).toEqual({ painel: 'https://painel.exemplo.test', dominioBase: 'exemplo.test' });
  });

  it('os alertas, do mais grave para o menos', () => {
    const base = {
      banco: { responde: true, ms: 3, versao: '16.15', tamanho: '9 MB', usuario: 'fadeline', superusuario: true },
      migracoes: { aplicadas: 14, ultima: '0014_anotacoes_do_operador.sql', em: new Date(), noBuild: 14 },
      backup: { pasta, ultimo: null, fotos: null, quantos: 0, retencaoDias: 30, horaDoDiario: 3, foraDoServidor: false },
      ...configuracaoNoPainel(envDe({ SMTP_URL: '', EMAIL_PASTA: '', ASAAS_API_KEY: '' })),
    };
    const textos = alertasDoSistema(base).map((a) => `${a.estado}: ${a.texto}`);
    expect(textos).toEqual([
      'problema: Nenhum backup do banco nesta máquina.',
      'problema: O e-mail está desligado: a senha esquecida e os avisos não saem.',
      'atencao: O backup não sai deste servidor: perdido o disco, vai tudo.',
      'atencao: A cobrança está desligada: ninguém consegue pagar.',
      'atencao: O app fala com o banco como superusuário — a troca do usuário está pronta e falta rodar.',
    ]);
    const emOrdem = { ...base, banco: { ...base.banco, superusuario: false },
      backup: { ...base.backup, ultimo: { arquivo: 'b.sql.gz', bytes: 1, em: new Date() }, foraDoServidor: true },
      ...configuracaoNoPainel(envDe()) };
    expect(alertasDoSistema(emOrdem).map((a) => a.texto))
      .toEqual(['A cobrança está no ambiente de teste da Asaas: o dinheiro não é de verdade.']);
    const velho = { ...emOrdem, backup: { ...emOrdem.backup, ultimo: { arquivo: 'b.sql.gz', bytes: 1, em: new Date(Date.now() - 30 * 3600_000) } } };
    expect(alertasDoSistema(velho)[0].texto).toMatch(/backup diário parou/);
  });
});

// ── Com banco ───────────────────────────────────────────────────────────────

describe.skipIf(!TEM_BANCO)('a migration 0014, num banco parado na 0013', () => {
  let sql: ReturnType<typeof postgres>;
  const NOVA = '0014_anotacoes_do_operador.sql';

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const todas = listarMigrations();
    expect(todas).toContain(NOVA);
    for (const f of todas.slice(0, todas.indexOf(NOVA))) await sql.unsafe(migrationSql(f));
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'bayron', 'Barbearia Bayron', 'active')`;
    await sql`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe) VALUES (1, 'suspendeu', '{"statusAnterior":"active"}')`;
    // O que o defeito do `::jsonb` gravava: o JSON dentro de uma STRING JSON.
    const comoString = (o: unknown) => JSON.stringify(JSON.stringify(o));
    await sql`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe) VALUES
      (1, 'suspendeu', ${comoString({ statusAnterior: 'trial' })}::text::jsonb),
      (1, 'suspendeu', ${JSON.stringify('não é json')}::text::jsonb)`;
    await sql`INSERT INTO webhook_events (tenant_id, gateway_event_id, event, payload) VALUES
      (1, 'evt_string', 'PAYMENT_CONFIRMED', ${comoString({ payment: { id: 'pay_s', value: 100 } })}::text::jsonb)`;
  }, 60_000);

  afterAll(async () => { await sql?.end({ timeout: 5 }); });

  it('antes dela, a anotação é recusada; depois, aceita — e o registro de antes fica', async () => {
    await expect(sql`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe) VALUES (1, 'anotou', '{"texto":"x"}')`)
      .rejects.toThrow(/acoes_do_operador_acao_valida/);
    await sql.unsafe(migrationSql(NOVA));
    await sql`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe) VALUES (1, 'anotou', '{"texto":"liguei"}')`;
    expect((await sql`SELECT acao FROM acoes_do_operador ORDER BY id`).map((l) => l.acao)).toEqual(['suspendeu', 'suspendeu', 'suspendeu', 'anotou']);
  });

  it('as linhas que o defeito gravou como string voltam a ser objeto — e a que não é JSON fica', async () => {
    const acoes = await sql`SELECT jsonb_typeof(detalhe) AS tipo, detalhe->>'statusAnterior' AS antes FROM acoes_do_operador ORDER BY id`;
    expect(acoes.slice(0, 3)).toEqual([
      { tipo: 'object', antes: 'active' },
      { tipo: 'object', antes: 'trial' },
      { tipo: 'string', antes: null },
    ]);
    const [evento] = await sql`SELECT jsonb_typeof(payload) AS tipo, payload->'payment'->>'value' AS valor FROM webhook_events WHERE gateway_event_id = 'evt_string'`;
    expect(evento).toEqual({ tipo: 'object', valor: '100' });
  });

  it('roda duas vezes sem erro — e ação que não existe continua recusada', async () => {
    await sql.unsafe(migrationSql(NOVA));
    await expect(sql`INSERT INTO acoes_do_operador (tenant_id, acao) VALUES (1, 'apagou')`).rejects.toThrow(/acoes_do_operador_acao_valida/);
  });
});

describe.skipIf(!TEM_BANCO)('com banco: os números, a ficha, a cobrança, o registro e a anotação', () => {
  let sql: ReturnType<typeof postgres>;
  let ACAO: typeof import('../src/pages/api/operador/acao.ts').POST;
  let barbearias: typeof import('../src/lib/operadorBarbearias.js');
  let numeros: typeof import('../src/lib/operadorNumeros.js');
  let sistema: typeof import('../src/lib/operadorSistema.js');
  const antes = { hash: process.env.OPERADOR_SENHA_HASH, painel: process.env.PAINEL_URL };
  let cookie = '';

  const AGORA = new Date();
  const DIA = 24 * 60 * 60 * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();
  /** Um instante dentro deste mês, no relógio do operador, e antes de agora. */
  const ESTE_MES = new Date(Math.min(inicioDoMes(AGORA).getTime() + 60_000, AGORA.getTime() - 1000));
  const MES_PASSADO = new Date(inicioDoMes(AGORA).getTime() - 2 * DIA);

  const DADOS_DE_CLIENTE = ['Cliente Secreto', 'Silva', '84988887777', '1990-01-01', 'tk-tela-1', '12345678900', 'dono@segredo.test'];

  const agir = (corpo: Record<string, unknown>, o: { cookie?: string; host?: string } = {}) => {
    const host = o.host ?? HOST_DO_PAINEL;
    return ACAO({
      request: new Request(`http://${host}/api/operador/acao`, {
        method: 'POST',
        headers: { host, 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.9', ...((o.cookie ?? cookie) ? { cookie: o.cookie ?? cookie } : {}) },
        body: JSON.stringify(corpo),
      }),
      clientAddress: '127.0.0.1',
    } as never);
  };

  beforeAll(async () => {
    process.env.OPERADOR_SENHA_HASH = HASH;
    process.env.PAINEL_URL = PAINEL_URL;
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    const t = AGORA.getTime();
    await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, past_due_since, subscription_ends_at,
                                   asaas_customer_id, asaas_subscription_id, created_at) VALUES
      (1, 'em-dia',         'Em Dia',         'active',    ${iso(t - 30 * DIA)}, NULL, NULL, 'cus_1', 'sub_1', ${iso(t - 40 * DIA)}),
      (2, 'teste-acabando', 'Teste Acabando', 'trial',     ${iso(t + 2 * DIA)},  NULL, NULL, NULL, NULL,       ${iso(t - 5 * DIA)}),
      (3, 'teste-longe',    'Teste Longe',    'trial',     ${iso(t + 6 * DIA)},  NULL, NULL, NULL, NULL,       ${iso(t - 1 * DIA)}),
      (4, 'carencia-teste', 'Carência Teste', 'trial',     ${iso(t - 1 * DIA)},  NULL, NULL, NULL, NULL,       ${iso(t - 8 * DIA)}),
      (5, 'atrasada',       'Atrasada',       'past_due',  ${iso(t - 52 * DIA)}, ${iso(t - 1 * DIA)}, NULL, 'cus_5', 'sub_5', ${iso(t - 60 * DIA)}),
      (6, 'cancelou',       'Cancelou',       'active',    ${iso(t - 80 * DIA)}, NULL, ${iso(t + 1 * DIA)}, 'cus_6', 'sub_6', ${iso(t - 90 * DIA)}),
      (7, 'vencida',        'Vencida',        'trial',     ${iso(t - 20 * DIA)}, NULL, NULL, NULL, NULL,       ${iso(t - 27 * DIA)}),
      (8, 'encerrada',      'Encerrada',      'cancelled', NULL,                 NULL, NULL, NULL, NULL,       ${iso(t - 120 * DIA)})`;
    await sql`SELECT setval('tenants_id_seq', 8)`;
    await sql`INSERT INTO settings (id, tenant_id, business_name, short_name, whatsapp_number, address_street, address_city, tagline)
              SELECT id, id, business_name || ' (no site)', slug, '5584999990000', 'Rua A, 1', 'Natal/RN', 'Corte e barba' FROM tenants`;
    await sql`SELECT setval('settings_id_seq', 8)`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email)
              SELECT id, id, 'Dono ' || slug, 'dono', 'admin', 'x', true, '849900000' || lpad(id::text, 2, '0'), slug || '@dono.test' FROM tenants`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
      (9, 1, 'Barbeiro Ativo', 'ativo', 'barber', 'x', true, '84990000099'),
      (10, 1, 'Barbeiro Saiu', 'saiu', 'barber', 'x', false, '84990000098')`;
    await sql`SELECT setval('barbers_id_seq', 10)`;
    await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time) VALUES (1, 9, 1, '08:00', '18:00'), (1, 1, 2, '08:00', '18:00')`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES
      (1, 1, 'Corte', 'corte', 4000, true), (2, 1, 'Barba', 'barba', 0, true), (3, 1, 'Antigo', 'antigo', 3000, false)`;
    await sql`INSERT INTO gallery_images (tenant_id, path) VALUES (1, 'a.webp'), (1, 'b.webp'), (1, 'c.webp')`;
    const quando = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone, customer_birthdate,
                                        starts_at, ends_at, duration_minutes, price_cents, manage_token, created_at) VALUES
      (1, 9, 1, 'Cliente Secreto Silva', '84988887777', '1990-01-01', ${iso(t + DIA)}, ${iso(t + DIA + 1800_000)}, 30, 4000, 'tk-tela-1', ${quando(t - 2 * DIA)}),
      (1, 9, 1, 'Cliente Secreto Souza', '84988886666', NULL, ${iso(t - 9 * DIA)}, ${iso(t - 9 * DIA + 1800_000)}, 30, 4000, 'tk-tela-2', ${quando(t - 10 * DIA)}),
      (1, 9, 1, 'Cliente Secreto Lima',  '84988885555', NULL, ${iso(t - 40 * DIA)}, ${iso(t - 40 * DIA + 1800_000)}, 30, 4000, 'tk-tela-3', ${quando(t - 41 * DIA)})`;

    const evento = (tenant: number | null, id: string, ev: string, payload: unknown, outcome: string | null, em: Date) =>
      sql`INSERT INTO webhook_events (tenant_id, gateway_event_id, event, payload, outcome, received_at)
          VALUES (${tenant}, ${id}, ${ev}, ${JSON.stringify(payload)}::text::jsonb, ${outcome}, ${em.toISOString()}::timestamptz)`;
    const pagamento = (id: string, extra: Record<string, unknown> = {}) => ({ payment: { id, value: 100, billingType: 'CREDIT_CARD', ...extra } });
    await evento(1, 'evt_1', 'PAYMENT_CONFIRMED', pagamento('pay_1', { customer: 'cus_1' }), 'em dia: pagamento confirmado', ESTE_MES);
    await evento(1, 'evt_2', 'PAYMENT_RECEIVED', pagamento('pay_1'), 'em dia: pagamento recebido', new Date(t - 1000));
    await evento(6, 'evt_3', 'PAYMENT_CONFIRMED', pagamento('pay_6'), 'em dia: pagamento confirmado', ESTE_MES);
    await evento(1, 'evt_4', 'PAYMENT_CONFIRMED', pagamento('pay_velho'), 'em dia: pagamento confirmado', MES_PASSADO);
    await evento(null, 'evt_5', 'PAYMENT_CONFIRMED', { payment: { id: 'pay_x', value: 100, customer: { cpfCnpj: '12345678900', email: 'dono@segredo.test' } } },
      'sem barbearia: nenhuma chave do evento casou', ESTE_MES);
    await evento(5, 'evt_6', 'PAYMENT_OVERDUE', pagamento('pay_5'), 'atrasada desde a primeira falha', ESTE_MES);
    await evento(5, 'evt_7', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', pagamento('pay_5'), 'continua atrasada desde a primeira falha', ESTE_MES);
    await evento(1, 'evt_8', 'CHECKOUT_PAID', { checkout: { id: 'chk_1', customerData: { name: 'Dono em-dia', cpfCnpj: '12345678900', email: 'dono@segredo.test' } } },
      'em dia: cartão cadastrado', new Date(t - 35 * DIA));
    await evento(1, 'evt_9', 'SUBSCRIPTION_CREATED', { subscription: { id: 'sub_1' } }, 'assinatura ligada à barbearia', new Date(t - 35 * DIA));
    await evento(8, 'evt_10', 'PAYMENT_CONFIRMED', pagamento('pay_8'), 'nada muda: a barbearia está cancelled', ESTE_MES);
    await evento(null, 'evt_11', 'ACCOUNT_STATUS_UPDATED', {}, 'guardado', ESTE_MES);
    await sql`INSERT INTO avisos_enviados (tenant_id, tipo, referencia, enviado_em)
              VALUES (4, 'teste-acabou', ${iso(t - DIA)}::timestamptz, ${iso(t - 20 * 3600_000)}::timestamptz)`;
    await sql`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip, criada_em) VALUES
      (NULL, 'entrou', '{}', '10.0.0.1', ${iso(t - 3 * DIA)}),
      (2, 'estendeu-teste', ${JSON.stringify({ dias: 3, depois: iso(t + 2 * DIA) })}::text::jsonb, '10.0.0.1', ${iso(t - 3 * DIA + 60_000)})`;

    ({ POST: ACAO } = await import('../src/pages/api/operador/acao.ts'));
    barbearias = await import('../src/lib/operadorBarbearias.js');
    numeros = await import('../src/lib/operadorNumeros.js');
    sistema = await import('../src/lib/operadorSistema.js');
    cookie = (await cookieDoOperador({ ...process.env, OPERADOR_SENHA_HASH: HASH, PAINEL_URL })).split(';')[0];
  }, 60_000);

  afterAll(async () => {
    if (antes.hash === undefined) delete process.env.OPERADOR_SENHA_HASH; else process.env.OPERADOR_SENHA_HASH = antes.hash;
    if (antes.painel === undefined) delete process.env.PAINEL_URL; else process.env.PAINEL_URL = antes.painel;
    await sql.end({ timeout: 5 });
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });

  const semDadoDeCliente = (o: unknown) => {
    const tudo = JSON.stringify(o);
    for (const d of DADOS_DE_CLIENTE) expect(tudo, d).not.toContain(d);
  };

  // ── O Início ──

  it('o Início: as fases, quem paga, o previsto e o confirmado — cada pagamento uma vez, só deste mês', async () => {
    const n = await numeros.numerosDoNegocio(AGORA, { ASAAS_API_KEY: 'chave-de-teste' });
    expect(n.resumo).toEqual({ total: 8, noAr: 6, ativa: 2, teste: 2, carencia: 2, suspensa: 1, cancelada: 1 });
    expect(n.pagando).toBe(1);
    expect(n.cancelando).toBe(1);
    expect(n.receitaPrevista).toBe(100);
    // pay_1 (confirmado e recebido: uma vez), pay_6 e pay_8 — o da encerrada é dinheiro
    // que entrou, e está em "pede olho". Fora: o do mês passado e o sem barbearia.
    expect(n.pagamentosDoMes).toEqual({ total: 300, quantos: 3 });
    expect(n.cobranca).toEqual({ ligada: true, ambiente: 'sandbox' });
    semDadoDeCliente(n);
  });

  it('o Início: a conversão do teste, os cadastros, e o que pede atenção', async () => {
    const n = await numeros.numerosDoNegocio(AGORA, {});
    // Passaram do teste: em-dia, carencia-teste, atrasada, cancelou, vencida. Cadastraram o cartão: em-dia, atrasada, cancelou.
    expect(n.conversao).toEqual({ terminaram: 5, cadastraramCartao: 3 });
    expect(n.cadastros.ultimos7Dias).toBe(2);
    expect(n.cadastros.ultimos30Dias).toBe(4);
    expect(n.cadastros.porSemana).toHaveLength(8);
    // As oito semanas cobrem de 49 a 55 dias: entram as de 1, 5, 8, 27 e 40 dias.
    expect(n.cadastros.porSemana.reduce((s, x) => s + x.quantos, 0)).toBe(5);

    const porBarbearia = n.atencao.filter((i) => i.tenantId !== null);
    expect(porBarbearia.map((i) => i.tenantId).sort()).toEqual([2, 4, 5, 6]);
    const texto = (id: number) => porBarbearia.find((i) => i.tenantId === id)?.texto ?? '';
    expect(texto(2)).toMatch(/^O teste vai até \d\d\/\d\d, e ainda não cadastrou o cartão$/);
    expect(texto(4)).toMatch(/^O teste venceu sem cartão — sai do ar depois de \d\d\/\d\d$/);
    expect(texto(5)).toMatch(/^A cobrança falhou — sai do ar depois de \d\d\/\d\d$/);
    expect(texto(6)).toMatch(/^Cancelou a assinatura — fica no ar até \d\d\/\d\d$/);
    expect(porBarbearia.find((i) => i.tenantId === 2)).toMatchObject({ href: '/operador/barbearias/2', telefoneDoDono: '84990000002' });
    // O que vence primeiro, primeiro. A lista das barbearias vem da mais nova para a
    // mais antiga — aqui, 2, 4, 5, 6 —, e quem cancelou sai amanhã: só a ordenação o
    // põe na frente do teste que acaba em 2 dias e das duas carências, que acabam depois.
    expect(porBarbearia.map((i) => i.tenantId).slice(0, 2)).toEqual([6, 2]);
    expect(porBarbearia.slice(2).map((i) => i.tenantId).sort()).toEqual([4, 5]);
    // E a Asaas no fim: dois eventos que o sistema não resolveu.
    expect(n.pedemOlho).toBe(2);
    expect(n.atencao[n.atencao.length - 1]).toMatchObject({ tenantId: null, href: '/operador/cobranca', texto: '2 eventos da Asaas que o sistema não resolveu sozinho' });
    expect(n.ultimasAcoes.map((a) => a.acao)).toEqual(['estendeu-teste', 'entrou']);
    semDadoDeCliente(n);
  });

  // ── A Cobrança ──

  it('a Cobrança: as assinaturas, as falhas do mês — cada cobrança uma vez — e os que pedem olho', async () => {
    const c = await numeros.cobrancaNoPainel({}, AGORA, {});
    expect(c.ligada).toBe(false);
    expect(c.assinaturasEmVigor).toBe(2);   // em-dia e atrasada; quem cancelou não conta
    expect(c.atrasadas).toBe(1);
    expect(c.cancelando).toBe(1);
    expect(c.falhasDoMes).toBe(1);          // vencida e recusada: a mesma cobrança, pay_5
    expect(c.pagamentosDoMes).toEqual({ total: 300, quantos: 3 });
    expect(c.pedemOlho.map((e) => e.idNaAsaas).sort()).toEqual(['evt_10', 'evt_5']);
    expect(c.eventos).toHaveLength(11);
    expect(c.eventos[0].idNaAsaas).toBe('evt_11');               // mais novo primeiro
    expect(c.eventos.filter((e) => e.pedeOlho).map((e) => e.idNaAsaas).sort()).toEqual(['evt_10', 'evt_5']);
    const pago = c.eventos.find((e) => e.idNaAsaas === 'evt_1');
    expect(pago).toMatchObject({ valor: 100, meio: 'CREDIT_CARD', tenantId: 1, nome: 'Em Dia (no site)', grupo: 'pagamentos' });
    expect(c.eventos.find((e) => e.idNaAsaas === 'evt_8')).toMatchObject({ valor: null, meio: null, grupo: 'checkout' });
    expect(c.proximo).toBeNull();
    semDadoDeCliente(c);
  });

  it('a Cobrança: os filtros e as páginas', async () => {
    const ids = async (o: Parameters<typeof numeros.cobrancaNoPainel>[0]) =>
      (await numeros.cobrancaNoPainel(o, AGORA, {})).eventos.map((e) => e.idNaAsaas);
    expect((await ids({ grupo: 'pagamentos' })).every((id) => !['evt_8', 'evt_9', 'evt_11'].includes(id))).toBe(true);
    expect(await ids({ grupo: 'checkout' })).toEqual(['evt_8']);
    expect(await ids({ grupo: 'assinaturas' })).toEqual(['evt_9']);
    expect(await ids({ grupo: 'outros' })).toEqual(['evt_11']);
    expect(await ids({ tenantId: 5 })).toEqual(['evt_7', 'evt_6']);
    const p1 = await numeros.cobrancaNoPainel({ limite: 4 }, AGORA, {});
    expect(p1.eventos).toHaveLength(4);
    expect(p1.proximo).toBe(p1.eventos[3].id);
    const p2 = await numeros.cobrancaNoPainel({ limite: 4, antesDe: p1.proximo! }, AGORA, {});
    expect(p2.eventos[0].id).toBe(p1.eventos[3].id - 1);
  });

  // ── A ficha ──

  it('a ficha: o dono, a assinatura, o uso — só contagens —, o site e a linha do tempo', async () => {
    const f = await barbearias.fichaDaBarbearia(1, AGORA);
    expect(f).not.toBeNull();
    expect(f!).toMatchObject({
      nome: 'Em Dia (no site)', cidade: 'Natal/RN',
      asaas: { cliente: 'cus_1', assinatura: 'sub_1' },
      equipe: { total: 3, ativos: 2 },
      servicos: { ativos: 2, comPreco: 1 },
      agendamentos: { total: 3, ultimos7Dias: 1, ultimos30Dias: 2, proximos: 1 },
      fotosNaGaleria: 3,
    });
    expect(f!.dono).toEqual({ nome: 'Dono em-dia', telefone: '84990000001', email: 'em-dia@dono.test' });
    expect(f!.completude.bloqueios).toEqual([]);
    expect(f!.completude.percentual).toBeGreaterThan(0);
    expect(f!.completude.percentual).toBeLessThan(100);

    const textos = f!.linhaDoTempo.map((e) => e.texto);
    expect(textos).toContain('Cadastrou a barbearia');
    expect(textos).toContain('O teste de 7 dias acabou');
    expect(textos).toContain('Primeiro agendamento');
    // `dinheiro` põe espaço inseparável entre o R$ e o número, como o Intl faz.
    expect(textos).toContain(`Pagamento confirmado — ${dinheiro(100)}`);
    expect(textos).toContain(`Pagamento recebido — ${dinheiro(100)}`);
    expect(dinheiro(100)).toMatch(/^R\$\s100,00$/);
    expect(textos).toContain('Cartão cadastrado');
    expect(textos).toContain('Assinatura criada');
    const datas = f!.linhaDoTempo.map((e) => e.quando.getTime());
    expect(datas).toEqual([...datas].sort((a, b) => b - a));   // mais novo primeiro
    semDadoDeCliente(f);
  });

  it('a ficha: o que impede o site de funcionar, os e-mails ao dono e as ações do operador', async () => {
    const semServico = await barbearias.fichaDaBarbearia(2, AGORA);
    expect(semServico!.completude.bloqueios.map((b) => b.id)).toEqual(['servicos', 'agenda']);
    expect(semServico!.linhaDoTempo.some((e) => e.origem === 'operador' && /^Estendeu o teste de teste-acabando em 3 dias/.test(e.texto))).toBe(true);
    const comAviso = await barbearias.fichaDaBarbearia(4, AGORA);
    expect(comAviso!.linhaDoTempo.map((e) => e.texto)).toContain('E-mail ao dono: o teste acabou');
    expect(await barbearias.fichaDaBarbearia(999, AGORA)).toBeNull();
  });

  // ── A anotação ──

  it('anotar: só com a sessão de operador, e só no endereço do painel', async () => {
    expect((await agir({ acao: 'anotar', barbearia: 1, texto: 'oi' }, { cookie: '' })).status).toBe(401);
    expect((await agir({ acao: 'anotar', barbearia: 1, texto: 'oi' }, { host: 'em-dia.test' })).status).toBe(404);
    expect(await sql`SELECT 1 FROM acoes_do_operador WHERE acao = 'anotou'`).toHaveLength(0);
  });

  it('anotar: texto vazio, longo demais ou barbearia que não existe — recusado, sem registro', async () => {
    const recusa = async (corpo: Record<string, unknown>, status: number, mensagem: RegExp) => {
      const r = await agir(corpo);
      expect(r.status).toBe(status);
      expect((await r.json()).error).toMatch(mensagem);
    };
    await recusa({ acao: 'anotar', barbearia: 1, texto: '   \n  ' }, 400, /^Escreva a anotação\.$/);
    await recusa({ acao: 'anotar', barbearia: 1, texto: 'a'.repeat(1001) }, 400, /passa de 1000 caracteres/);
    await recusa({ acao: 'anotar', barbearia: 1, texto: 'a'.repeat(1300) }, 400, /vai até 1000 caracteres/);
    await recusa({ acao: 'anotar', barbearia: 999, texto: 'oi' }, 404, /não encontrada/);
    expect(await sql`SELECT 1 FROM acoes_do_operador WHERE acao = 'anotou'`).toHaveLength(0);
  });

  it('anotar: guarda o texto limpo, com o IP, e ele aparece na ficha e no registro — o mais novo primeiro', async () => {
    const r = await agir({ acao: 'anotar', barbearia: 1, texto: '  liguei dia 12\r\npaga sexta\n\n\n\nconfirmar  ' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, slug: 'em-dia' });
    expect((await agir({ acao: 'anotar', barbearia: 1, texto: 'pagou' })).status).toBe(200);
    const [linha] = await sql`SELECT tenant_id, detalhe, ip FROM acoes_do_operador WHERE acao = 'anotou' ORDER BY id LIMIT 1`;
    expect(linha).toEqual({ tenant_id: 1, detalhe: { texto: 'liguei dia 12\npaga sexta\n\nconfirmar' }, ip: '10.0.0.9' });

    const f = await barbearias.fichaDaBarbearia(1, AGORA);
    expect(f!.anotacoes.map((a) => a.texto)).toEqual(['pagou', 'liguei dia 12\npaga sexta\n\nconfirmar']);
    // A anotação tem o quadro dela: não se repete na linha do tempo.
    expect(f!.linhaDoTempo.some((e) => e.texto.startsWith('Anotou'))).toBe(false);

    const so = await barbearias.registro({ filtro: 'anotacoes' });
    expect(so.itens.map((a) => barbearias.descreverAcao(a))).toEqual(['Anotou em em-dia: pagou', 'Anotou em em-dia: liguei dia 12 paga sexta confirmar']);
  });

  it('o registro: os filtros, a barbearia e as páginas', async () => {
    const acoes = (o: Parameters<typeof barbearias.registro>[0]) => barbearias.registro(o).then((r) => r.itens.map((a) => a.acao));
    expect(await acoes({ filtro: 'entradas' })).toEqual(['entrou']);
    expect(await acoes({ filtro: 'acoes' })).toEqual(['estendeu-teste']);
    expect(await acoes({ tenantId: 1 })).toEqual(['anotou', 'anotou']);
    expect(await acoes({ tenantId: 2 })).toEqual(['estendeu-teste']);
    const p1 = await barbearias.registro({ limite: 2 });
    expect(p1.itens).toHaveLength(2);
    expect(p1.proximo).toBe(p1.itens[1].id);
    const p2 = await barbearias.registro({ limite: 2, antesDe: p1.proximo! });
    expect(p2.itens.map((a) => a.acao)).toEqual(['estendeu-teste', 'entrou']);
    expect(p2.proximo).toBeNull();
    expect(p1.itens[0]).toMatchObject({ tenantId: 1, nome: 'Em Dia (no site)', slug: 'em-dia', ip: '10.0.0.9' });
  });

  // ── O Sistema ──

  it('o Sistema: o banco responde, quem conecta, as migrations — e nenhum segredo', async () => {
    const env = {
      ...SEGREDOS, OPERADOR_SENHA_HASH: HASH, BACKUP_DIR: '/caminho/que/nao/existe', NODE_ENV: 'production',
      DATABASE_URL: 'postgres://fadeline:SEGREDO-senha-do-banco@banco.test:5432/fadeline',
    };
    const s = await sistema.sistemaNoPainel(env, AGORA);
    expect(s.banco.responde).toBe(true);
    expect(s.banco.versao).toMatch(/^\d+/);
    expect(s.banco.usuario).toBeTruthy();
    // O banco dos testes nasce de `tests/migrations.ts`, sem `schema_migrations`.
    expect(s.migracoes).toEqual({ aplicadas: 0, ultima: null, em: null, noBuild: listarMigrations().length });
    expect(s.alertas.map((a) => a.texto)).toContain(`Faltam migrations: o banco tem 0 de ${listarMigrations().length}.`);
    const tudo = JSON.stringify(s);
    expect(tudo).not.toMatch(/SEGREDO/);
    expect(tudo).not.toContain(HASH);

    // Com o registro do boot: todas aplicadas, sem o alerta.
    await sql`CREATE TABLE schema_migrations (nome text PRIMARY KEY, hash text NOT NULL, aplicada_em timestamptz NOT NULL DEFAULT now())`;
    for (const m of listarMigrations()) await sql`INSERT INTO schema_migrations (nome, hash) VALUES (${m}, 'x')`;
    const depois = await sistema.sistemaNoPainel(env, AGORA);
    expect(depois.migracoes?.aplicadas).toBe(listarMigrations().length);
    expect(depois.migracoes?.ultima).toBe(listarMigrations().at(-1));
    expect(depois.alertas.some((a) => a.texto.startsWith('Faltam migrations'))).toBe(false);
  });
});
