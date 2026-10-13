// O segundo fator do painel do operador — o código de 6 dígitos do aplicativo
// (`src/lib/segundoFator.ts`, 13/10/2026).
//
// O QUE ISTO IMPEDE DE VOLTAR
//
// 1. A conta do código divergir da dos aplicativos: os exemplos da própria RFC 6238.
// 2. O script que liga (`scripts/operador-segundo-fator.mjs`) e o app fazerem contas
//    diferentes — o script imprimiria uma variável que nunca deixa entrar.
// 3. A variável torta virar "só a senha" sem ninguém saber: desliga o painel.
// 4. Ligar ou trocar o segundo fator deixar sessões antigas vivas.
// 5. O mesmo código entrar duas vezes.
//
// A parte de entrar pela rota precisa de Postgres (a entrada é gravada); o resto, não.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import {
  codigoDoPasso, conferirCodigo, deBase32, esquecerCodigosUsados, lerSegundoFator, passoDe,
  VARIAVEL_DO_SEGUNDO_FATOR,
} from '../src/lib/segundoFator';
import { cookieDoOperador, gerarHash, operadorAutenticado, pedeCodigo, portaoDoOperador } from '../src/lib/operador';
import * as doScript from '../scripts/totp.mjs';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

/** O segredo dos exemplos da RFC 6238 (SHA-1): "12345678901234567890". */
const SEGREDO_DA_RFC = Buffer.from('12345678901234567890', 'ascii');
/** Os exemplos da RFC, em segundos → código de 8 dígitos; os 6 da direita são o de 6. */
const EXEMPLOS_DA_RFC: [number, string][] = [
  [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
  [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
];

const SENHA = 'frase de teste do operador 2026';
const HOST = 'painel.test';
const PAINEL_URL = `http://${HOST}`;
let HASH = '';
beforeAll(async () => { HASH = await gerarHash(SENHA, 14); }, 30_000);

const variavelDe = (bytes: Buffer) => `totp:${doScript.paraBase32(bytes)}`;
const ligado = (env: Record<string, string>) => {
  const f = lerSegundoFator(env);
  if (f.ligado !== true) throw new Error('segundo fator não ligou');
  return f;
};

describe('a conta do código — a mesma dos aplicativos, e a mesma no app e no script', () => {
  it('os exemplos da RFC 6238', () => {
    for (const [segundos, oito] of EXEMPLOS_DA_RFC) {
      const passo = passoDe(segundos * 1000);
      expect(codigoDoPasso(SEGREDO_DA_RFC, passo), String(segundos)).toBe(oito.slice(-6));
      expect(doScript.codigoDoPasso(SEGREDO_DA_RFC, passo), `script ${segundos}`).toBe(oito.slice(-6));
    }
  });

  it('o base32 do script volta igual no app — para qualquer segredo', () => {
    for (let i = 0; i < 50; i++) {
      const bytes = doScript.segredoNovo() as Buffer;
      expect(bytes).toHaveLength(20);
      expect(deBase32(doScript.paraBase32(bytes))).toEqual(bytes);
    }
    // O exemplo de sempre da RFC 4648.
    expect(doScript.paraBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(deBase32('MZXW6YTBOI')?.toString()).toBe('foobar');
  });
});

describe('a variável', () => {
  it('sem ela, desligado — e a tela de entrar não pede código', () => {
    expect(lerSegundoFator({})).toEqual({ ligado: false });
    expect(lerSegundoFator({ [VARIAVEL_DO_SEGUNDO_FATOR]: '  ' })).toEqual({ ligado: false });
    expect(pedeCodigo({})).toBe(false);
  });

  it('a linha que o script imprime liga', () => {
    const env = { [VARIAVEL_DO_SEGUNDO_FATOR]: variavelDe(doScript.segredoNovo()) };
    expect(lerSegundoFator(env).ligado).toBe(true);
    expect(pedeCodigo(env)).toBe(true);
  });

  it('fora do formato é INVÁLIDO — e o painel do operador fica desligado, não só com a senha', () => {
    const erro = console.error;
    console.error = () => {};
    try {
      for (const torta of ['JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'totp:jbswy3dpehpk3pxpjbswy3dpehpk3pxp', 'totp:JBSWY3DP', 'totp:JBSWY3DPEHPK3PXP1BSWY3DPEHPK3PXP', 'totp: JBSWY3DPEHPK3PXP']) {
        const env = { OPERADOR_SENHA_HASH: HASH, PAINEL_URL, [VARIAVEL_DO_SEGUNDO_FATOR]: torta };
        expect(lerSegundoFator(env).ligado, torta).toBe('invalido');
        expect(portaoDoOperador(new Request(`${PAINEL_URL}/operador`, { headers: { host: HOST } }), env), torta).toBe('desligado');
      }
    } finally {
      console.error = erro;
    }
  });
});

describe('conferirCodigo()', () => {
  beforeEach(() => esquecerCodigosUsados());
  const env = { [VARIAVEL_DO_SEGUNDO_FATOR]: variavelDe(SEGREDO_DA_RFC.subarray(0, 20)) };

  it('vale o de agora e o de 30 segundos para cada lado — o relógio torto do celular', () => {
    const f = ligado(env);
    const agora = 1_760_000_000_000;
    const passo = passoDe(agora);
    expect(conferirCodigo(codigoDoPasso(f.segredo, passo - 1), f, agora)).toBe(true);
    esquecerCodigosUsados();
    expect(conferirCodigo(codigoDoPasso(f.segredo, passo), f, agora)).toBe(true);
    esquecerCodigosUsados();
    expect(conferirCodigo(codigoDoPasso(f.segredo, passo + 1), f, agora)).toBe(true);
    esquecerCodigosUsados();
    expect(conferirCodigo(codigoDoPasso(f.segredo, passo - 2), f, agora)).toBe(false);
    expect(conferirCodigo(codigoDoPasso(f.segredo, passo + 2), f, agora)).toBe(false);
  });

  it('o mesmo código não entra duas vezes — nem um mais velho, depois de um mais novo', () => {
    const f = ligado(env);
    const agora = 1_760_000_000_000;
    const passo = passoDe(agora);
    const deAgora = codigoDoPasso(f.segredo, passo);
    expect(conferirCodigo(deAgora, f, agora)).toBe(true);
    expect(conferirCodigo(deAgora, f, agora)).toBe(false);
    expect(conferirCodigo(codigoDoPasso(f.segredo, passo - 1), f, agora)).toBe(false);
    // 30 segundos depois, o código seguinte entra.
    expect(conferirCodigo(codigoDoPasso(f.segredo, passo + 1), f, agora + 30_000)).toBe(true);
  });

  it('espaço no meio vale ("123 456", como o aplicativo mostra); letra e tamanho errado, não', () => {
    const f = ligado(env);
    const agora = 1_760_000_000_000;
    const c = codigoDoPasso(f.segredo, passoDe(agora));
    expect(conferirCodigo('12345', f, agora)).toBe(false);
    expect(conferirCodigo('abcdef', f, agora)).toBe(false);
    expect(conferirCodigo(`${c}0`, f, agora)).toBe(false);
    expect(conferirCodigo(`${c.slice(0, 3)} ${c.slice(3)}`, f, agora)).toBe(true);
  });
});

describe('a sessão nasce do segundo fator também', () => {
  const pedido = (cookie: string) => new Request(`${PAINEL_URL}/operador`, { headers: { host: HOST, cookie } });
  const valor = (setCookie: string) => setCookie.split(';')[0];

  it('ligar o segundo fator derruba quem entrou só com a senha; trocar o segredo, também', async () => {
    const semFator = { OPERADOR_SENHA_HASH: HASH, PAINEL_URL, SESSION_SECRET: process.env.SESSION_SECRET! };
    const comFator = { ...semFator, [VARIAVEL_DO_SEGUNDO_FATOR]: variavelDe(doScript.segredoNovo()) };
    const outroFator = { ...semFator, [VARIAVEL_DO_SEGUNDO_FATOR]: variavelDe(doScript.segredoNovo()) };

    const antigo = valor(await cookieDoOperador(semFator));
    expect(await operadorAutenticado(pedido(antigo), semFator)).toBe(true);
    expect(await operadorAutenticado(pedido(antigo), comFator)).toBe(false);

    const novo = valor(await cookieDoOperador(comFator));
    expect(await operadorAutenticado(pedido(novo), comFator)).toBe(true);
    expect(await operadorAutenticado(pedido(novo), outroFator)).toBe(false);
    // E tirar o segundo fator também derruba: a sessão é da porta que existia quando nasceu.
    expect(await operadorAutenticado(pedido(novo), semFator)).toBe(false);
  });
});

describe('o script `npm run operador:segundo-fator`', () => {
  /** Roda o script com um código calculado na hora, a partir da chave que ele mostra. */
  function rodar(responder: (chave: string) => string[]): Promise<{ codigo: number | null; saida: string; erros: string }> {
    return new Promise((ok) => {
      const filho = spawn(process.execPath, ['scripts/operador-segundo-fator.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let saida = '';
      let erros = '';
      let respondeu = false;
      filho.stdout.on('data', (d) => { saida += d; });
      filho.stderr.on('data', (d) => {
        erros += d;
        const m = erros.match(/chave: ([A-Z2-7 ]+?) {3}/);
        if (m && !respondeu) {
          respondeu = true;
          for (const linha of responder(m[1].replace(/ /g, ''))) filho.stdin.write(`${linha}\n`);
          filho.stdin.end();
        }
      });
      filho.on('close', (codigo) => ok({ codigo, saida, erros }));
    });
  }

  it('com o código certo, imprime UMA linha — a variável que o app aceita, do mesmo segredo', async () => {
    let chaveMostrada = '';
    const r = await rodar((chave) => {
      chaveMostrada = chave;
      return [codigoDoPasso(deBase32(chave)!, passoDe(Date.now()))];
    });
    expect(r.codigo).toBe(0);
    expect(r.saida).toBe(`OPERADOR_SEGUNDO_FATOR=totp:${chaveMostrada}\n`);
    const env = { [VARIAVEL_DO_SEGUNDO_FATOR]: r.saida.trim().split('=')[1] };
    expect(lerSegundoFator(env).ligado).toBe(true);
    // O QR e as instruções vão para a saída de erro: a de dados só tem a linha.
    expect(r.erros).toContain('leia este QR code');
    expect(r.erros).toMatch(/[█▀▄]{7}/);
  }, 20_000);

  it('com o código errado três vezes, não imprime nada para o servidor', async () => {
    const r = await rodar(() => ['000000', '111111', '222222']);
    expect(r.codigo).toBe(1);
    expect(r.saida).toBe('');
    expect(r.erros).toContain('O código não conferiu. Nada foi gerado para o servidor');
  }, 20_000);
});

describe.skipIf(!TEM_BANCO)('entrar com o segundo fator ligado', () => {
  let sql: ReturnType<typeof postgres>;
  let ENTRAR: typeof import('../src/pages/api/operador/entrar.ts').POST;
  let rl: typeof import('../src/lib/rateLimit.js');
  const antes = {
    hash: process.env.OPERADOR_SENHA_HASH, painel: process.env.PAINEL_URL, fator: process.env[VARIAVEL_DO_SEGUNDO_FATOR],
  };
  const segredo = doScript.segredoNovo() as Buffer;

  const entrar = (corpo: Record<string, unknown>, ip = '10.0.9.1') => ENTRAR({
    request: new Request(`${PAINEL_URL}/api/operador/entrar`, {
      method: 'POST', headers: { host: HOST, 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(corpo),
    }),
    clientAddress: '127.0.0.1',
  } as never);
  const codigoDeAgora = () => codigoDoPasso(segredo, passoDe(Date.now()));

  beforeAll(async () => {
    process.env.OPERADOR_SENHA_HASH = HASH;
    process.env.PAINEL_URL = PAINEL_URL;
    process.env[VARIAVEL_DO_SEGUNDO_FATOR] = variavelDe(segredo);
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    ({ POST: ENTRAR } = await import('../src/pages/api/operador/entrar.ts'));
    rl = await import('../src/lib/rateLimit.js');
  }, 60_000);

  afterAll(async () => {
    const volta = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    volta('OPERADOR_SENHA_HASH', antes.hash);
    volta('PAINEL_URL', antes.painel);
    volta(VARIAVEL_DO_SEGUNDO_FATOR, antes.fator);
    await sql.end({ timeout: 5 });
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });

  beforeEach(async () => {
    esquecerCodigosUsados();
    await sql`DELETE FROM acoes_do_operador`;
    rl.resetRateLimit('operador-entrar:total');
    for (let i = 1; i <= 9; i++) rl.resetRateLimit(`operador-entrar:10.0.9.${i}`);
  });

  it('sem o código: 400, e nada é gravado', async () => {
    const r = await entrar({ senha: SENHA });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('Digite o código do aplicativo.');
    expect(await sql`SELECT 1 FROM acoes_do_operador`).toHaveLength(0);
  });

  it('a senha certa com o código errado não entra — e a resposta não diz qual dos dois errou', async () => {
    const avisos: string[] = [];
    const aviso = console.warn;
    console.warn = (m: string) => { avisos.push(String(m)); };
    try {
      const senhaErrada = await entrar({ senha: 'senha errada de teste', codigo: codigoDeAgora() });
      const codigoErrado = await entrar({ senha: SENHA, codigo: codigoDeAgora() === '000000' ? '111111' : '000000' });
      for (const r of [senhaErrada, codigoErrado]) {
        expect(r.status).toBe(401);
        expect(r.headers.get('set-cookie')).toBeNull();
        expect((await r.json()).error).toBe('Senha ou código errado.');
      }
      // O log diz: senha certa com código errado é o aviso de que a senha vazou.
      expect(avisos.some((a) => a.includes('senha CERTA e código errado'))).toBe(true);
    } finally {
      console.warn = aviso;
    }
    expect(await sql`SELECT 1 FROM acoes_do_operador`).toHaveLength(0);
  });

  it('a senha errada não gasta o código: o dono dele ainda entra com o mesmo', async () => {
    const codigo = codigoDeAgora();
    const aviso = console.warn;
    console.warn = () => {};
    try {
      expect((await entrar({ senha: 'senha errada de teste', codigo })).status).toBe(401);
    } finally {
      console.warn = aviso;
    }
    expect((await entrar({ senha: SENHA, codigo }, '10.0.9.2')).status).toBe(200);
  });

  it('senha e código certos: entra, com o cookie e a entrada gravada; o mesmo código, de novo, não', async () => {
    const codigo = codigoDeAgora();
    const r = await entrar({ senha: SENHA, codigo }, '10.0.9.3');
    expect(r.status).toBe(200);
    const setCookie = r.headers.get('set-cookie') ?? '';
    const pedido = new Request(`${PAINEL_URL}/operador`, { headers: { host: HOST, cookie: setCookie.split(';')[0] } });
    expect(await operadorAutenticado(pedido)).toBe(true);
    expect(await sql`SELECT acao, ip FROM acoes_do_operador ORDER BY id`).toEqual([{ acao: 'entrou', ip: '10.0.9.3' }]);

    const aviso = console.warn;
    console.warn = () => {};
    try {
      expect((await entrar({ senha: SENHA, codigo }, '10.0.9.4')).status).toBe(401);
    } finally {
      console.warn = aviso;
    }
  });
});
