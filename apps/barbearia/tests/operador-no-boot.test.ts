// O boot de produção dizendo o que falta ao operador — `scripts/operadorNoBoot.mjs` e
// `conferirOperador` em `scripts/startup.mjs` (10/11/2026). Em 10/11, o cadastro rodou aberto sem o
// `OPERADOR_EMAIL` e o painel do operador entrava só com a senha: os dois só apareceram na tela de
// Sistema, que ninguém abre depois de cada deploy.
//
// O script roda com `node` puro e tem as suas próprias formas; estes casos passam os mesmos valores
// pelas duas pontas — a do boot e a do app — e reprovam quando elas discordam.
//
// O boot de verdade precisa de banco; o resto, não.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { conferenciaDoOperador, emailDoOperadorValido, estadoDoCodigo, senhaDoOperadorValida } from '../scripts/operadorNoBoot.mjs';
import { paraBase32, segredoNovo } from '../scripts/totp.mjs';
import { emailDoOperador } from '../src/lib/avisoAoOperador';
import { gerarHash, lerHash } from '../src/lib/operador';
import { lerSegundoFator } from '../src/lib/segundoFator';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let HASH = '';
const CODIGO = `totp:${paraBase32(segredoNovo())}`;
beforeAll(async () => { HASH = await gerarHash('frase do operador no boot 2026', 14); }, 30_000);

/** O app escreve uma linha no log quando lê valor torto; aqui, só atrapalha a leitura. */
function calado<T>(f: () => T): T {
  const erro = console.error;
  console.error = () => {};
  try { return f(); } finally { console.error = erro; }
}

