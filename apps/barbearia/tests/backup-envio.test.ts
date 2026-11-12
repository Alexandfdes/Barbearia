// O backup sai da VPS em partes — `PENDENCIAS-ABERTAS.md` §3.3.
//
// ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
//
// Até 12/10/2026 o envio para o armazenamento de fora (Backblaze, ou qualquer S3)
// lia o arquivo INTEIRO na memória antes de mandar. O das fotos junta a galeria de
// todas as barbearias, e o daemon do backup roda no container que atende os sites.
// Agora vai em partes, uma na memória por vez (`enviarParaS3`, em
// `scripts/backup.mjs`).
//
// Os casos rodam contra um S3 de mentira, aqui mesmo: um servidor HTTP que fala o
// bastante do protocolo — o pedido único, o envio em partes e o cancelamento — e
// guarda o que recebeu. Sem rede e sem conta em lugar nenhum. O que ele NÃO
// confere: a assinatura dos pedidos e as regras próprias de cada provedor.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { exigirBancoDeTeste } from './guardaBanco.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
const TEM_PGDUMP = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0;

const MiB = 1024 * 1024;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

interface Pedido { metodo: string; caminho: string; consulta: URLSearchParams; cabecalhos: IncomingMessage['headers']; bytes: number; em: number }

/** O S3 de mentira: guarda os objetos, as partes e cada pedido que chegou. */
class S3DeMentira {
  servidor: Server;
  objetos = new Map<string, Buffer>();
  envios = new Map<string, Map<number, Buffer>>();
  pedidos: Pedido[] = [];
  cancelados: string[] = [];
  /** Responde 500 a toda tentativa desta parte — para provar o cancelamento. */
  falharParte: number | null = null;
  /** Recusa tudo com 403, como uma chave apagada ou sem permissão — para provar o registro da falha. */
  recusarTudo = false;
  /**
   * Recusa com 400 os próximos N pedidos de PUT inteiro — para provar a segunda tentativa
   * (10/11/2026). O código `BadRequest` é escolha do teste: qual o Backblaze usa com a mensagem
   * "The request body was too small", não se sabe.
   */
  recusar400 = 0;
  private seq = 0;

