// O daemon dos avisos (`scripts/avisos-daemon.mjs`) contra uma tarefa de mentira,
// aberta aqui na porta local: o token que ele manda, e o que ele escreve no log.
//
// O log importa porque é a única coisa que o daemon produz. Com o e-mail ainda não
// configurado, a tarefa responde o mesmo erro a cada hora — e 24 linhas iguais por
// dia ensinam a não ler o log.
//
// Não precisa de banco.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

const SEGREDO = 'segredo-do-daemon-com-mais-de-32-caracteres';

let servidor: Server;
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: {} };
const recebidos: { metodo?: string; caminho?: string; autorizacao?: string }[] = [];
let daemon: { rodarAvisos: () => Promise<boolean> };
const portaAntes = process.env.PORT;
const segredoAntes = process.env.SESSION_SECRET;

beforeAll(async () => {
  servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
    recebidos.push({ metodo: req.method, caminho: req.url, autorizacao: req.headers.authorization });
    res.writeHead(resposta.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(resposta.corpo));
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', () => ok()));
  // O endereço é lido quando o módulo carrega: a porta vem antes do import.
  process.env.PORT = String((servidor.address() as AddressInfo).port);
  process.env.SESSION_SECRET = SEGREDO;
  daemon = await import('../scripts/avisos-daemon.mjs');
}, 30_000);

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  if (portaAntes === undefined) delete process.env.PORT; else process.env.PORT = portaAntes;
  if (segredoAntes === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = segredoAntes;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('o daemon dos avisos', () => {
  it('chama a tarefa pela porta local, com o token derivado do SESSION_SECRET', async () => {
    resposta = { status: 200, corpo: { ok: true, avaliadas: 0, enviados: 0, falhas: 0, semDestinatario: 0 } };
    expect(await daemon.rodarAvisos()).toBe(true);
    const { tokenDasTarefas } = await import('../src/lib/tarefas.ts');
    expect(recebidos.at(-1)).toEqual({ metodo: 'POST', caminho: '/api/tarefas/avisos', autorizacao: `Bearer ${tokenDasTarefas(SEGREDO)}` });
  });

  it('o mesmo erro, rodada após rodada, sai no log uma vez só — e a volta é avisada', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    resposta = { status: 503, corpo: { error: 'O envio de e-mail não está configurado (SMTP_URL): nenhum aviso sai.' } };
    expect(await daemon.rodarAvisos()).toBe(false);
    expect(await daemon.rodarAvisos()).toBe(false);
    expect(await daemon.rodarAvisos()).toBe(false);
    expect(erro).toHaveBeenCalledTimes(1);
    expect(String(erro.mock.calls[0][0])).toMatch(/503: O envio de e-mail não está configurado/);

    resposta = { status: 200, corpo: { ok: true, avaliadas: 1, enviados: 0, falhas: 0, semDestinatario: 0 } };
    expect(await daemon.rodarAvisos()).toBe(true);
    expect(log.mock.calls.map((c) => String(c[0]))).toEqual(['[avisos-daemon] ✓ a tarefa voltou a rodar.']);
  });

  it('o "sem e-mail para avisar" não se repete a cada hora; e-mail mandado sai sempre', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    resposta = { status: 200, corpo: { ok: true, avaliadas: 3, enviados: 0, falhas: 0, semDestinatario: 1 } };
    await daemon.rodarAvisos();
    await daemon.rodarAvisos();
    expect(log).toHaveBeenCalledTimes(1);

    resposta = { status: 200, corpo: { ok: true, avaliadas: 3, enviados: 1, falhas: 0, semDestinatario: 1 } };
    await daemon.rodarAvisos();
    await daemon.rodarAvisos();
    expect(log).toHaveBeenCalledTimes(3);
  });
});