describe('as formas do boot são as do app', () => {
  it('o OPERADOR_EMAIL', () => {
    const valores = [
      undefined, '', '   ', 'operador@fadeline.com.br', '  Operador@Fadeline.com.br  ', 'sem-arroba', 'a@b', 'a@b.c',
      'dois@@b.com', 'com espaço@b.com', `${'a'.repeat(250)}@b.co`, `${'a'.repeat(249)}@b.co`, '<a@b.com>',
    ];
    for (const v of valores) {
      const env = { OPERADOR_EMAIL: v };
      expect(emailDoOperadorValido(env), String(v)).toBe(emailDoOperador(env) !== null);
    }
    // Controle: a tabela tem os dois lados.
    expect(valores.filter((v) => emailDoOperadorValido({ OPERADOR_EMAIL: v })).length).toBeGreaterThan(1);
    expect(valores.filter((v) => !emailDoOperadorValido({ OPERADOR_EMAIL: v })).length).toBeGreaterThan(1);
  });

  it('o OPERADOR_SENHA_HASH', () => {
    const [, , , , sal, chave] = HASH.split(':');
    const valores = [
      undefined, '', HASH, `  ${HASH}  `, `"${HASH}"`, 'frase do operador no boot 2026', HASH.slice(0, -5),
      HASH.replace('scrypt:14:', 'scrypt:13:'), HASH.replace('scrypt:14:', 'scrypt:21:'), HASH.replace(':8:1:', ':0:1:'),
      HASH.replace(':8:1:', ':33:1:'), HASH.replace(':8:1:', ':8:5:'), HASH.replace(sal, sal.slice(0, 16)),
      HASH.replace(chave, chave.slice(0, 40)), `scrypt:20:32:4:${sal}:${chave}`,
    ];
    for (const v of valores) {
      expect(senhaDoOperadorValida({ OPERADOR_SENHA_HASH: v }), String(v)).toBe(calado(() => lerHash(v)) !== null);
    }
    expect(valores.filter((v) => senhaDoOperadorValida({ OPERADOR_SENHA_HASH: v })).length).toBeGreaterThan(1);
  });

  it('o OPERADOR_SEGUNDO_FATOR', () => {
    const doApp = { false: 'ausente', true: 'ligado', invalido: 'invalido' } as const;
    const valores = [
      undefined, '', '  ', CODIGO, `  ${CODIGO}  `, CODIGO.toLowerCase(), CODIGO.slice(0, 30), `"${CODIGO}"`,
      CODIGO.replace('totp:', ''), CODIGO.replace('totp:', 'totp: '), `${CODIGO}1`, 'totp:ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ];
    for (const v of valores) {
      const env = { OPERADOR_SEGUNDO_FATOR: v };
      expect(estadoDoCodigo(env), String(v)).toBe(doApp[String(calado(() => lerSegundoFator(env)).ligado) as keyof typeof doApp]);
    }
  });
});

describe('o que o boot diz', () => {
  const titulos = (env: Record<string, string | undefined>) => conferenciaDoOperador(env).avisos.map((a) => a.titulo);

  it('cadastro aberto sem o OPERADOR_EMAIL: o aviso, dizendo que o site espera e o dono ouviu um prazo', () => {
    const { avisos, certos } = conferenciaDoOperador({ CADASTRO_ABERTO: '1' });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].titulo).toBe('O CADASTRO ESTÁ ABERTO E O AVISO DE CADASTRO NOVO NÃO VAI PARA NINGUÉM');
    expect(avisos[0].detalhe).toMatch(/^Falta o OPERADOR_EMAIL\./);
    expect(avisos[0].detalhe).toMatch(/espera a sua aprovação, e o dono ouviu um prazo/);
    expect(certos).toEqual([]);
    // Torto, diz que está torto — e sem repetir o valor.
    const torto = conferenciaDoOperador({ CADASTRO_ABERTO: '1', OPERADOR_EMAIL: 'operador-sem-arroba' });
    expect(torto.avisos[0].detalhe).toMatch(/^O OPERADOR_EMAIL está fora da forma de e-mail\./);
    expect(JSON.stringify(torto)).not.toContain('operador-sem-arroba');
    // Sem a aprovação, o site nasce no ar: não há prazo a dizer.
    const semAprovacao = conferenciaDoOperador({ CADASTRO_ABERTO: '1', SITE_SEM_APROVACAO: '1' });
    expect(semAprovacao.avisos[0].detalhe).not.toMatch(/prazo|espera/);
  });

  it('cadastro aberto com o OPERADOR_EMAIL: a linha de certo, sem o endereço', () => {
    const r = conferenciaDoOperador({ CADASTRO_ABERTO: '1', OPERADOR_EMAIL: 'operador@fadeline.com.br' });
    expect(r).toEqual({ avisos: [], certos: ['cadastro aberto: cada cadastro novo avisa o OPERADOR_EMAIL'] });
  });

  it('cadastro fechado: nada a dizer do aviso, com ou sem o OPERADOR_EMAIL', () => {
    expect(conferenciaDoOperador({})).toEqual({ avisos: [], certos: [] });
    expect(conferenciaDoOperador({ CADASTRO_ABERTO: '0' })).toEqual({ avisos: [], certos: [] });
    expect(conferenciaDoOperador({ CADASTRO_ABERTO: '1 ' }).avisos).toEqual([]); // o app também lê só o '1' exato
  });

  it('a senha sem o código: o aviso de que o painel entra só com a senha', () => {
    expect(titulos({ OPERADOR_SENHA_HASH: HASH })).toEqual(['O PAINEL DO OPERADOR ENTRA SÓ COM A SENHA']);
    expect(conferenciaDoOperador({ OPERADOR_SENHA_HASH: HASH }).avisos[0].detalhe).toMatch(/npm run operador:segundo-fator/);
  });

  it('a senha e o código: a linha de certo', () => {
    expect(conferenciaDoOperador({ OPERADOR_SENHA_HASH: HASH, OPERADOR_SEGUNDO_FATOR: CODIGO }))
      .toEqual({ avisos: [], certos: ['painel do operador: pede a senha e o código do celular'] });
  });

  it('o código torto: o painel não abre — não é "só a senha"', () => {
    expect(titulos({ OPERADOR_SENHA_HASH: HASH, OPERADOR_SEGUNDO_FATOR: CODIGO.toLowerCase() }))
      .toEqual(['O OPERADOR_SEGUNDO_FATOR ESTÁ FORA DO FORMATO — O PAINEL DO OPERADOR NÃO ABRE']);
  });

  it('a senha torta: o painel não abre, e o código nem entra na conversa', () => {
    expect(titulos({ OPERADOR_SENHA_HASH: 'a senha colada no lugar do hash' }))
      .toEqual(['O OPERADOR_SENHA_HASH ESTÁ FORA DO FORMATO — O PAINEL DO OPERADOR NÃO ABRE']);
    expect(titulos({ OPERADOR_SENHA_HASH: 'a senha colada no lugar do hash', OPERADOR_SEGUNDO_FATOR: CODIGO }))
      .toEqual(['O OPERADOR_SENHA_HASH ESTÁ FORA DO FORMATO — O PAINEL DO OPERADOR NÃO ABRE']);
  });

  it('sem a senha, o painel está desligado de propósito: nada a dizer do código', () => {
    expect(conferenciaDoOperador({ OPERADOR_SEGUNDO_FATOR: CODIGO })).toEqual({ avisos: [], certos: [] });
  });

  it('nenhuma linha repete um valor', () => {
    const tudo = JSON.stringify([
      conferenciaDoOperador({ CADASTRO_ABERTO: '1', OPERADOR_EMAIL: 'operador@fadeline.com.br', OPERADOR_SENHA_HASH: HASH, OPERADOR_SEGUNDO_FATOR: CODIGO }),
      conferenciaDoOperador({ OPERADOR_SENHA_HASH: HASH, OPERADOR_SEGUNDO_FATOR: CODIGO.toLowerCase() }),
    ]);
    for (const segredo of ['operador@fadeline.com.br', HASH.split(':')[4], CODIGO.slice(5), CODIGO.slice(5).toLowerCase()]) {
      expect(tudo).not.toContain(segredo);
    }
  });
});

