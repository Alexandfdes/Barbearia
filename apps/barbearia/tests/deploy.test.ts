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
import { readFileSync, existsSync, readdirSync } from 'node:fs';

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
    // O importador da galeria do Bayron (25/09/2026) grava no mesmo volume.
    const doImportador = readFileSync('scripts/importar-galeria-bayron.mjs', 'utf8').match(regra);

    expect(doApp, 'src/lib/uploads.ts precisa resolver UPLOAD_ROOT com essa regra').not.toBeNull();
    expect(doBackup, 'scripts/backup.mjs precisa resolver UPLOAD_ROOT com essa regra').not.toBeNull();
    expect(doImportador, 'scripts/importar-galeria-bayron.mjs precisa resolver UPLOAD_ROOT com essa regra').not.toBeNull();
    expect([doBackup![1], doBackup![2]]).toEqual([doApp![1], doApp![2]]);
    expect([doImportador![1], doImportador![2]]).toEqual([doApp![1], doApp![2]]);
  });

  it('a imagem leva as fotos do carrossel do Bayron para o importador achar', () => {
    // Sem esta cópia, `node scripts/importar-galeria-bayron.mjs` no container
    // não acha as fotos (o `src/` não entra na imagem) e o site do Bayron fica
    // sem galeria depois da migração.
    expect(dockerfile).toMatch(/COPY --from=build \/app\/src\/assets\/fotos-videos\/carrosel\*\.jpg \.\/seed\/galeria-bayron\//);
    expect(readFileSync('scripts/importar-galeria-bayron.mjs', 'utf8')).toMatch(/'seed\/galeria-bayron'/);
  });

  it('o backup empacota as fotos — o banco sozinho não devolve a barbearia', () => {
    // §3.7: pg_dump não toca no volume. Sem esta parte, volume morto =
    // barbearia sem logo, sem capa e sem galeria, com o banco intacto.
    const fonte = readFileSync('scripts/backup.mjs', 'utf8');
    expect(fonte).toMatch(/UPLOAD_ROOT/);
    expect(fonte).toMatch(/-fotos\.tar\.gz|SUFIXO_FOTOS/);
  });

  it('o container tem saúde: o app travado é reiniciado, mas não no meio do backup do boot (26/10/2026)', () => {
    // Sem HEALTHCHECK, o app travado continuava com o processo vivo e nada o reiniciava.
    const inicio = dockerfile.indexOf('\nHEALTHCHECK ');
    const linha = inicio < 0 ? '' : dockerfile.slice(inicio, dockerfile.indexOf('\n\n', inicio));
    expect(linha).toMatch(/\/api\/saude/);
    expect(linha).toMatch(/process\.env\.PORT/);
    const partida = Number(linha.match(/--start-period=(\d+)m/)?.[1] ?? 0);
    expect(partida).toBeGreaterThanOrEqual(10);
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

  it('o boot de produção avisa quando o e-mail está desligado', () => {
    // E-mail desligado não dá erro em lugar nenhum: o dono pede a senha nova e
    // espera, e o aviso do fim do teste não chega. O aviso do boot é o lugar onde
    // se olha quando o deploy termina — conferido rodando em 09/10/2026.
    const fonte = readFileSync('scripts/startup.mjs', 'utf8');
    expect(fonte).toMatch(/function conferirEmail\(\)/);
    expect(fonte).toMatch(/if \(!soMigrations\) \{\s*conferirPgDump\(\);\s*conferirEmail\(\);/);
  });

  it('o `npm run dev` aplica as migrations pendentes antes de subir', () => {
    // Em 09/10/2026 a migration 0007 derrubou o ambiente do dono: o `npm run dev`
    // não migrava, e toda página respondia "column trial_ends_at does not exist"
    // até ele lembrar do `db:migrate`. Em produção o boot sempre migrou; só o
    // desenvolvimento tinha ficado de fora. O npm roda o `predev` sozinho.
    expect(scripts.predev).toMatch(/scripts\/startup\.mjs/);
    expect(scripts.predev).toMatch(/--so-migrations/);
    expect(readFileSync('scripts/startup.mjs', 'utf8')).toMatch(/--so-migrations/);
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
  });

  it('a raiz do monorepo delega TODO comando que se roda da raiz', () => {
    // ⚠️ Terceira vez que este buraco morde. `test:db` faltava em 11/09,
    // `test:watch` apareceu junto, e `db:migrate` faltava em 14/09 — descoberto
    // com o banco de desenvolvimento vazio e o servidor já no ar.
    //
    // O desenvolvimento acontece em `C:\DEV\barbearia`, a raiz. Script que só
    // existe dentro de `apps/barbearia` é script que não existe: o npm responde
    // "Missing script" e quem está com pressa acha que o comando mudou.
    const raiz = JSON.parse(readFileSync('../../package.json', 'utf8'));
    const PRECISAM_ESTAR_NA_RAIZ = [
      'dev', 'build', 'test', 'test:db', 'test:watch',
      'db:migrate', 'db:provisionar', 'db:seed-bayron', 'db:galeria-bayron',
    ];
    const faltando = PRECISAM_ESTAR_NA_RAIZ.filter((c) => !raiz.scripts?.[c]);
    expect(faltando).toEqual([]);

    // Delegar sem o `--` no fim engole os argumentos: `npm run db:provisionar --
    // --slug=x` chegaria no script sem o `--slug`.
    const comArgumentos = ['test:db', 'test:watch', 'db:migrate', 'db:provisionar', 'db:seed-bayron', 'db:galeria-bayron'];
    const semTraco = comArgumentos.filter((c) => !/--\s*"?$/.test(raiz.scripts[c]));
    expect(semTraco).toEqual([]);

    const compose = readFileSync('docker-compose.test.yml', 'utf8');
    expect(compose).toMatch(/POSTGRES_DB:\s*\S+_test\b/);

    // Sem volume nomeado: banco de teste que sobrevive ao `down` é banco sujo,
    // e teste que depende do estado de ontem falha na terça sem ter mudado nada.
    expect(compose).not.toMatch(/^\s*volumes:/m);
  });

  it('a raiz do monorepo delega TODO comando de teste do app', () => {
    // ⚠️ Este caso existe porque o erro já aconteceu: `test:db` foi criado só em
    // `apps/barbearia/package.json`, e quem roda da raiz — que é de onde se
    // roda — levou "Missing script: test:db".
    //
    // A raiz é a porta de entrada do monorepo. Comando que existe só lá dentro
    // não existe para quem usa.
    const raiz = '../../package.json';
    if (!existsSync(raiz)) return;   // app fora do monorepo: nada a delegar

    const daRaiz: Record<string, string> = JSON.parse(readFileSync(raiz, 'utf8')).scripts ?? {};
    const doApp = Object.keys(pkg.scripts ?? {}).filter((n) => n.startsWith('test'));

    const naoDelegados = doApp.filter((n) => !(n in daRaiz));
    expect(naoDelegados).toEqual([]);
  });

  it('o boot de produção continua recusando subir sem DATABASE_URL', () => {
    // É o que torna seguro adiar o erro para o uso: quem garante que o servidor
    // não sobe sem banco é o CMD, que roda o migrador ANTES e encadeia com `&&`.
    const cmd = dockerfile.match(/CMD \[([^\]]+)\]/s)?.[1] ?? '';
    expect(cmd).toMatch(/startup\.mjs/);
    expect(cmd).toMatch(/startup\.mjs\s*&&/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A IMAGEM LEVA SÓ O QUE RODA EM PRODUÇÃO (11/10/2026)
//
// Até essa data, o estágio final copiava o `node_modules` inteiro do build:
// TypeScript, vitest, drizzle-kit e o esbuild antigo que vem com ele — 4 falhas de
// segurança moderadas conhecidas, nada disso usado em produção. Agora um estágio
// à parte instala só as dependências de produção, do mesmo lock.
//
// O risco dessa troca é um script de produção importar um pacote que é só de
// desenvolvimento: o build passa, a imagem sobe, e o script quebra no console do
// container no dia em que alguém precisar dele. Foi conferido rodando: com o
// `npm ci --omit=dev`, o boot, as migrations, o backup, o provisionador e o
// roteiro E2E inteiro funcionam. Os casos abaixo impedem a volta.

/** Os pacotes importados por um arquivo — `node:` e caminhos relativos fora. */
function pacotesImportados(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, 'utf8');
  const nomes = new Set<string>();
  // `from 'x'`, `import('x')` e o import só pelo efeito, `import 'x'`.
  for (const m of fonte.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('node:')) continue;
    nomes.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  }
  return [...nomes];
}

/** O que o provisionador importa de `src/`, seguindo os imports relativos. */
function fechoDoProvisionador(): string[] {
  const vistos = new Set<string>();
  const fila = ['scripts/provisionar.mts'];
  while (fila.length) {
    const arquivo = fila.pop()!;
    if (vistos.has(arquivo)) continue;
    vistos.add(arquivo);
    for (const m of readFileSync(arquivo, 'utf8').matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g)) {
      const base = new URL(m[1], `file:///${arquivo}`).pathname.slice(1);
      const real = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`].find((c) => existsSync(c));
      if (real) fila.push(real);
    }
  }
  return [...vistos].sort();
}

/**
 * Pacotes que scripts importam e que NÃO estão em `dependencies` — de propósito,
 * cada um com o motivo. A lista fecha nos dois sentidos: pacote novo aqui precisa
 * de justificativa, e exceção que nenhum script usa mais sai.
 *
 * Vazia desde 12/10/2026: o `better-sqlite3` estava aqui pelos dois scripts da
 * época do SQLite (`seed-relatorio-demo`, `wipe-appointments`), apagados nesse dia.
 */
const FORA_DA_PRODUCAO: Record<string, string> = {};

describe('a imagem leva só o que roda em produção', () => {
  it('o node_modules da imagem vem de um `npm ci --omit=dev` à parte, não do build', () => {
    expect(dockerfile).toMatch(/FROM node:22-alpine AS deps[\s\S]*?RUN npm ci --omit=dev/);
    expect(dockerfile).toMatch(/COPY --from=deps \/app\/node_modules \.\/node_modules/);
    expect(dockerfile).not.toMatch(/COPY --from=build \/app\/node_modules/);
  });

  it('todo pacote que um script importa está em `dependencies` — ou fora de propósito, com o motivo', () => {
    const deps = new Set(Object.keys(pkg.dependencies ?? {}));
    const arquivos = [
      ...readdirSync('scripts').filter((f) => /\.(mjs|mts)$/.test(f)).map((f) => `scripts/${f}`),
      ...fechoDoProvisionador().filter((f) => f.startsWith('src/')),
    ];
    expect(arquivos.length).toBeGreaterThan(15); // o recorte achou os scripts
    const faltando = arquivos.flatMap((a) => pacotesImportados(a)
      .filter((p) => !deps.has(p) && !(p in FORA_DA_PRODUCAO))
      .map((p) => `${a} → ${p}`));
    expect(faltando, 'mova o pacote para dependencies, ou justifique em FORA_DA_PRODUCAO').toEqual([]);
    const usados = new Set(arquivos.flatMap((a) => pacotesImportados(a)));
    const semUso = Object.keys(FORA_DA_PRODUCAO).filter((p) => !usados.has(p));
    expect(semUso, 'exceção que nenhum script importa mais: tire de FORA_DA_PRODUCAO').toEqual([]);
  });

  it('o provisionador roda no container: o tsx é de produção, e o `src/` que ele importa entra na imagem', () => {
    expect(pkg.dependencies?.tsx, 'o `npm run db:provisionar` roda com o tsx').toBeTruthy();
    expect(pkg.devDependencies?.tsx).toBeUndefined();
    expect(pkg.scripts['db:provisionar']).toMatch(/^tsx scripts\/provisionar\.mts$/);
    const pastas = [...new Set(fechoDoProvisionador().filter((f) => f.startsWith('src/'))
      .map((f) => f.split('/').slice(0, 2).join('/')))].sort();
    expect(pastas).toEqual(['src/db', 'src/lib']);
    for (const pasta of pastas) {
      expect(dockerfile).toContain(`COPY --from=build /app/${pasta} ./${pasta}`);
    }
  });
});
