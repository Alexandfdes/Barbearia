// O aviso ao operador do backup que não sobe para fora do servidor — `src/lib/avisoDoBackup.ts`
// (11/11/2026). Em 10/11 o envio para o Backblaze começou a ser recusado, e a falha passou mais de um
// dia num log que ninguém lê; a tela de Sistema acusava, mas só para quem a abria.
//
// Estes casos seguram: o aviso sai nas duas situações em que a tela diz "problema" — e só nelas —;
// uma vez por dia no calendário do operador, enquanto durar; com o motivo, numa linha; sem a trava
// gravada, nada sai; o envio que falha desfaz a trava; e a tarefa de hora em hora o roda.
//
// O aviso não precisa de banco; a tarefa, sim.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import {
  backupNoPainel, REGISTRO_DA_FALHA_DO_ENVIO, REGISTRO_DO_ENVIO_CERTO,
} from '../src/lib/backupNoDisco';
import { avisarBackupQueNaoSobe, MARCA_DO_AVISO_DO_BACKUP, textoDoAvisoDoBackup } from '../src/lib/avisoDoBackup';
import type { Email } from '../src/lib/email';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const HORA = 60 * 60 * 1000;
const MOTIVO = 'The request body was too small [IncompleteBody, HTTP 400, pedido b80c9e5a62ac4dae]';
const OPERADOR = 'operador@fadeline.com.br';

let pasta: string;
beforeEach(() => { pasta = mkdtempSync(join(tmpdir(), 'aviso-do-backup-')); });
afterEach(() => { rmSync(pasta, { recursive: true, force: true }); });

/** O ambiente de produção, com a pasta deste caso. */
const ambiente = (extra: Record<string, string> = {}) => ({
  BACKUP_DIR: pasta,
  S3_ENDPOINT: 'https://s3.exemplo.com', S3_BUCKET: 'backups', S3_ACCESS_KEY_ID: 'chave', S3_SECRET_ACCESS_KEY: 'segredo',
  OPERADOR_EMAIL: OPERADOR, PAINEL_URL: 'https://painel.fadeline.com.br', NODE_ENV: 'production',
  ...extra,
});

/** Os registros como o `scripts/backup.mjs` grava (`registrarEnvio`). */
const certo = (em: string) => writeFileSync(join(pasta, REGISTRO_DO_ENVIO_CERTO),
  `${JSON.stringify({ em, arquivos: ['barbearia_x.sql.gz'] })}\n`);
const falhou = (em: string, motivo = MOTIVO) => writeFileSync(join(pasta, REGISTRO_DA_FALHA_DO_ENVIO),
  `${JSON.stringify({ em, arquivo: 'barbearia_x.sql.gz', motivo })}\n`);
const trava = () => join(pasta, MARCA_DO_AVISO_DO_BACKUP);

/** Uma caixa de saída por caso, no lugar do envio de verdade. */
function caixa() {
  const enviados: Email[] = [];
  return { enviados, enviar: async (e: Email) => { enviados.push(e); } };
}

