// Guarda-corpo do que só quebra DEPOIS do deploy.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O porte de SQLite para Postgres deixou três coisas que passam em toda a
// suíte, sobem no container sem erro, e só aparecem em produção — tarde:
//
//  1. A raiz dos uploads saía de `DATABASE_PATH`. Sem essa variável (Postgres
//     usa `DATABASE_URL`), virava `/app/data/uploads`: dentro da camada da
//     imagem, fora do volume. Fotos somem no deploy seguinte.
//  2. `scripts/backup.mjs` chama `pg_dump`, que NÃO vem no node:22-alpine. Sem
//     ele o app sobe normal e todo backup falha, em silêncio.
//  3. `npm run db:seed` apontava para `scripts/seed.mjs`, apagado no porte; e
//     `db:push` altera o schema do banco na hora, sem migration nem revisão.
//
// Nenhum teste de unidade pega isso, porque nenhum deles lê o Dockerfile.
// Estes leem.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('a imagem tem o que o app precisa em produção', () => {
  it('instala o cliente do Postgres — sem pg_dump não existe backup', () => {
    expect(dockerfile).toMatch(/apk add[^\n]*postgresql\d*-client/);
  });

  it('define UPLOAD_ROOT dentro do volume', () => {
    const m = dockerfile.match(/ENV\s+UPLOAD_ROOT=(\S+)/);
    expect(m, 'Dockerfile precisa definir UPLOAD_ROOT').not.toBeNull();
    const raiz = m![1];
    // Relativa = dentro da camada da imagem = some no deploy.
    expect(raiz.startsWith('/')).toBe(true);
    // O volume declarado no próprio Dockerfile precisa conter a raiz.
    const volume = dockerfile.match(/VOLUME\s+\["([^"]+)"\]/)?.[1];
    expect(volume, 'Dockerfile precisa declarar VOLUME').toBeTruthy();
    expect(raiz.startsWith(volume + '/')).toBe(true);
  });

  it('o backup e o app concordam sobre onde as fotos moram', () => {
    // `scripts/backup.mjs` é .mjs e não importa o .ts, então a regra da raiz
    // está escrita nos dois — que é exatamente como o fuso horário se espalhou
    // por 20 arquivos. Aqui a repetição é tolerada e vigiada: se divergirem, o
    // backup salva uma pasta vazia e diz que deu certo.
    const regra = /process\.env\.UPLOAD_ROOT\s*\?\?\s*\(?\s*process\.env\.NODE_ENV === 'production' \? '([^']+)' : '([^']+)'/;

    const doApp = readFileSync('src/lib/uploads.ts', 'utf8').match(regra);
    const doBackup = readFileSync('scripts/backup.mjs', 'utf8').match(regra);

    expect(doApp, 'src/lib/uploads.ts precisa resolver UPLOAD_ROOT com essa regra').not.toBeNull();
    expect(doBackup, 'scripts/backup.mjs precisa resolver UPLOAD_ROOT com essa regra').not.toBeNull();
    expect([doBackup![1], doBackup![2]]).toEqual([doApp![1], doApp![2]]);
  });

  it('o backup empacota as fotos — o banco sozinho não devolve a barbearia', () => {
    // §3.7: pg_dump não toca no volume. Sem esta parte, volume morto =
    // barbearia sem logo, sem capa e sem galeria, com o banco intacto.
    const fonte = readFileSync('scripts/backup.mjs', 'utf8');
    expect(fonte).toMatch(/UPLOAD_ROOT/);
    expect(fonte).toMatch(/-fotos\.tar\.gz|SUFIXO_FOTOS/);
  });

  it('o boot avisa se o pg_dump não estiver lá', () => {
    // Não basta instalar: se alguém trocar a imagem base, o aviso é o que
    // transforma "backup silenciosamente quebrado" em "erro na tela do deploy".
    expect(readFileSync('scripts/startup.mjs', 'utf8')).toMatch(/pg_dump/);
  });
});

