// O diagnóstico do envio para fora — `scripts/diagnosticar-envio.mjs` (11/11/2026) —, contra um armazenamento de
// mentira aberto aqui, que recusa com `IncompleteBody` o corpo acima de um limite: o que o Backblaze faz desde a
// tarde de 10/11 com o backup, por um motivo que o diagnóstico existe para achar.
//
// Estes casos seguram: cada envio passa pelo mesmo `enviarParaS3` do backup, uma tentativa só; o limite de
// tamanho vira "até X sobe, a partir de Y não"; nenhum subindo não é tamanho; os que falham vão de novo com IPv4
// forçado; a espera vira frase; nada de credencial na tela; e os registros do envio não mudam.
//
// Não precisa de banco.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type Diagnostico = typeof import('../scripts/diagnosticar-envio.mjs');
let diag: Diagnostico;

/** O armazenamento de mentira: guarda o que cabe no limite e recusa o resto, como o Backblaze recusa. */
const s3 = {
  servidor: null as Server | null,
  limite: Infinity,
  atrasoDaRecusaMs: 0,
  /** Acima do limite: `recusa` (400 IncompleteBody), `erro` (500, que o SDK repete) ou `calado` (não responde). */
  modo: 'recusa' as 'recusa' | 'erro' | 'calado',
  pedidos: [] as { metodo: string; caminho: string; bytes: number }[],
  objetos: new Map<string, Buffer>(),
};

const CHAVE = 'AKIA-CHAVE-DE-TESTE-123';
const SEGREDO = 'segredo-que-nunca-pode-sair-na-tela';
let endpoint = '';
const ambiente = (extra: Record<string, string> = {}) => ({
  S3_ENDPOINT: endpoint, S3_BUCKET: 'backups-teste', S3_REGION: 'us-east-005',
  S3_ACCESS_KEY_ID: CHAVE, S3_SECRET_ACCESS_KEY: SEGREDO, ...extra,
});

beforeAll(async () => {
  s3.servidor = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on('data', (c: Buffer) => partes.push(c));
    req.on('end', () => {
      const corpo = Buffer.concat(partes);
      const caminho = new URL(req.url ?? '/', 'http://s3.teste').pathname;
      s3.pedidos.push({ metodo: req.method ?? '', caminho, bytes: corpo.length });
      if (corpo.length > s3.limite && s3.modo === 'calado') return;
      if (corpo.length > s3.limite && s3.modo === 'erro') {
        res.writeHead(500, { 'content-type': 'application/xml' });
        res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>InternalError</Code><Message>x</Message></Error>');
        return;
      }
      if (corpo.length > s3.limite) {
        setTimeout(() => {
          res.writeHead(400, { 'content-type': 'application/xml', 'x-amz-request-id': `pedido${corpo.length}` });
          res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>IncompleteBody</Code>'
            + `<Message>The request body was too small</Message><RequestId>pedido${corpo.length}</RequestId></Error>`);
        }, s3.atrasoDaRecusaMs);
        return;
      }
      s3.objetos.set(caminho, corpo);
      res.writeHead(200, { etag: '"x"' });
      res.end();
    });
  });
  await new Promise<void>((ok) => s3.servidor!.listen(0, '127.0.0.1', () => ok()));
  endpoint = `http://127.0.0.1:${(s3.servidor!.address() as AddressInfo).port}`;
  diag = await import('../scripts/diagnosticar-envio.mjs');
}, 30_000);

afterAll(async () => {
  s3.servidor!.closeAllConnections();
  await new Promise((ok) => s3.servidor!.close(ok));
});

beforeEach(() => {
  s3.limite = Infinity; s3.atrasoDaRecusaMs = 0; s3.modo = 'recusa'; s3.pedidos = []; s3.objetos.clear();
});

async function rodar(extra: Record<string, unknown> = {}) {
  const linhas: string[] = [];
  const r = await diag.diagnosticarEnvio({
    env: ambiente(), escrever: (l: string) => linhas.push(l), agora: new Date('2026-11-12T13:00:00.000Z'), prazoMs: 5000, ...extra,
  });
  return { r, linhas, texto: linhas.join('\n') };
}

