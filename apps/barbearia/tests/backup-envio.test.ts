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
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { exigirBancoDeTeste } from './guardaBanco.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
const TEM_PGDUMP = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0;

const MiB = 1024 * 1024;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

interface Pedido { metodo: string; caminho: string; consulta: URLSearchParams; cabecalhos: IncomingMessage['headers']; bytes: number }

/** O S3 de mentira: guarda os objetos, as partes e cada pedido que chegou. */
class S3DeMentira {
  servidor: Server;
  objetos = new Map<string, Buffer>();
  envios = new Map<string, Map<number, Buffer>>();
  pedidos: Pedido[] = [];
  cancelados: string[] = [];
  /** Responde 500 a toda tentativa desta parte — para provar o cancelamento. */
  falharParte: number | null = null;
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
        this.pedidos.push({ metodo: req.method ?? '', caminho: chave, consulta: q, cabecalhos: req.headers, bytes: corpo.length });
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
    this.objetos.clear(); this.envios.clear(); this.pedidos = []; this.cancelados = []; this.falharParte = null;
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
      const locais = readdirSync(pastaBackup).sort();
      expect(locais).toHaveLength(2);
      for (const nome of locais) {
        const enviado = s3.objetos.get(`/backups-teste/backups/${nome}`);
        expect(enviado, nome).toBeDefined();
        expect(sha(enviado!)).toBe(sha(readFileSync(join(pastaBackup, nome))));
      }
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30_000);
});
