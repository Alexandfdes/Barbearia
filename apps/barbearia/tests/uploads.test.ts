// Guarda-corpo da raiz dos uploads.
//
// POR QUE ESTE TESTE EXISTE
//
// A raiz saía de `dirname(process.env.DATABASE_PATH)`. Enquanto o banco era
// SQLite isso dava `/data/uploads` em produção — certo por acidente. O porte
// para Postgres trocou `DATABASE_PATH` por `DATABASE_URL`, e sem a variável o
// padrão caía numa raiz RELATIVA: `/app/data/uploads` dentro do container, ou
// seja, dentro da camada da imagem e fora do volume.
//
// O defeito não aparece em teste de unidade nem em log: as fotos antigas
// param de ser servidas e as novas somem no deploy seguinte.
//
// Estes casos existem para que ninguém volte a amarrar a mídia a uma variável
// de banco, e para que o padrão de produção continue sendo absoluto.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isAbsolute } from 'node:path';
import { readFileSync } from 'node:fs';

/** Recarrega o módulo com o ambiente pedido — a raiz é const de topo. */
async function raizCom(env: Record<string, string | undefined>): Promise<string> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  // `stubEnv('X','')` deixa a variável vazia, não ausente: apagamos de verdade.
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const mod = await import('../src/lib/uploads.js');
  return mod.UPLOAD_ROOT;
}

describe('a raiz dos uploads', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('em produção é absoluta, sem precisar de variável nenhuma', async () => {
    const raiz = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: undefined,
    });
    // Relativa aqui significa "dentro da camada da imagem": some no deploy.
    expect(isAbsolute(raiz)).toBe(true);
    expect(raiz).toBe('/data/uploads');
  });

  it('em produção NÃO muda se DATABASE_PATH sumir — era daí que vinha o defeito', async () => {
    const comBanco = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: '/data/appointments.db',
    });
    const semBanco = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: undefined,
    });
    expect(semBanco).toBe(comBanco);
  });

  it('UPLOAD_ROOT explícito vence — é a saída para quem montar o volume em outro lugar', async () => {
    const raiz = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: '/mnt/fotos',
      DATABASE_PATH: '/data/appointments.db',
    });
    expect(raiz).toBe('/mnt/fotos');
  });

  it('fora de produção fica na pasta do projeto, para não escrever em /data na máquina de ninguém', async () => {
    const raiz = await raizCom({
      NODE_ENV: 'development',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: undefined,
    });
    expect(raiz).toBe('./data/uploads');
  });

  it('o módulo não lê mais nenhuma variável de banco', async () => {
    const fonte = readFileSync('src/lib/uploads.ts', 'utf8')
      // Os comentários explicam o defeito antigo e citam o nome de propósito.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(fonte).not.toMatch(/DATABASE_PATH|DATABASE_URL/);
  });
});