describe('o diagnóstico contra um armazenamento que recusa acima de um tamanho', () => {
  it('o limite vira "até X sobe, a partir de Y não" — e cada envio é um pedido só, do tamanho certo', async () => {
    s3.limite = 1300;
    const { r, texto } = await rodar();
    expect(r!.envios.map((e: { bytes: number; ok: boolean }) => [e.bytes, e.ok])).toEqual([
      [16, true], [600, true], [1200, true], [1400, false], [1600, false], [3000, false], [12000, false],
    ]);
    expect(texto).toContain('Até 1200 bytes sobe; a partir de 1400, não: aponta para o tamanho do pacote no caminho (MTU)');
    // O motivo de cada recusa vem como o do backup: a mensagem, o código, o HTTP e o número do pedido.
    expect(texto).toMatch(/1400 bytes\s+✕ [\d,]+ s — The request body was too small \[IncompleteBody, HTTP 400, pedido pedido1400\]/);
    // Uma tentativa só: sem as novas tentativas do SDK, 7 envios e 3 de novo com IPv4 são 10 pedidos.
    expect(s3.pedidos).toHaveLength(10);
    // O que subiu chegou inteiro, aleatório e no lugar combinado.
    const chaves = [...s3.objetos.keys()].sort();
    expect(chaves).toEqual(['16', '1200', '600'].map((b) => `/backups-teste/backups/diagnostico-2026-11-12T13-00-00Z-${b}.bin`).sort());
    const grande = s3.objetos.get('/backups-teste/backups/diagnostico-2026-11-12T13-00-00Z-1200.bin')!;
    expect(grande.length).toBe(1200);
    expect(new Set(grande).size).toBeGreaterThan(100); // aleatório, não zeros
  }, 60_000);

  it('os que falharam vão de novo com IPv4 forçado — os três menores — e a leitura diz se mudou', async () => {
    s3.limite = 1300;
    const { r, texto } = await rodar();
    expect(r!.comIpv4.map((e: { bytes: number }) => e.bytes)).toEqual([1400, 1600, 3000]);
    expect(texto).toContain('Os que falharam, de novo com IPv4 forçado:');
    expect(texto).toContain('Com IPv4 forçado, falharam igual: não é o IPv6.');
    expect(s3.pedidos.slice(7).map((p) => p.caminho)).toEqual(
      [1400, 1600, 3000].map((b) => `/backups-teste/backups/diagnostico-2026-11-12T13-00-00Z-ipv4-${b}.bin`),
    );
  }, 60_000);

  it('nenhum subindo, nem o menor: não é tamanho — e manda ao suporte, com os números dos pedidos', async () => {
    s3.limite = -1;
    s3.atrasoDaRecusaMs = 120;
    const { texto } = await rodar({ tamanhos: [16, 600] });
    expect(texto).toContain('Nenhum subiu, nem o de 16 bytes: não é o tamanho do pacote.');
    expect(texto).toContain('números dos pedidos acima');
  }, 60_000);

  it('uma tentativa só, mesmo no erro que o SDK repetiria — o tempo medido é o de um pedido', async () => {
    s3.limite = 1300;
    s3.modo = 'erro';
    const { r } = await rodar();
    expect(r!.envios.filter((e: { ok: boolean }) => !e.ok)).toHaveLength(4);
    // 7 envios e 3 de novo com IPv4, um pedido cada: com as novas tentativas do SDK seriam 7 + 2 × 4 + 2 × 3.
    expect(s3.pedidos).toHaveLength(10);
  }, 60_000);

  it('o pedido sem resposta acaba no prazo, e não trava o diagnóstico', async () => {
    s3.limite = 1300;
    s3.modo = 'calado';
    const { r, texto } = await rodar({ tamanhos: [16, 1400], prazoMs: 400 });
    const [pequeno, grande] = r!.envios as { ok: boolean; ms: number; motivo?: string }[];
    expect(pequeno.ok).toBe(true);
    expect(grande.ok).toBe(false);
    expect(grande.ms).toBeLessThan(5000);
    expect(texto).toContain('Os que falharam, de novo com IPv4 forçado:');
  }, 60_000);

  it('todos subindo: o envio funciona — e não há rodada com IPv4', async () => {
    const { r, texto } = await rodar();
    expect(r!.envios.every((e: { ok: boolean }) => e.ok)).toBe(true);
    expect(r!.comIpv4).toEqual([]);
    expect(texto).toContain('Todos subiram: o envio funciona agora.');
    expect(texto).not.toContain('IPv4 forçado');
  }, 60_000);

  it('a tela diz a rede e o armazenamento, e nunca a chave nem o segredo', async () => {
    s3.limite = 1300;
    const { texto, linhas } = await rodar();
    expect(texto).toContain('A rede deste container:');
    expect(texto).toContain('O armazenamento, 127.0.0.1:');
    expect(texto).toContain('IPv4: 127.0.0.1');
    expect(texto).not.toContain(CHAVE);
    expect(texto).not.toContain(SEGREDO);
    expect(linhas.at(-1)).not.toBe('Leitura:'); // a leitura vem inteira, por último
  }, 60_000);

  it('não mexe nos registros do envio, nem deixa arquivo de teste para trás', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'diag-backups-'));
    const antes = readdirSync(tmpdir()).filter((n) => n.startsWith('diagnostico-do-envio-'));
    try {
      s3.limite = 1300;
      const linhas: string[] = [];
      await diag.diagnosticarEnvio({ env: ambiente({ BACKUP_DIR: pasta }), escrever: (l: string) => linhas.push(l), prazoMs: 5000 });
      expect(readdirSync(pasta)).toEqual([]);
      expect(readdirSync(tmpdir()).filter((n) => n.startsWith('diagnostico-do-envio-'))).toEqual(antes);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }, 60_000);

  it('sem as quatro S3_*, diz que não há o que diagnosticar — e não manda nada', async () => {
    const linhas: string[] = [];
    expect(await diag.diagnosticarEnvio({ env: ambiente({ S3_SECRET_ACCESS_KEY: ' ' }), escrever: (l: string) => linhas.push(l) })).toBeNull();
    expect(linhas).toEqual(['Sem as quatro S3_* no ambiente: não há envio para fora para diagnosticar.']);
    expect(s3.pedidos).toEqual([]);
  });
});

