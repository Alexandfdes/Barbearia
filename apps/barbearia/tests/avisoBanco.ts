/**
 * Avisa, na cara, quando a suíte rodou só pela metade.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * Caso pulado não aparece: o vitest escreve "84 skipped" no meio de vinte
 * linhas verdes, e ninguém lê. O resultado é o pior tipo de verde — o que
 * autoriza o commit sem ter olhado a parte que mexe com dado de cliente.
 *
 * São dois motivos possíveis, e o remédio de cada um é diferente.
 */
import { spawnSync } from 'node:child_process';

function quadro(titulo: string, linhas: string[]) {
  const largura = Math.max(titulo.length, ...linhas.map((l) => l.length)) + 2;
  const borda = (e: string, m: string, d: string) => e + m.repeat(largura) + d;
  const linha = (t: string) => `  │ ${t.padEnd(largura - 2)} │`;

  console.log('');
  console.log('  ' + borda('┌', '─', '┐'));
  console.log(linha(titulo));
  console.log('  ' + borda('├', '─', '┤'));
  for (const l of linhas) console.log(linha(l));
  console.log('  ' + borda('└', '─', '┘'));
  console.log('');
}

export function setup() {
  if (!process.env.DATABASE_URL) {
    quadro('⚠️  SEM BANCO: os casos que precisam de Postgres serão PULADOS', [
      'Ficam de fora login, agendamento, settings, tenants, RLS, a carga',
      'da migração e o backup das fotos — a parte que mexe com dado de',
      'cliente.',
      '',
      'Para rodar a suíte inteira:   npm run test:db',
    ]);
    return;   // sem banco, o aviso do pg_dump é ruído: aquele bloco já é pulado
  }

  if (spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status !== 0) {
    quadro('⚠️  SEM pg_dump: o backup das fotos será PULADO', [
      '`scripts/backup.mjs` é um wrapper de `pg_dump`, e ele não está no',
      'PATH desta máquina. São 5 casos — os que provam que as fotos',
      'entram no backup e voltam idênticas (PENDENCIAS-ABERTAS.md §3.7).',
      '',
      'Na imagem de produção ele existe: o Dockerfile instala o',
      'postgresql16-client, e tests/deploy.test.ts falha se alguém tirar.',
      '',
      'Para rodar aqui também, instale o cliente do Postgres:',
      '  Windows:  winget install PostgreSQL.PostgreSQL.16',
      '  Debian:   apt-get install -y postgresql-client',
    ]);
  }
}