describe.skipIf(!TEM_BANCO)('o boot de produção, de verdade', () => {
  let sql: postgres.Sql;
  let pasta: string;
  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    pasta = mkdtempSync(join(tmpdir(), 'operador-boot-'));
  });
  afterAll(async () => {
    await sql.end({ timeout: 5 });
    rmSync(pasta, { recursive: true, force: true });
  });

  async function boot(env: Record<string, string | undefined>) {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    return new Promise<string>((resolve) => {
      const p = spawn(process.execPath, ['scripts/startup.mjs'], {
        env: {
          ...process.env, NODE_ENV: 'production', BACKUP_DIR: pasta, DOMINIO_BASE: 'fadeline.com.br', TZ_BARBEARIA: undefined,
          SMTP_URL: undefined, CADASTRO_ABERTO: undefined, OPERADOR_EMAIL: undefined, OPERADOR_SENHA_HASH: undefined,
          OPERADOR_SEGUNDO_FATOR: undefined, SITE_SEM_APROVACAO: undefined, ...env,
        },
      });
      let saida = '';
      p.stdout.on('data', (d) => { saida += d; });
      p.stderr.on('data', (d) => { saida += d; });
      p.on('close', () => resolve(saida));
    });
  }

  it('o que falta sai no log, em caixa, sem o valor', async () => {
    const saida = await boot({ CADASTRO_ABERTO: '1', OPERADOR_SENHA_HASH: HASH });
    expect(saida).toContain('O CADASTRO ESTÁ ABERTO E O AVISO DE CADASTRO NOVO NÃO VAI PARA NINGUÉM');
    expect(saida).toContain('O PAINEL DO OPERADOR ENTRA SÓ COM A SENHA');
    expect(saida).not.toContain(HASH.split(':')[4]);
    expect(saida).not.toMatch(/✓ (cadastro aberto|painel do operador)/);
  }, 60_000);

  it('o que está certo sai como linha de certo', async () => {
    const saida = await boot({ CADASTRO_ABERTO: '1', OPERADOR_EMAIL: 'operador@fadeline.com.br', OPERADOR_SENHA_HASH: HASH, OPERADOR_SEGUNDO_FATOR: CODIGO });
    expect(saida).toContain('✓ cadastro aberto: cada cadastro novo avisa o OPERADOR_EMAIL');
    expect(saida).toContain('✓ painel do operador: pede a senha e o código do celular');
    expect(saida).not.toContain('operador@fadeline.com.br');
    expect(saida).not.toContain(CODIGO.slice(5));
  }, 60_000);
});