  constructor() {
    this.servidor = createServer((req, res) => {
      const pedacos: Buffer[] = [];
      req.on('data', (c: Buffer) => pedacos.push(c));
      req.on('end', () => {
        const corpo = Buffer.concat(pedacos);
        const url = new URL(req.url ?? '/', 'http://s3.teste');
        const chave = decodeURIComponent(url.pathname);
        const q = url.searchParams;
        this.pedidos.push({ metodo: req.method ?? '', caminho: chave, consulta: q, cabecalhos: req.headers, bytes: corpo.length, em: Date.now() });
        if (this.recusarTudo) {
          res.writeHead(403, { 'content-type': 'application/xml' });
          return res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>');
        }
        const xml = (s: string) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(`<?xml version="1.0" encoding="UTF-8"?>${s}`); };

        if (req.method === 'POST' && q.has('uploads')) {
          const id = `envio-${++this.seq}`;
          this.envios.set(id, new Map());
          return xml(`<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>${chave}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
        }
        if (req.method === 'PUT' && q.has('uploadId')) {
          const n = Number(q.get('partNumber'));
          if (n === this.falharParte) { res.writeHead(500, { 'content-type': 'application/xml' }); return res.end('<Error><Code>InternalError</Code><Message>caiu</Message></Error>'); }
          this.envios.get(q.get('uploadId')!)!.set(n, corpo);
          res.writeHead(200, { ETag: `"parte-${n}-${sha(corpo).slice(0, 8)}"` });
          return res.end();
        }
        if (req.method === 'POST' && q.has('uploadId')) {
          const partes = this.envios.get(q.get('uploadId')!)!;
          const pedidas = [...corpo.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
          this.objetos.set(chave, Buffer.concat(pedidas.map((n) => partes.get(n)!)));
          return xml(`<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>${chave}</Key><ETag>"pronto"</ETag></CompleteMultipartUploadResult>`);
        }
        if (req.method === 'DELETE' && q.has('uploadId')) {
          this.cancelados.push(q.get('uploadId')!);
          this.envios.delete(q.get('uploadId')!);
          res.writeHead(204);
          return res.end();
        }
        if (req.method === 'PUT' && this.recusar400 > 0) {
          this.recusar400--;
          res.writeHead(400, { 'content-type': 'application/xml', 'x-amz-request-id': 'pedido-de-teste-400' });
          return res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>BadRequest</Code><Message>The request body was too small</Message></Error>');
        }
        if (req.method === 'PUT') {
          this.objetos.set(chave, corpo);
          res.writeHead(200, { ETag: `"${sha(corpo).slice(0, 8)}"` });
          return res.end();
        }
        res.writeHead(400);
        res.end();
      });
    });
  }

  async ligar(): Promise<string> {
    await new Promise<void>((ok) => this.servidor.listen(0, '127.0.0.1', ok));
    return `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
  }

  limpar() {
    this.objetos.clear(); this.envios.clear(); this.pedidos = []; this.cancelados = []; this.falharParte = null; this.recusarTudo = false;
    this.recusar400 = 0;
  }
}

const s3 = new S3DeMentira();
let endpoint = '';
let pasta = '';
let backup: typeof import('../scripts/backup.mjs');

const envDoS3 = () => ({
  S3_ENDPOINT: endpoint, S3_BUCKET: 'backups-teste', S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'chave-de-teste', S3_SECRET_ACCESS_KEY: 'segredo-de-teste',
});

/** Os cabeçalhos do checksum novo do SDK, que serviço compatível com S3 pode recusar. */
const checksumNovo = (p: Pedido) => Object.keys(p.cabecalhos).filter((h) => h.startsWith('x-amz-checksum-') || h === 'x-amz-sdk-checksum-algorithm');

beforeAll(async () => {
  endpoint = await s3.ligar();
  backup = await import('../scripts/backup.mjs');
});
afterAll(async () => {
  await new Promise((ok) => s3.servidor.close(ok));
});
beforeEach(() => {
  s3.limpar();
  pasta = mkdtempSync(join(tmpdir(), 'bkenvio-'));
});
afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

describe('o envio só por IPv4 — S3_SO_IPV4 (11/11/2026)', () => {
  type Agentes = { requestHandler?: { httpAgent?: { options: { family?: number; keepAlive?: boolean } }; httpsAgent?: { options: { family?: number; keepAlive?: boolean } } } };

  it('sem a variável, o cliente é o de sempre: o SDK escolhe o caminho', () => {
    const o = backup.opcoesDoClienteDoS3(envDoS3()) as Agentes & Record<string, unknown>;
    expect(o.requestHandler).toBeUndefined();
    expect(o).toMatchObject({ forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  });

  it('com S3_SO_IPV4=1, as duas conexões só por IPv4 — e o envio sobe', async () => {
    const env = { ...envDoS3(), S3_SO_IPV4: '1' };
    const o = backup.opcoesDoClienteDoS3(env) as Agentes;
    expect(o.requestHandler?.httpsAgent?.options).toMatchObject({ family: 4, keepAlive: true });
    expect(o.requestHandler?.httpAgent?.options).toMatchObject({ family: 4, keepAlive: true });
    // Outro valor não liga: a variável é 1 ou nada.
    expect((backup.opcoesDoClienteDoS3({ ...envDoS3(), S3_SO_IPV4: 'sim' }) as Agentes).requestHandler).toBeUndefined();
    const arquivo = join(pasta, 'barbearia_2026-11-12-03-00-00.sql.gz');
    writeFileSync(arquivo, randomBytes(4096));
    expect(await backup.enviarParaS3(arquivo, { env })).toEqual({ partes: 1, bytes: 4096 });
    expect(s3.pedidos.map((p) => p.metodo)).toEqual(['PUT']);
  });

  it('o diagnóstico passa o seu cliente, e ele vale mais que a variável — para medir os dois caminhos', () => {
    const doDiagnostico = { requestTimeout: 30_000 };
    const o = backup.opcoesDoClienteDoS3({ ...envDoS3(), S3_SO_IPV4: '1' }, { requestHandler: doDiagnostico, maxAttempts: 1 }) as Record<string, unknown>;
    expect(o.requestHandler).toBe(doDiagnostico);
    expect(o.maxAttempts).toBe(1);
  });
});

describe('o envio para fora da VPS', () => {
  it('a parte respeita o mínimo do S3 — 5 MiB, menos a última', () => {
    expect(backup.PARTE_DO_ENVIO).toBeGreaterThanOrEqual(5 * MiB);
  });

  it('o arquivo pequeno vai num pedido só, inteiro, sem o checksum novo', async () => {
    const arquivo = join(pasta, 'barbearia_2026-10-12-03-00-00.sql.gz');
    const conteudo = randomBytes(300 * 1024);
    writeFileSync(arquivo, conteudo);

    const r = await backup.enviarParaS3(arquivo, { env: envDoS3() });

    expect(r).toEqual({ partes: 1, bytes: conteudo.length });
    expect(s3.pedidos.map((p) => p.metodo)).toEqual(['PUT']);
    expect(s3.pedidos[0].caminho).toBe('/backups-teste/backups/barbearia_2026-10-12-03-00-00.sql.gz');
    expect(sha(s3.objetos.get('/backups-teste/backups/barbearia_2026-10-12-03-00-00.sql.gz')!)).toBe(sha(conteudo));
    expect(s3.pedidos.flatMap(checksumNovo)).toEqual([]);
  });

  it('o arquivo grande vai em partes, nenhuma maior que a parte, e chega igual', async () => {
    const arquivo = join(pasta, 'barbearia_2026-10-12-03-00-00-fotos.tar.gz');
    // 12,5 MiB em partes de 5 MiB: 5 + 5 + 2,5.
    const conteudo = randomBytes(12 * MiB + 512 * 1024);
    writeFileSync(arquivo, conteudo);

    const r = await backup.enviarParaS3(arquivo, { env: envDoS3(), parte: 5 * MiB });

    expect(r).toEqual({ partes: 3, bytes: conteudo.length });
    const partes = s3.pedidos.filter((p) => p.metodo === 'PUT' && p.consulta.has('uploadId'));
    expect(partes.map((p) => Number(p.consulta.get('partNumber')))).toEqual([1, 2, 3]);
    expect(partes.map((p) => p.bytes)).toEqual([5 * MiB, 5 * MiB, 2.5 * MiB]);
    // Nenhum pedido carregou mais que uma parte — é o que mantém a memória no tamanho da parte.
    expect(Math.max(...s3.pedidos.map((p) => p.bytes))).toBeLessThanOrEqual(5 * MiB);
    expect(sha(s3.objetos.get('/backups-teste/backups/barbearia_2026-10-12-03-00-00-fotos.tar.gz')!)).toBe(sha(conteudo));
    expect(s3.cancelados).toEqual([]);
    expect(s3.pedidos.flatMap(checksumNovo)).toEqual([]);
  });

  it('o arquivo do tamanho exato de uma parte vai num pedido só', async () => {
    const arquivo = join(pasta, 'exato.sql.gz');
    writeFileSync(arquivo, randomBytes(5 * MiB));
    expect(await backup.enviarParaS3(arquivo, { env: envDoS3(), parte: 5 * MiB })).toEqual({ partes: 1, bytes: 5 * MiB });
    expect(s3.pedidos.map((p) => p.metodo)).toEqual(['PUT']);
  });

  it('parte que não sobe cancela o envio inteiro — nenhuma parte órfã fica no bucket', async () => {
    const arquivo = join(pasta, 'cai.tar.gz');
    writeFileSync(arquivo, randomBytes(11 * MiB));
    s3.falharParte = 2;

    await expect(backup.enviarParaS3(arquivo, { env: envDoS3(), parte: 5 * MiB })).rejects.toThrow();

    expect(s3.cancelados).toHaveLength(1);
    expect(s3.envios.size).toBe(0);
    expect(s3.objetos.size).toBe(0);
    // Nada de "Complete" depois da falha.
    expect(s3.pedidos.some((p) => p.metodo === 'POST' && p.consulta.has('uploadId'))).toBe(false);
  });

  it('o SDK não repete um 400 — por isso a segunda tentativa é nossa (medido em 10/11/2026)', async () => {
    const arquivo = join(pasta, 'recusado.sql.gz');
    writeFileSync(arquivo, randomBytes(64 * 1024));
    s3.recusar400 = 1;
    const erro = await backup.enviarParaS3(arquivo, { env: envDoS3() }).catch((e: unknown) => e) as Record<string, unknown>;
    expect(erro).toBeInstanceOf(Error);
    expect(s3.pedidos.filter((p) => p.metodo === 'PUT')).toHaveLength(1);
    // O que `detalheDaFalha` lê do erro do SDK.
    expect(backup.detalheDaFalha(erro)).toBe('BadRequest, HTTP 400, pedido pedido-de-teste-400');
    expect(backup.detalheDaFalha(new Error('o arquivo sumiu'))).toBe('');
    expect(backup.detalheDaFalha('texto')).toBe('');
  });

  it('controle: o 500 o SDK repete sozinho, e o detalhe conta as tentativas dele', async () => {
    const arquivo = join(pasta, 'cai-sempre.tar.gz');
    writeFileSync(arquivo, randomBytes(11 * MiB));
    s3.falharParte = 1;
    const erro = await backup.enviarParaS3(arquivo, { env: envDoS3(), parte: 5 * MiB }).catch((e: unknown) => e);
    const tentativasDaParte = s3.pedidos.filter((p) => p.metodo === 'PUT' && p.consulta.get('partNumber') === '1').length;
    expect(tentativasDaParte).toBeGreaterThan(1);
    expect(backup.detalheDaFalha(erro)).toBe(`InternalError, HTTP 500, ${tentativasDaParte} tentativas do SDK`);
  }, 30_000);

  it('o código não volta a ler o arquivo inteiro para mandar', () => {
    const fonte = readFileSync('scripts/backup.mjs', 'utf8')
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    expect(fonte).not.toMatch(/readFileSync/);
    expect(fonte).toMatch(/requestChecksumCalculation:\s*'WHEN_REQUIRED'/);
  });
});

describe.skipIf(!TEM_BANCO || !TEM_PGDUMP)('o backup de verdade, com o envio ligado', () => {
  it('o banco e as fotos sobem — e o backup local continua lá', async () => {
    const pastaBackup = join(pasta, 'backups');
    const fotos = join(pasta, 'uploads');
    mkdirSync(join(fotos, 'galeria'), { recursive: true });
    writeFileSync(join(fotos, 'galeria', 'a.webp'), randomBytes(64 * 1024));

    vi.resetModules();
    vi.stubEnv('BACKUP_DIR', pastaBackup);
    vi.stubEnv('UPLOAD_ROOT', fotos);
    for (const [k, v] of Object.entries(envDoS3())) vi.stubEnv(k, v);
    try {
      const mod = await import('../scripts/backup.mjs');
      const r = await mod.runBackup() as { dest: string; fotos: string; uploaded: boolean };
      expect(r.uploaded).toBe(true);
      const locais = readdirSync(pastaBackup).filter((n) => n.startsWith('barbearia_')).sort();
      expect(locais).toHaveLength(2);
      for (const nome of locais) {
        const enviado = s3.objetos.get(`/backups-teste/backups/${nome}`);
        expect(enviado, nome).toBeDefined();
        expect(sha(enviado!)).toBe(sha(readFileSync(join(pastaBackup, nome))));
      }
      // O registro do envio (05/11/2026): os dois arquivos, e a hora — para a tela de Sistema.
      const registro = JSON.parse(readFileSync(join(pastaBackup, 'envio-para-fora.ok'), 'utf8'));
      expect(registro.arquivos.sort()).toEqual(locais);
      expect(Date.now() - new Date(registro.em).getTime()).toBeLessThan(60_000);
      expect(readdirSync(pastaBackup)).not.toContain('envio-para-fora.falhou');
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30_000);

  it('o envio recusado fica registrado, com o motivo — e o envio que volta apaga a falha (05/11/2026)', async () => {
    // Até 05/11 a tela de Sistema dizia só se as S3_* existiam: uma chave apagada deixava o
    // backup só na VPS, com a falha num log que ninguém lê (`docs/PENDENCIAS-ABERTAS.md` §2.68).
    const pastaBackup = join(pasta, 'backups');
    vi.resetModules();
    vi.stubEnv('BACKUP_DIR', pastaBackup);
    vi.stubEnv('UPLOAD_ROOT', join(pasta, 'sem-fotos'));
    for (const [k, v] of Object.entries(envDoS3())) vi.stubEnv(k, v);
    try {
      const mod = await import('../scripts/backup.mjs');
      const sistema = await import('../src/lib/operadorSistema.ts');
      // Quem grava e quem lê usam os mesmos nomes.
      expect(mod.REGISTRO_DO_ENVIO_CERTO).toBe(sistema.REGISTRO_DO_ENVIO_CERTO);
      expect(mod.REGISTRO_DA_FALHA_DO_ENVIO).toBe(sistema.REGISTRO_DA_FALHA_DO_ENVIO);

      s3.recusarTudo = true;
      const r = await mod.runBackup({ esperaDaNovaTentativaMs: 20 }) as { dest: string; uploaded: boolean };
      expect(r.uploaded).toBe(false);
      expect(r.dest).toBeTruthy(); // o backup local ficou
      // Duas tentativas, a nossa e a segunda (10/11/2026) — e o SDK não repete o 403.
      expect(s3.pedidos.filter((p) => p.metodo === 'PUT' && p.caminho.endsWith(basename(r.dest)))).toHaveLength(2);
      const falha = JSON.parse(readFileSync(join(pastaBackup, 'envio-para-fora.falhou'), 'utf8'));
      expect(falha.motivo).toMatch(/Access Denied/);
      // O motivo leva o que o SDK sabe: o código e o status — é o que faltava em 10/11.
      expect(falha.motivo).toMatch(/\[AccessDenied, HTTP 403/);
      expect(readdirSync(pastaBackup)).not.toContain('envio-para-fora.ok');
      let lido = sistema.envioParaForaNaPasta(pastaBackup);
      expect(lido.ultimoCerto).toBeNull();
      expect(lido.ultimaFalha?.motivo).toMatch(/Access Denied/);

      s3.recusarTudo = false;
      expect((await mod.runBackup({ esperaDaNovaTentativaMs: 20 }) as { uploaded: boolean }).uploaded).toBe(true);
      expect(readdirSync(pastaBackup)).toContain('envio-para-fora.ok');
      expect(readdirSync(pastaBackup)).not.toContain('envio-para-fora.falhou');
      lido = sistema.envioParaForaNaPasta(pastaBackup);
      expect(lido.ultimaFalha).toBeNull();
      expect(lido.ultimoCerto).not.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  }, 60_000);

  it('a recusa que passa: a segunda tentativa sobe, o log diz o porquê da primeira, e nada fica como falha (10/11/2026)', async () => {
    const pastaBackup = join(pasta, 'backups');
    vi.resetModules();
    vi.stubEnv('BACKUP_DIR', pastaBackup);
    vi.stubEnv('UPLOAD_ROOT', join(pasta, 'sem-fotos'));
    for (const [k, v] of Object.entries(envDoS3())) vi.stubEnv(k, v);
    const erros: string[] = [];
    const certos: string[] = [];
    const espiaErro = vi.spyOn(console, 'error').mockImplementation((...a) => { erros.push(a.join(' ')); });
    const espiaLog = vi.spyOn(console, 'log').mockImplementation((...a) => { certos.push(a.join(' ')); });
    try {
      const mod = await import('../scripts/backup.mjs');
      expect(mod.ESPERA_DA_NOVA_TENTATIVA_MS).toBe(60_000);
      s3.recusar400 = 1;
      const r = await mod.runBackup({ esperaDaNovaTentativaMs: 400 }) as { dest: string; uploaded: boolean };
      expect(r.uploaded).toBe(true);
      expect(s3.objetos.get(`/backups-teste/backups/${basename(r.dest)}`)).toBeDefined();
      // A segunda tentativa espera — não sai colada na primeira.
      const doBanco = s3.pedidos.filter((p) => p.metodo === 'PUT' && p.caminho.endsWith(basename(r.dest)));
      expect(doBanco).toHaveLength(2);
      expect(doBanco[1].em - doBanco[0].em).toBeGreaterThanOrEqual(380);
      const log = erros.join('\n');
      expect(log).toMatch(/✕ Upload off-site falhou \(backup local preservado\): The request body was too small \[BadRequest, HTTP 400, pedido pedido-de-teste-400\]/);
      // O tamanho e o modo, que decidem o caminho do envio.
      expect(log).toMatch(new RegExp(`${basename(r.dest).replace(/\./g, '\\.')}: \\d+ KiB \\(\\d+ bytes\\), num pedido só`));
      expect(log).toMatch(/Nova tentativa em 0 s\./); // 400 ms, arredondados
      expect(certos.join('\n')).toMatch(/✓ Upload off-site: .* — na segunda tentativa/);
      expect(readdirSync(pastaBackup)).toContain('envio-para-fora.ok');
      expect(readdirSync(pastaBackup)).not.toContain('envio-para-fora.falhou');
      // Nenhuma credencial no log.
      expect(log).not.toMatch(/segredo-de-teste|chave-de-teste/);
    } finally {
      espiaErro.mockRestore();
      espiaLog.mockRestore();
      vi.unstubAllEnvs();
    }
  }, 30_000);

  it('sem as S3_*, nada é registrado — não há envio para dizer que falhou', async () => {
    const pastaBackup = join(pasta, 'backups');
    vi.resetModules();
    vi.stubEnv('BACKUP_DIR', pastaBackup);
    vi.stubEnv('UPLOAD_ROOT', join(pasta, 'sem-fotos'));
    for (const k of Object.keys(envDoS3())) vi.stubEnv(k, '');
    try {
      const mod = await import('../scripts/backup.mjs');
      await mod.runBackup();
      expect(readdirSync(pastaBackup).filter((n) => n.startsWith('envio-para-fora'))).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30_000);
});
