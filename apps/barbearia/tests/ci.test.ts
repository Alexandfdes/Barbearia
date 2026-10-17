// O CI: a suíte com banco, pulado contando como falha, e o deploy só da main verde.
//
// ── O QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────────────
//
// Desde 10/10/2026 a `main` vai para produção. O CI (`.github/workflows/testes.yml`)
// é o que separa um merge quebrado do app no ar — e três jeitos de ele ficar
// verde sem ter conferido nada não aparecem olhando o arquivo:
//
// 1. o Postgres do CI sair de sincronia com o dos testes locais;
// 2. o banco não chegar aos testes — eles são PULADOS, e o vitest sai verde
//    (`scripts/conferir-resultado-testes.mjs` é quem recusa);
// 3. o deploy rodar fora da main, ou sem esperar a suíte.
//
// Não precisa de banco.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORKFLOW = readFileSync('../../.github/workflows/testes.yml', 'utf8');
const COMPOSE = readFileSync('docker-compose.test.yml', 'utf8');

/** O trecho de um job: do cabeçalho dele até o próximo job de mesmo recuo. */
function job(nome: string): string {
  const i = WORKFLOW.indexOf(`\n  ${nome}:\n`);
  expect(i, `job "${nome}" no workflow`).toBeGreaterThan(-1);
  const resto = WORKFLOW.slice(i + 1);
  const fim = resto.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return fim === -1 ? resto : resto.slice(0, fim + 1);
}