describe('quando sai', () => {
  it('falhou: o e-mail ao operador, com a hora da falha, o motivo, o último certo e a tela de Sistema', async () => {
    certo('2026-11-10T06:00:00.000Z'); // 10/11, 03:00 em Fortaleza
    falhou('2026-11-11T06:02:25.000Z'); // 11/11, 03:02
    const { enviados, enviar } = caixa();
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T07:00:00Z'), { env: ambiente(), enviar })).toBe(true);
    expect(enviados).toHaveLength(1);
    const [e] = enviados;
    expect(e).toMatchObject({ para: OPERADOR, barbearia: null, tipo: 'operador' });
    expect(e.assunto).toBe('O backup não está chegando ao armazenamento de fora');
    expect(e.texto).toContain('O envio do backup para fora do servidor falhou em 11/11 às 03:02:');
    expect(e.texto).toContain(`\n  ${MOTIVO}\n`);
    expect(e.texto).toContain('O último envio que deu certo: 10/11 às 03:00.');
    expect(e.texto).toContain('O backup continua sendo feito no disco do servidor.');
    expect(e.texto).toContain('https://painel.fadeline.com.br/operador/sistema');
    expect(e.texto).toContain('este aviso chega uma vez por dia');
  });

  it('parado: o último certo passou de 26 horas, sem falha depois — o texto diz há quantas', async () => {
    certo('2026-11-10T06:00:00.000Z');
    const { enviados, enviar } = caixa();
    // 26 horas certas ainda não é parado (a regra da tela: MAIS de 26).
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T08:00:00Z'), { env: ambiente(), enviar })).toBe(false);
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T09:00:00Z'), { env: ambiente(), enviar })).toBe(true);
    expect(enviados.map((e) => e.assunto)).toEqual(['O backup não sobe para fora do servidor há mais de um dia']);
    expect(enviados[0].texto).toContain('foi em 10/11 às 03:00, há 27 horas, e nenhuma falha foi registrada depois dele.');
    expect(enviados[0].texto).toContain('O backup diário pode não estar rodando');
    // Parado não promete o backup no disco: pode ser ele que parou.
    expect(enviados[0].texto).not.toContain('continua sendo feito');
  });

  it('não sai: o envio em dia, o certo depois da falha, nada registrado, sem as S3_* ou sem o OPERADOR_EMAIL', async () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    const { enviados, enviar } = caixa();
    // "Não sai" é decisão, não erro: nenhuma tentativa de envio desfeita no caminho.
    const erro = vi.spyOn(console, 'error');
    // Nada registrado: o estado de logo depois de ligar as S3_*, antes do primeiro diário.
    expect(await avisarBackupQueNaoSobe(agora, { env: ambiente(), enviar })).toBe(false);
    certo('2026-11-11T06:00:00.000Z');
    expect(await avisarBackupQueNaoSobe(agora, { env: ambiente(), enviar })).toBe(false);
    // A falha mais velha que o certo não conta: o envio que dá certo a apaga.
    falhou('2026-11-11T05:00:00.000Z');
    expect(await avisarBackupQueNaoSobe(agora, { env: ambiente(), enviar })).toBe(false);
    falhou('2026-11-11T07:00:00.000Z');
    expect(await avisarBackupQueNaoSobe(agora, { env: ambiente({ S3_SECRET_ACCESS_KEY: '' }), enviar })).toBe(false);
    expect(await avisarBackupQueNaoSobe(agora, { env: ambiente({ OPERADOR_EMAIL: '' }), enviar })).toBe(false);
    expect(await avisarBackupQueNaoSobe(agora, { env: ambiente({ OPERADOR_EMAIL: 'sem-arroba' }), enviar })).toBe(false);
    expect(enviados).toHaveLength(0);
    expect(existsSync(trava())).toBe(false);
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
    // Controle: com tudo no lugar, a mesma falha avisa.
    expect(await avisarBackupQueNaoSobe(agora, { env: ambiente(), enviar })).toBe(true);
  });
});

describe('uma vez por dia', () => {
  it('a mesma falha não repete no mesmo dia — e volta no dia seguinte, enquanto durar', async () => {
    falhou('2026-11-11T06:02:25.000Z');
    const { enviados, enviar } = caixa();
    const env = ambiente();
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T07:00:00Z'), { env, enviar })).toBe(true);
    // Até as 23:00 de Fortaleza (02:00 de 12/11 em UTC): o mesmo dia.
    for (let h = 1; h <= 19; h++) {
      expect(await avisarBackupQueNaoSobe(new Date(Date.parse('2026-11-11T07:00:00Z') + h * HORA), { env, enviar })).toBe(false);
    }
    // Uma falha nova no mesmo dia (o boot, ou o backup rodado à mão) também não repete.
    falhou('2026-11-11T21:05:11.000Z');
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T22:00:00Z'), { env, enviar })).toBe(false);
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-12T07:00:00Z'), { env, enviar })).toBe(true);
    expect(enviados).toHaveLength(2);
    expect(enviados[1].texto).toContain('falhou em 11/11 às 18:05');
    expect(JSON.parse(readFileSync(trava(), 'utf8'))).toMatchObject({ dia: '2026-11-12', situacao: 'falhou' });
  });

  it('o dia é o do operador, em Fortaleza — não o do UTC', async () => {
    falhou('2026-11-11T06:02:25.000Z');
    const { enviados, enviar } = caixa();
    const env = ambiente();
    // 23:30 de 11/11 em Fortaleza é 02:30 de 12/11 em UTC; 00:30 de 12/11 é 03:30.
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-12T02:30:00Z'), { env, enviar })).toBe(true);
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-12T03:30:00Z'), { env, enviar })).toBe(true);
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-12T04:30:00Z'), { env, enviar })).toBe(false);
    expect(enviados).toHaveLength(2);
  });

  it('a trava fica fora dos padrões do backup: a tela não a conta, e a retenção não a apaga', async () => {
    falhou('2026-11-11T06:02:25.000Z');
    const { enviar } = caixa();
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T07:00:00Z'), { env: ambiente(), enviar })).toBe(true);
    expect(MARCA_DO_AVISO_DO_BACKUP).not.toMatch(/\.sql\.gz$|-fotos\.tar\.gz$/);
    expect(readdirSync(pasta).sort()).toEqual([REGISTRO_DA_FALHA_DO_ENVIO, MARCA_DO_AVISO_DO_BACKUP].sort());
    expect(backupNoPainel(ambiente()).quantos).toBe(0);
  });
});

