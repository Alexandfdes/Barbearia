// O boot conferindo o `SMTP_URL` de verdade — `scripts/smtpUrl.mjs` e `conferirEmail` em
// `scripts/startup.mjs` (03/11/2026).
//
// Até aqui o boot dizia "✓ e-mail: SMTP configurado" só porque a variável existia. Na primeira
// configuração de produção, com sobra do modelo e depois com o servidor digitado errado, ele disse
// "configurado" nas duas vezes, e o erro só apareceu no log do primeiro envio. Estes casos seguram:
// o formato errado é dito no boot, com o motivo; o login recusado também; o certo diz "aceitou";
// e o valor — que tem a chave — nunca aparece na saída.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { problemaNoSmtpUrl, semSegredo, servidorDoSmtpUrl } from '../scripts/smtpUrl.mjs';
import { parseConnectionUrl } from 'nodemailer/lib/shared';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
const TEM_PGDUMP = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0;

const CHAVE = 'xsmtpsib-0123456789abcdef0123456789abcdef-AbCdEfGhIjKl';
const CERTO = `smtps://9a1b2c001%40smtp-brevo.com:${CHAVE}@smtp-relay.brevo.com:465`;

describe('o formato do SMTP_URL', () => {
  it('o formato do Brevo, com 465 ou 587, passa', () => {
    expect(problemaNoSmtpUrl(CERTO)).toBeNull();
    expect(problemaNoSmtpUrl(CERTO.replace('smtps://', 'smtp://').replace(':465', ':587'))).toBeNull();
    expect(problemaNoSmtpUrl(`  ${CERTO}  `)).toBeNull();
  });

  it.each([
    ['vazio', '', /vazio/],
    ['sobra do modelo', `smtps://<9a1b%40smtp-brevo.com>:<${CHAVE}>@<smtp-relay.brevo.com>:465`, /"<" ou ">"/],
    ['aspas', `"${CERTO}"`, /aspas/],
    ['espaço no meio', CERTO.replace('@smtp-relay', '@ smtp-relay'), /espaço/],
    ['sem o smtps://', CERTO.replace('smtps://', ''), /não começa com smtps:\/\//],
    ['barra na chave', CERTO.replace(CHAVE, 'abc/def'), /%2F/],
    ['cerquilha na chave', CERTO.replace(CHAVE, 'abc#def'), /%23/],
    ['interrogação na chave', CERTO.replace(CHAVE, 'abc?def'), /%3F/],
    // Chave que começa com número: a parte antes da "/" vira porta, o endereço é lido — e cortado.
    ['barra numa chave que começa com número', CERTO.replace(CHAVE, '465/abc'), /cortam o endereço.*%2F/],
    ['sem a chave', 'smtps://9a1b2c001%40smtp-brevo.com@smtp-relay.brevo.com:465', /falta o login ou a chave/],
    ['servidor sem ponto', CERTO.replace('smtp-relay.brevo.com', 'smtprelay'), /não parece um endereço/],
  ])('%s: diz o que está errado', (_, valor, motivo) => {
    expect(problemaNoSmtpUrl(valor)).toMatch(motivo);
  });

  it('nenhuma resposta repete a chave', () => {
    for (const v of [CERTO.replace('@smtp-relay', '@ smtp-relay'), CERTO.replace('smtp-relay.brevo.com', 'smtprelay'), `<${CERTO}>`]) {
      expect(problemaNoSmtpUrl(v)).not.toContain(CHAVE);
    }
  });

  it('o que o formato deixa passar, o nodemailer lê com servidor, login e chave', () => {
    // A conferência é a de um leitor (`new URL`); quem manda é o do nodemailer. Os dois têm de concordar.
    const o = parseConnectionUrl(CERTO);
    expect(o).toMatchObject({ secure: true, port: 465, host: 'smtp-relay.brevo.com', auth: { user: '9a1b2c001@smtp-brevo.com', pass: CHAVE } });
  });

  it('o servidor sai para o log; a chave sai da mensagem do provedor', () => {
    expect(servidorDoSmtpUrl(CERTO)).toBe('smtp-relay.brevo.com:465');
    expect(semSegredo(`Invalid login for 9a1b2c001@smtp-brevo.com with ${CHAVE}`, CERTO))
      .toBe('Invalid login for *** with ***');
  });
});

describe.skipIf(!TEM_BANCO || !TEM_PGDUMP)('o boot de produção, com o SMTP_URL', () => {
  let sql: postgres.Sql;
  let pasta: string;
  let servidor: Server;
  let porta = 0;
  let aceita = true;

  /** Um provedor de mentira: fala o bastante de SMTP para o `verify` do nodemailer. */
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    pasta = mkdtempSync(join(tmpdir(), 'smtp-boot-'));
    servidor = createServer((s) => {
      s.write('220 teste ESMTP\r\n');
      s.on('data', (d) => {
        for (const linha of d.toString().split('\r\n').filter(Boolean)) {
          if (/^(EHLO|HELO)/i.test(linha)) s.write('250-teste\r\n250 AUTH PLAIN LOGIN\r\n');
          else if (/^AUTH/i.test(linha)) s.write(aceita ? '235 2.7.0 ok\r\n' : '535 5.7.8 Authentication failed\r\n');
          else if (/^QUIT/i.test(linha)) { s.write('221 tchau\r\n'); s.end(); }
          else s.write('250 ok\r\n');
        }
      });
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
    porta = (servidor.address() as { port: number }).port;
  }, 30_000);

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await sql.end({ timeout: 5 });
    rmSync(pasta, { recursive: true, force: true });
  });

  /** O boot de verdade, sem travar o processo do teste — o provedor de mentira mora nele. */
  async function boot(smtpUrl: string) {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    return new Promise<string>((resolve) => {
      const p = spawn(process.execPath, ['scripts/startup.mjs'], {
        env: { ...process.env, NODE_ENV: 'production', BACKUP_DIR: pasta, SMTP_URL: smtpUrl, DOMINIO_BASE: 'fadeline.com.br', TZ_BARBEARIA: undefined },
      });
      let saida = '';
      p.stdout.on('data', (d) => { saida += d; });
      p.stderr.on('data', (d) => { saida += d; });
      p.on('close', () => resolve(saida));
    });
  }

  it('o provedor aceita o login: o boot diz que aceitou, e com qual servidor', async () => {
    aceita = true;
    const saida = await boot(`smtp://login%40teste.com:chave-secreta-123@127.0.0.1:${porta}`);
    expect(saida).toContain(`✓ e-mail: o provedor aceitou o login (127.0.0.1:${porta})`);
    expect(saida).not.toContain('chave-secreta-123');
  }, 60_000);

  it('o provedor recusa o login: o boot diz que recusou, com o motivo, sem a chave', async () => {
    aceita = false;
    const saida = await boot(`smtp://login%40teste.com:chave-secreta-123@127.0.0.1:${porta}`);
    expect(saida).toContain('O PROVEDOR DE E-MAIL RECUSOU');
    expect(saida).toMatch(/535/);
    expect(saida).not.toContain('✓ e-mail');
    expect(saida).not.toContain('chave-secreta-123');
  }, 60_000);

  it('o formato errado: o boot diz o que está errado, e nem tenta o provedor', async () => {
    const saida = await boot(`smtps://<login%40teste.com>:<chave-secreta-123>@<smtp-relay.brevo.com>:465`);
    expect(saida).toContain('O SMTP_URL ESTÁ ESCRITO ERRADO');
    expect(saida).toContain('sobra do modelo');
    expect(saida).not.toContain('✓ e-mail');
    expect(saida).not.toContain('chave-secreta-123');
  }, 60_000);
});