describe('os comandos do package.json apontam para arquivos que existem', () => {
  const scripts: Record<string, string> = pkg.scripts ?? {};

  it('nenhum script chama um arquivo de scripts/ que foi apagado', () => {
    const quebrados: string[] = [];
    for (const [nome, comando] of Object.entries(scripts)) {
      for (const [, caminho] of comando.matchAll(/(scripts\/[\w.-]+)/g)) {
        if (!existsSync(caminho)) quebrados.push(`${nome} → ${caminho}`);
      }
    }
    expect(quebrados).toEqual([]);
  });

  it('nenhum script roda `drizzle-kit push` ou `drizzle-kit generate`', () => {
    // `push` aplica ALTER na hora, sem migration e sem revisão; `generate`
    // escreveria em drizzle/ uma migration numerada pelo Drizzle, misturada
    // com as escritas à mão. As migrations aqui são .sql conferidas por hash.
    //
    // A checagem é pela INVOCAÇÃO, não pela palavra: o comando que recusa se
    // chama drizzle-kit-desativado.mjs e citar o nome não é rodar a coisa.
    const rodam = Object.entries(scripts)
      .filter(([, c]) => /(^|[\s/])drizzle-kit\s+(push|generate)\b/.test(c))
      .map(([n]) => n);
    expect(rodam).toEqual([]);
  });

  it('existe um caminho para aplicar migration e outro para criar barbearia', () => {
    expect(scripts['db:migrate']).toMatch(/startup\.mjs/);
    expect(scripts['db:provisionar']).toMatch(/provisionar\.mts/);
  });
});

describe('a suíte roda na máquina de quem não tem banco', () => {
  // POR QUE ESTE CASO EXISTE
  //
  // `src/db/index.ts` estourava no TOPO do módulo quando `DATABASE_URL` não
  // estava definida. Parecia rigor e era um buraco: `lib/tenant.ts` importa de
  // lá, e `lib/uploads.ts` importa de `tenant.ts` — então testes que não têm
  // nada a ver com banco quebravam no import, antes de o `describe.skipIf` ter
  // chance de pular.
  //
  // O efeito só aparecia em quem não exporta a variável — ou seja, na máquina de
  // desenvolvimento, nunca aqui. Foi assim que 10 casos ficaram vermelhos sem
  // ninguém notar.
  it('importar o módulo de banco sem DATABASE_URL não estoura', async () => {
    const guardado = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();
    try {
      await expect(import('../src/db/index.js')).resolves.toBeDefined();
    } finally {
      if (guardado !== undefined) process.env.DATABASE_URL = guardado;
      vi.resetModules();
    }
  });

  it('mas CONSULTAR sem DATABASE_URL continua estourando, com a mesma mensagem', async () => {
    // O erro não sumiu, mudou de hora: sai quando alguém usa o banco, não
    // quando alguém importa um tipo.
    const guardado = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();
    try {
      const { dbDono } = await import('../src/db/index.js');
      expect(() => dbDono.select()).toThrow(/DATABASE_URL não definido/);
    } finally {
      if (guardado !== undefined) process.env.DATABASE_URL = guardado;
      vi.resetModules();
    }
  });

  it('existe um jeito de rodar a suíte INTEIRA, e o banco dele passa na guarda', () => {
    // `npm test` sem banco pula 84 casos. O caminho completo precisa existir e
    // apontar para um banco cujo nome termine em _test — senão
    // `tests/guardaBanco.ts` recusa rodar, com razão: a suíte faz DROP SCHEMA.
    expect(pkg.scripts['test:db']).toMatch(/scripts\/testar\.mjs/);

    const compose = readFileSync('docker-compose.test.yml', 'utf8');
    expect(compose).toMatch(/POSTGRES_DB:\s*\S+_test\b/);

    // Sem volume nomeado: banco de teste que sobrevive ao `down` é banco sujo,
    // e teste que depende do estado de ontem falha na terça sem ter mudado nada.
    expect(compose).not.toMatch(/^\s*volumes:/m);
  });

  it('o boot de produção continua recusando subir sem DATABASE_URL', () => {
    // É o que torna seguro adiar o erro para o uso: quem garante que o servidor
    // não sobe sem banco é o CMD, que roda o migrador ANTES e encadeia com `&&`.
    const cmd = dockerfile.match(/CMD \[([^\]]+)\]/s)?.[1] ?? '';
    expect(cmd).toMatch(/startup\.mjs/);
    expect(cmd).toMatch(/startup\.mjs\s*&&/);
  });
});
