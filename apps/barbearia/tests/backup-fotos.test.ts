// O backup salva as fotos, não só o banco — `PENDENCIAS-ABERTAS.md` §3.7.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// `pg_dump` salva o banco e nada do volume. O logo, a foto de capa, o favicon,
// a galeria e as fotos de produto viviam só em `/data/uploads`, sem cópia em
// lugar nenhum. Se o volume morresse, o banco voltava inteiro e a barbearia
// perdia a identidade visual — que é justamente o trabalho manual do dono.
// Recuperar significaria pedir as fotos de novo para um cliente pagante.
//
// O defeito é invisível pelo lado de dentro: o backup roda, diz "✓ criado", e
// está mesmo criado. Só que pela metade. Por isso os casos abaixo conferem o
// CONTEÚDO do arquivo, e não o fato de ele existir.
//
// Precisa de Postgres (o dump é de verdade). Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { exigirBancoDeTeste } from './guardaBanco.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

/**
 * `pg_dump` é um binário do cliente do Postgres, e `scripts/backup.mjs` é um
 * wrapper dele. Ele existe na imagem de produção (o `Dockerfile` instala, e
 * `tests/deploy.test.ts` vigia isso) e costuma NÃO existir na máquina de
 * desenvolvimento de quem usa o Postgres só dentro de container.
 *
 * ⚠️ Pular é honesto; pular em silêncio não é. `tests/avisoBanco.ts` avisa na
 * saída, do mesmo jeito que avisa quando falta banco.
 */
const TEM_PGDUMP = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0;

/**
 * Mapa `caminho relativo -> hash do conteúdo` de uma árvore de arquivos.
 *
 * ⚠️ Isto já foi `execFileSync('diff', ['-r', ...])`, que é mais curto de
 * escrever e **não existe no Windows** — a máquina de desenvolvimento deste
 * projeto. O caso passava aqui e quebrava lá com `spawnSync diff ENOENT`: um
 * vermelho que não falava do backup, que é como se ensina a ignorar vermelho.
 *
 * Comparar em Node também diz melhor o que deu errado: o que falta, o que
 * sobra e o que mudou de conteúdo, em vez de um código de saída.
 */
function arvore(raizDir: string, atual = raizDir, acc = new Map<string, string>()): Map<string, string> {
  for (const nome of readdirSync(atual)) {
    const caminho = join(atual, nome);
    if (statSync(caminho).isDirectory()) arvore(raizDir, caminho, acc);
    else acc.set(
      relative(raizDir, caminho).split(sep).join('/'),
      createHash('sha256').update(readFileSync(caminho)).digest('hex'),
    );
  }
  return acc;
}

let raiz: string;
let pastaBackup: string;
let pastaFotos: string;

/** `backup.mjs` lê o ambiente no topo do módulo: recarrega a cada caso. */
async function backupCom(fotos: string): Promise<Record<string, unknown>> {
  vi.resetModules();
  vi.stubEnv('BACKUP_DIR', pastaBackup);
  vi.stubEnv('UPLOAD_ROOT', fotos);
  const mod = await import('../scripts/backup.mjs');
  return (await mod.runBackup()) as Record<string, unknown>;
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'bkfotos-'));
  pastaBackup = join(raiz, 'backups');
  pastaFotos = join(raiz, 'uploads');
  mkdirSync(pastaBackup, { recursive: true });
  mkdirSync(join(pastaFotos, 'logo'), { recursive: true });
  mkdirSync(join(pastaFotos, 'galeria'), { recursive: true });
  writeFileSync(join(pastaFotos, 'logo', 'logo-abc.webp'), 'conteudo-do-logo');
  writeFileSync(join(pastaFotos, 'galeria', 'g1.webp'), 'foto-1');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(raiz, { recursive: true, force: true });
});

describe.skipIf(!TEM_BANCO || !TEM_PGDUMP)('o backup das fotos', () => {
  it('gera o arquivo das fotos junto com o do banco', async () => {
    const r = await backupCom(pastaFotos);

    expect(r.dest).toMatch(/\.sql\.gz$/);
    expect(r.fotos).toMatch(/-fotos\.tar\.gz$/);
    expect(r.erroFotos).toBeNull();
  });

  it('as fotos voltam idênticas — é isto que o §3.7 comprava', async () => {
    // Arquivo que existe e não restaura é o mesmo que arquivo nenhum, com a
    // desvantagem de dar a impressão de que existe backup.
    const r = await backupCom(pastaFotos);

    const destino = join(raiz, 'restaurado');
    mkdirSync(destino, { recursive: true });
    execFileSync('tar', ['-xzf', String(r.fotos), '-C', destino]);

    // Compara a árvore inteira: nome, conteúdo e o que sobra dos dois lados.
    const original = arvore(pastaFotos);
    const voltou = arvore(destino);

    expect([...voltou.keys()].sort()).toEqual([...original.keys()].sort());
    for (const [caminho, hash] of original) {
      expect(voltou.get(caminho), `conteúdo de ${caminho}`).toBe(hash);
    }
  });

  it('os caminhos dentro do arquivo são relativos — restauração não fica presa à máquina', async () => {
    const r = await backupCom(pastaFotos);
    const lista = execFileSync('tar', ['-tzf', String(r.fotos)], { encoding: 'utf8' });

    // Caminho absoluto no tar amarraria a restauração ao mesmo ponto de montagem.
    expect(lista).not.toMatch(/^\//m);
    expect(lista).toContain('logo/logo-abc.webp');
  });

  it('barbearia sem foto nenhuma não gera arquivo vazio', async () => {
    const vazia = join(raiz, 'sem-fotos');
    mkdirSync(vazia, { recursive: true });

    const r = await backupCom(vazia);

    expect(r.dest).toMatch(/\.sql\.gz$/);   // o banco continua saindo
    expect(r.fotos).toBeNull();
    expect(readdirSync(pastaBackup).filter((f) => f.includes('-fotos.'))).toEqual([]);
  });

  it('a retenção apaga o arquivo de fotos velho, igual ao do banco', async () => {
    // Sem isto o volume enche de fotos antigas até o disco acabar — e disco
    // cheio derruba o banco junto.
    const velho = join(pastaBackup, 'barbearia_2020-01-01-00-00-00-fotos.tar.gz');
    writeFileSync(velho, 'arquivo antigo');
    const antiguidade = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    utimesSync(velho, antiguidade, antiguidade);

    await backupCom(pastaFotos);

    expect(readdirSync(pastaBackup)).not.toContain('barbearia_2020-01-01-00-00-00-fotos.tar.gz');
  });
});