describe('quando algo falha', () => {
  it('o envio que falha desfaz a trava — e a rodada seguinte tenta de novo', async () => {
    falhou('2026-11-11T06:02:25.000Z');
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const recusa = async () => { throw new Error('o provedor recusou'); };
      expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T07:00:00Z'), { env: ambiente(), enviar: recusa })).toBe(false);
      expect(existsSync(trava())).toBe(false);
      // Com a trava de ontem, ela volta a ser a de ontem.
      writeFileSync(trava(), `${JSON.stringify({ dia: '2026-11-10', situacao: 'falhou', em: '2026-11-10T07:00:00.000Z' })}\n`);
      expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T08:00:00Z'), { env: ambiente(), enviar: recusa })).toBe(false);
      expect(JSON.parse(readFileSync(trava(), 'utf8')).dia).toBe('2026-11-10');
    } finally {
      erro.mockRestore();
    }
    const { enviados, enviar } = caixa();
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T09:00:00Z'), { env: ambiente(), enviar })).toBe(true);
    expect(enviados).toHaveLength(1);
  });

  it('sem como gravar a trava, nada sai: sem ela, o aviso sairia a cada hora', async () => {
    falhou('2026-11-11T06:02:25.000Z');
    // Uma pasta no lugar do arquivo temporário da trava: gravar falha mesmo para o root.
    mkdirSync(`${trava()}.parcial`);
    const { enviados, enviar } = caixa();
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T07:00:00Z'), { env: ambiente(), enviar })).toBe(false);
      expect(erro).toHaveBeenCalledWith(expect.stringMatching(/a trava não se grava/), expect.anything());
    } finally {
      erro.mockRestore();
    }
    expect(enviados).toHaveLength(0);
  });

  it('a trava ilegível conta como nenhuma: o aviso sai, e ela volta a ter forma', async () => {
    falhou('2026-11-11T06:02:25.000Z');
    writeFileSync(trava(), 'não é json');
    const { enviados, enviar } = caixa();
    expect(await avisarBackupQueNaoSobe(new Date('2026-11-11T07:00:00Z'), { env: ambiente(), enviar })).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(JSON.parse(readFileSync(trava(), 'utf8')).dia).toBe('2026-11-11');
  });
});

describe('o texto', () => {
  it('o motivo vai numa linha só, e curto — nada do que o provedor manda quebra o e-mail', () => {
    const longo = `${'x'.repeat(200)}\nlinha nova\r\n\u0007${'y'.repeat(200)}`;
    const { texto } = textoDoAvisoDoBackup({
      situacao: 'falhou', falha: { em: new Date('2026-11-11T06:02:25Z'), motivo: longo }, ultimoCerto: null, sistema: '',
    });
    const linha = texto.split('\n').find((l) => l.startsWith('  x'))!;
    expect(linha.length).toBeLessThanOrEqual(2 + 300);
    expect(linha.endsWith('…')).toBe(true);
    expect(linha).toContain('x linha nova y');
    expect(texto).not.toContain('\u0007');
    expect(texto).toContain('Não há envio certo registrado.');
    // Sem o endereço do painel, a frase continua inteira.
    expect(texto).toContain('A tela de Sistema do operador mostra o mesmo.');
  });

  it('o motivo vazio não deixa linha em branco pendurada', () => {
    const { texto } = textoDoAvisoDoBackup({
      situacao: 'falhou', falha: { em: new Date('2026-11-11T06:02:25Z'), motivo: '   ' }, ultimoCerto: null, sistema: '',
    });
    expect(texto.split('\n')[0]).toBe('O envio do backup para fora do servidor falhou em 11/11 às 03:02.');
  });
});

describe.skipIf(!TEM_BANCO)('a tarefa de hora em hora', () => {
  let sql: postgres.Sql;
  let avisos: typeof import('../src/lib/avisos.ts');
  let email: typeof import('../src/lib/email.ts');

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    avisos = await import('../src/lib/avisos.ts');
    email = await import('../src/lib/email.ts');
  }, 30_000);

  afterAll(async () => {
    await sql.end();
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  it('manda o aviso do backup, e o resumo diz — o que o daemon põe no log', async () => {
    falhou('2026-11-11T06:02:25.000Z');
    email.caixaDeSaida.length = 0;
    for (const [k, v] of Object.entries(ambiente())) if (k !== 'NODE_ENV') vi.stubEnv(k, v);
    try {
      const resumo = await avisos.enviarAvisosPendentes(new Date('2026-11-11T07:00:00Z'));
      expect(resumo.avisoDoBackup).toBe(true);
      expect(email.caixaDeSaida.map((e) => [e.para, e.tipo, e.assunto])).toEqual([
        [OPERADOR, 'operador', 'O backup não está chegando ao armazenamento de fora'],
      ]);
      const depois = await avisos.enviarAvisosPendentes(new Date('2026-11-11T08:00:00Z'));
      expect(depois.avisoDoBackup).toBe(false);
      expect(email.caixaDeSaida).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30_000);
});