describe('a leitura', () => {
  const e = (bytes: number, ok: boolean, ms = 300) => ({ bytes, ok, ms, motivo: ok ? undefined : 'x' });

  it('a recusa demorada é espera; a na hora, recusa do que chegou', () => {
    const demorou = diag.leituraDoDiagnostico([e(16, true), e(1400, false, 20_000), e(3000, false, 21_000)]);
    expect(demorou).toContain('As recusas demoraram (20,0 s ou mais): o armazenamento esperou bytes que não chegaram — aponta para pacotes perdidos no caminho.');
    const naHora = diag.leituraDoDiagnostico([e(16, true), e(1400, false, 200)]);
    expect(naHora).toContain('As recusas vieram na hora: o armazenamento recusou o que recebeu, sem esperar.');
    // Misturado, não afirma nem uma coisa nem outra.
    const misto = diag.leituraDoDiagnostico([e(1400, false, 200), e(3000, false, 20_000)]);
    expect(misto.join(' ')).not.toMatch(/demoraram|na hora/);
  });

  it('IPv4 que resolve aponta o IPv6; sem limite de tamanho, diz que a recusa vai e volta', () => {
    expect(diag.leituraDoDiagnostico([e(16, true), e(1400, false)], [e(1400, true)]))
      .toContain('Com IPv4 forçado, os que tinham falhado subiram: aponta para o caminho do IPv6 — o conserto seria o envio usar só IPv4.');
    expect(diag.leituraDoDiagnostico([e(16, false), e(600, true)]).join(' ')).toMatch(/a recusa vai e volta/);
  });

  it('o MTU vem de /sys/class/net — e sem ele, "?" em vez de quebrar', () => {
    const lidas: string[] = [];
    const comMtu = diag.interfacesDeRede((nome: string) => { lidas.push(nome); return '1450\n'; });
    expect(comMtu.every((i: { mtu: number | null }) => i.mtu === 1450)).toBe(true);
    expect(lidas).not.toContain('lo');
    const semMtu = diag.interfacesDeRede(() => { throw new Error('sem /sys'); });
    expect(semMtu.every((i: { mtu: number | null }) => i.mtu === null)).toBe(true);
  });

  it('o nome do armazenamento sai sem esquema, porta e caminho — e sem credencial embutida', () => {
    expect(diag.nomeDoArmazenamento('https://s3.us-east-005.backblazeb2.com')).toBe('s3.us-east-005.backblazeb2.com');
    expect(diag.nomeDoArmazenamento('s3.us-east-005.backblazeb2.com')).toBe('s3.us-east-005.backblazeb2.com');
    expect(diag.nomeDoArmazenamento('https://usuario:senha@s3.exemplo.com:9000/x')).toBe('s3.exemplo.com');
  });

  it('o cliente do diagnóstico: o prazo, uma tentativa — e, com IPv4, as duas conexões só por IPv4', () => {
    const padrao = diag.clienteDoDiagnostico(5000) as { requestHandler: Record<string, unknown>; maxAttempts: number };
    expect(padrao).toEqual({
      requestHandler: { requestTimeout: 5000, throwOnRequestTimeout: true, socketTimeout: 5000, connectionTimeout: 5000 },
      maxAttempts: 1,
    });
    const ipv4 = diag.clienteDoDiagnostico(30_000, { ipv4: true }) as unknown as {
      requestHandler: { httpAgent: { options: { family?: number } }; httpsAgent: { options: { family?: number } }; connectionTimeout: number };
      maxAttempts: number;
    };
    expect(ipv4.requestHandler.httpAgent.options.family).toBe(4);
    expect(ipv4.requestHandler.httpsAgent.options.family).toBe(4);
    expect(ipv4.requestHandler.connectionTimeout).toBe(10_000);
    expect(ipv4.maxAttempts).toBe(1);
  });

  it('o script usa o envio do backup — não monta um cliente seu — e o cliente dele em cada rodada', () => {
    const fonte = readFileSync('scripts/diagnosticar-envio.mjs', 'utf8');
    expect(fonte).toMatch(/cliente: clienteDoDiagnostico\(prazoMs\)/);
    expect(fonte).toMatch(/const cliente = clienteDoDiagnostico\(prazoMs, \{ ipv4: true \}\);/);
    expect(fonte).toMatch(/import \{ detalheDaFalha, enviarParaS3 \} from '\.\/backup\.mjs';/);
    expect(fonte).not.toMatch(/new S3Client|@aws-sdk\/client-s3/);
  });
});