describe('o workflow', () => {
  it('o Postgres do CI é a mesma imagem do docker-compose dos testes locais', () => {
    const doCompose = COMPOSE.match(/image:\s*(postgres:\S+)/)?.[1];
    const doCi = job('barbearia').match(/image:\s*(postgres:\S+)/)?.[1];
    expect(doCompose).toBeTruthy();
    expect(doCi).toBe(doCompose);
  });

  it('a imagem (17/10/2026): construída do contexto do EasyPanel, subida sobre um banco na 0009, com as conferências do primeiro deploy', () => {
    const i = job('imagem');
    expect(i.match(/image:\s*(postgres:\S+)/)?.[1]).toBe(COMPOSE.match(/image:\s*(postgres:\S+)/)?.[1]);
    expect(i).toContain('docker build -t fadeline-ci apps/barbearia');
    expect(i).toContain('node scripts/startup.mjs --ate=0009');
    // As linhas que o boot tem de imprimir — e que `scripts/startup.mjs` imprime de fato.
    const startup = readFileSync('scripts/startup.mjs', 'utf8');
    for (const linha of ['✓ backup antes das migrations', '✓ papel do app', '✓ Banco já estava em dia']) {
      expect(i, linha).toContain(linha);
      expect(startup, linha).toContain(linha);
    }
    expect(i).toContain('*-antes-da-0010.sql.gz');
    expect(i).toMatch(/test ! -e node_modules\/vitest/);
    expect(i).toContain('scripts/provisionar.mts');
    expect(i).toMatch(/if: failure\(\)\n\s+run: docker logs app/);
  });

  it('a suíte roda com DATABASE_URL, num banco que o guardaBanco aceita', () => {
    const url = job('barbearia').match(/DATABASE_URL:\s*(\S+)/)?.[1] ?? '';
    expect(url).toMatch(/^postgres:\/\//);
    expect(new URL(url).pathname).toMatch(/_test$/);
  });

  it('o relatório que o vitest grava é o mesmo que a conferência lê', () => {
    const b = job('barbearia');
    const gravado = b.match(/--outputFile\.json=(\S+)/)?.[1];
    expect(gravado).toBeTruthy();
    expect(b).toContain(`conferir-resultado-testes.mjs ${gravado}`);
  });

  it('a conferência vem DEPOIS da suíte, e roda mesmo quando ela falha', () => {
    const b = job('barbearia');
    expect(b.indexOf('conferir-resultado-testes.mjs')).toBeGreaterThan(b.indexOf('npx vitest run'));
    // `!cancelled()`: se a suíte falhar, a conferência ainda diz quantos pularam.
    expect(b).toMatch(/if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}[\s\S]{0,80}conferir-resultado-testes/);
  });

  it('o deploy espera o app verde E a imagem provada, e só sai de push na main', () => {
    const d = job('deploy');
    expect(d).toMatch(/needs:\s*\[\s*barbearia,\s*imagem\s*\]/);
    expect(d).toMatch(/if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  });

  it('a URL do deploy vem de segredo — nunca escrita no arquivo', () => {
    expect(job('deploy')).toContain('${{ secrets.EASYPANEL_DEPLOY_APP }}');
    expect(WORKFLOW).not.toMatch(/https?:\/\/[^\s"']*(easypanel|deploy)[^\s"']*/i);
  });

  it('o conferidor de tipos roda no job do app — e o deploy espera esse job', () => {
    // Zerado em 12/10/2026: um erro de tipo novo reprova, em vez de sumir no meio de 356.
    const pacote = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pacote.scripts.check).toBe('astro check');
    const b = job('barbearia');
    expect(b).toMatch(/\n\s+run: npm run check\n/);
    expect(b.indexOf('npm run check')).toBeGreaterThan(b.indexOf('npm ci'));
    expect(b.indexOf('npm run check')).toBeLessThan(b.indexOf('npm run build'));
  });

  it('e no job do site de vendas — ligado em 13/10/2026, também com zero erro', () => {
    // Até então o site de vendas nunca tinha sido conferido: eram 24 erros, todos da
    // descrição das funções do Node que faltava instalar.
    const pacote = JSON.parse(readFileSync('../vendas/package.json', 'utf8')) as {
      scripts: Record<string, string>; devDependencies?: Record<string, string>;
    };
    expect(pacote.scripts.check).toBe('astro check');
    expect(Object.keys(pacote.devDependencies ?? {})).toEqual(
      expect.arrayContaining(['@astrojs/check', 'typescript', '@types/node', '@types/better-sqlite3']),
    );
    const v = job('vendas');
    expect(v).toMatch(/\n\s+run: npm run check\n/);
    expect(v.indexOf('npm run check')).toBeGreaterThan(v.indexOf('npm ci'));
    expect(v.indexOf('npm run check')).toBeLessThan(v.indexOf('npm run build'));
  });

  it('o CI só lê o repositório', () => {
    expect(WORKFLOW).toMatch(/\npermissions:\n\s+contents: read\n/);
  });
});

describe('a conferência do relatório', () => {
  let pasta: string;
  beforeAll(() => { pasta = mkdtempSync(join(tmpdir(), 'ci-')); });
  afterAll(() => { rmSync(pasta, { recursive: true, force: true }); });

  function conferir(relatorio: Record<string, number>) {
    const arq = join(pasta, `r-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(arq, JSON.stringify(relatorio));
    const r = spawnSync(process.execPath, ['scripts/conferir-resultado-testes.mjs', arq], { encoding: 'utf8' });
    return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
  }

  const limpo = { numTotalTests: 639, numPassedTests: 639, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0 };

  it('passa quando tudo rodou', () => {
    expect(conferir(limpo).codigo).toBe(0);
  });

  it('RECUSA teste pulado — o banco que não chegou aos testes', () => {
    const r = conferir({ ...limpo, numPassedTests: 420, numPendingTests: 219 });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/219 foram pulados/);
  });

  it('recusa teste marcado como a fazer, falha e suíte vazia', () => {
    expect(conferir({ ...limpo, numTodoTests: 1 }).codigo).toBe(1);
    expect(conferir({ ...limpo, numFailedTests: 1 }).codigo).toBe(1);
    expect(conferir({ numTotalTests: 0 }).codigo).toBe(1);
  });

  it('recusa relatório que não existe', () => {
    const r = spawnSync(process.execPath, ['scripts/conferir-resultado-testes.mjs', join(pasta, 'nao-existe.json')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });
});
