#!/usr/bin/env node
/**
 * O ensaio de restauração (05/11/2026): restaura um backup num banco À PARTE e confere que ele
 * voltou inteiro — o banco e as fotos.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────────
 *
 * Backup que nunca foi restaurado é suposição. O envio para o Backblaze funciona desde 04/11, e o
 * arquivo de lá nunca voltou (revisão de 05/11/2026, `docs/PENDENCIAS-ABERTAS.md` §3.3). O dia de
 * descobrir que ele não restaura não pode ser o dia em que a VPS morreu.
 *
 * ── USO ──────────────────────────────────────────────────────────────────────
 *
 *   ENSAIO_DATABASE_URL=postgres://usuario:senha@localhost:5432/ensaio \
 *     node scripts/ensaiar-restauracao.mjs \
 *       --banco=barbearia_2026-11-06-03-00-00.sql.gz \
 *       --fotos=barbearia_2026-11-06-03-00-00-fotos.tar.gz
 *
 * `--fotos` é opcional — sem ele, confere só o banco, e diz isso.
 *
 * ⚠️ NUNCA NO BANCO DE PRODUÇÃO. O destino é `ENSAIO_DATABASE_URL`, não `DATABASE_URL`, e o
 * script recusa se as duas apontarem para o mesmo banco, ou se o destino já tiver tabelas: um
 * banco vazio, criado para isto (`CREATE DATABASE ensaio`), e apagado depois.
 *
 * ── O QUE CONFERE ────────────────────────────────────────────────────────────
 *
 *  1. O arquivo é um dump inteiro: termina com a linha de fim do `pg_dump` (a mesma regra do
 *     `scripts/backup.mjs`, que não aceita como backup um arquivo cortado).
 *  2. Ele restaura sem erro nenhum — `psql` com `ON_ERROR_STOP`.
 *  3. O que voltou: as barbearias por situação, a equipe, os serviços, os agendamentos, as
 *     fotos da galeria, e a última migration — que diz de que versão do código ele é.
 *  4. A rede: o RLS ligado em toda tabela com `tenant_id`.
 *  5. As fotos: o arquivo abre inteiro, os caminhos são relativos (restaurar é
 *     `tar -xzf … -C /data/uploads`), e cada foto que o banco cita está nele — o logo, a capa,
 *     o ícone, a prévia, a galeria, as fotos de produto e de combo.
 *
 * Sai com 0 só se tudo conferir. Precisa de `psql` e `tar` — os dois estão na imagem do app.
 *
 * ⚠️ O papel `barbearia_app` (migration 0003) é do SERVIDOR do Postgres, não do banco: as
 * políticas do dump o citam, e num servidor sem ele a restauração para no meio. O script o cria,
 * sem login, se não existir — ou diz o comando, se não tiver permissão.
 *
 * ⚠️ Restaurou de verdade, em produção? O passo seguinte é o `scripts/permissoes-do-app.mjs`
 * (`docs/PENDENCIAS-ABERTAS.md` §3.11). Este script é o ensaio, não a restauração.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);

/** O mesmo banco? Servidor, porta e nome — o usuário e a senha não mudam o destino. */
export function mesmoBanco(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const porta = (u) => u.port || '5432';
    const nome = (u) => decodeURIComponent(u.pathname.replace(/^\//, ''));
    const servidor = (u) => u.hostname.toLowerCase().replace(/^(localhost|127\.0\.0\.1|\[::1\])$/, 'local');
    return servidor(x) === servidor(y) && porta(x) === porta(y) && nome(x) === nome(y);
  } catch {
    return false;
  }
}

/**
 * De um endereço de foto gravado no banco, o caminho dentro do arquivo das fotos — que é o
 * conteúdo de `UPLOAD_ROOT` (`scripts/backup.mjs`). `null` para o que não é foto nossa.
 *
 * A barbearia 1 guarda no formato legado, sem o slug (`src/lib/uploads.ts`).
 */
export function entradaDaFoto(url, barbearia) {
  const caminho = String(url ?? '').split(/[?#]/)[0];
  if (caminho.startsWith('/api/media/')) return caminho.slice('/api/media/'.length) || null;
  if (caminho.startsWith('/api/products/image/')) {
    const arquivo = caminho.slice('/api/products/image/'.length);
    if (!arquivo) return null;
    return barbearia.id === 1 ? `products/${arquivo}` : `${barbearia.slug}/products/${arquivo}`;
  }
  return null;
}

/** Os caminhos do `tar -tzf`, sem o `./` do começo; os de pasta ficam de fora. */
export function entradasDoTar(lista) {
  return lista.split('\n').map((l) => l.trim()).filter((l) => l && !l.endsWith('/')).map((l) => l.replace(/^\.\//, ''));
}

/** Caminho que, extraído, sairia da pasta: absoluto, ou com `..`. */
export const caminhoQueFoge = (e) => e.startsWith('/') || e.split('/').includes('..');

function terminaComoDump(caminho) {
  return new Promise((resolve) => {
    let fim = '';
    const leitor = createReadStream(caminho).pipe(createGunzip());
    leitor.on('data', (d) => { fim = (fim + d.toString('utf8')).slice(-400); });
    leitor.on('end', () => resolve(/PostgreSQL database dump complete/.test(fim)));
    leitor.on('error', () => resolve(false));
  });
}

function restaurar(arquivo, url) {
  return new Promise((resolve, reject) => {
    const psql = spawn('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let erro = '';
    psql.stderr.on('data', (d) => { erro += d.toString(); });
    psql.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('psql não encontrado: instale o cliente do Postgres.') : e));
    psql.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`psql saiu com ${codigo}: ${erro.trim().slice(-600)}`))));
    const leitor = createReadStream(arquivo).pipe(createGunzip());
    leitor.on('error', (e) => { psql.kill(); reject(e); });
    leitor.pipe(psql.stdin);
  });
}

function listarTar(arquivo) {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-tzf', arquivo], { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erro = '';
    tar.stdout.on('data', (d) => { saida += d.toString(); });
    tar.stderr.on('data', (d) => { erro += d.toString(); });
    tar.on('error', (e) => reject(e));
    tar.on('close', (codigo) => (codigo === 0 ? resolve(saida) : reject(new Error(`tar saiu com ${codigo}: ${erro.trim()}`))));
  });
}

async function main() {
  const banco = arg('banco');
  const fotos = arg('fotos');
  const destino = process.env.ENSAIO_DATABASE_URL?.trim();
  const falhas = [];
  const ok = (texto) => console.log(`  ✓ ${texto}`);
  const falha = (texto) => { console.log(`  ✗ ${texto}`); falhas.push(texto); };

  if (!banco) throw new Error('Diga o arquivo do banco: --banco=barbearia_<data>.sql.gz');
  if (!destino) throw new Error('Diga o banco do ensaio em ENSAIO_DATABASE_URL — um banco vazio, criado para isto.');
  if (process.env.DATABASE_URL && mesmoBanco(destino, process.env.DATABASE_URL)) {
    throw new Error('ENSAIO_DATABASE_URL aponta para o mesmo banco que DATABASE_URL. O ensaio é num banco À PARTE.');
  }
  for (const f of [banco, fotos].filter(Boolean)) {
    if (!existsSync(f) || !statSync(f).isFile()) throw new Error(`Arquivo não encontrado: ${f}`);
  }

  const sql = postgres(destino, { max: 1, onnotice: () => {} });
  try {
    const [{ tabelas }] = await sql`SELECT count(*)::int AS tabelas FROM pg_tables WHERE schemaname = 'public'`;
    if (tabelas > 0) throw new Error(`O banco do ensaio não está vazio (${tabelas} tabelas). Use um banco novo.`);

    console.log(`O banco — ${banco}`);
    if (await terminaComoDump(banco)) ok('é um dump inteiro');
    else { falha('não termina como dump do pg_dump: cortado, ou não é um dump'); return falhas; }

    const [papel] = await sql`SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app'`;
    if (!papel) {
      try {
        await sql`CREATE ROLE barbearia_app NOLOGIN`;
        ok('o papel barbearia_app não existia neste servidor: criado, sem login');
      } catch {
        throw new Error('O papel barbearia_app não existe neste servidor, e não pude criar. Rode: CREATE ROLE barbearia_app NOLOGIN;');
      }
    }

    const inicio = Date.now();
    await restaurar(banco, destino);
    ok(`restaurou sem erro, em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);

    // A tabela é do boot (`scripts/startup.mjs`): banco que não passou por ele não a tem — e
    // não se sabe de que versão do código ele é.
    const [{ temRegistro }] = await sql`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS "temRegistro"`;
    if (!temRegistro) {
      falha('sem schema_migrations: o banco não passou pelo boot, e não se sabe de que versão ele é');
    } else {
      const [migracao] = await sql`SELECT max(nome) AS ultima, count(*)::int AS quantas FROM schema_migrations`;
      ok(`migrations: ${migracao.quantas}, a última ${migracao.ultima}`);
    }
    const porStatus = await sql`SELECT status, count(*)::int AS n FROM tenants GROUP BY status ORDER BY status`;
    const [c] = await sql`
      SELECT (SELECT count(*)::int FROM tenants) AS barbearias,
             (SELECT count(*)::int FROM barbers WHERE active) AS equipe,
             (SELECT count(*)::int FROM services) AS servicos,
             (SELECT count(*)::int FROM appointments) AS agendamentos,
             (SELECT count(*)::int FROM gallery_images) AS galeria`;
    if (c.barbearias === 0) falha('nenhuma barbearia no dump');
    else ok(`${c.barbearias} barbearia(s) — ${porStatus.map((s) => `${s.n} ${s.status}`).join(', ')}`);
    ok(`${c.equipe} na equipe (ativos), ${c.servicos} serviço(s), ${c.agendamentos} agendamento(s), ${c.galeria} foto(s) na galeria`);

    const semRede = await sql`
      SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE c.relkind = 'r' AND NOT c.relrowsecurity
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
       ORDER BY 1`;
    if (semRede.length) falha(`tabela com tenant_id sem RLS: ${semRede.map((t) => t.relname).join(', ')}`);
    else ok('o RLS ligado em toda tabela com tenant_id');

    if (!fotos) {
      console.log('As fotos — não conferidas: falta --fotos=<arquivo>-fotos.tar.gz');
      return falhas;
    }
    console.log(`As fotos — ${fotos}`);
    let entradas;
    try {
      entradas = entradasDoTar(await listarTar(fotos));
      ok(`o arquivo abre inteiro: ${entradas.length} arquivo(s)`);
    } catch (e) {
      falha(`o arquivo das fotos não abre: ${e.message}`);
      return falhas;
    }
    const fogem = entradas.filter(caminhoQueFoge);
    if (fogem.length) falha(`caminho que sairia da pasta: ${fogem.slice(0, 3).join(', ')}`);
    else ok('os caminhos são relativos');

    const citadas = await sql`
      SELECT t.id, t.slug, f.url FROM tenants t
        JOIN LATERAL (
          SELECT s.logo_path AS url FROM settings s WHERE s.tenant_id = t.id
          UNION ALL SELECT s.hero_path FROM settings s WHERE s.tenant_id = t.id
          UNION ALL SELECT s.og_path FROM settings s WHERE s.tenant_id = t.id
          UNION ALL SELECT s.favicon_path FROM settings s WHERE s.tenant_id = t.id
          UNION ALL SELECT g.path FROM gallery_images g WHERE g.tenant_id = t.id
          UNION ALL SELECT p.image FROM products p WHERE p.tenant_id = t.id
          UNION ALL SELECT k.image FROM combos k WHERE k.tenant_id = t.id
        ) f ON f.url IS NOT NULL AND f.url <> ''`;
    const noArquivo = new Set(entradas);
    const conferidas = citadas.map((l) => ({ ...l, entrada: entradaDaFoto(l.url, l) })).filter((l) => l.entrada);
    const faltam = conferidas.filter((l) => !noArquivo.has(l.entrada));
    if (faltam.length) {
      falha(`${faltam.length} de ${conferidas.length} foto(s) citada(s) no banco não estão no arquivo — ex.: ${faltam.slice(0, 3).map((l) => `${l.slug}: ${l.entrada}`).join('; ')}`);
    } else {
      ok(`as ${conferidas.length} foto(s) que o banco cita estão no arquivo`);
    }
    return falhas;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Só roda quando chamado — o teste importa as funções de cima.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((falhas) => {
      if (falhas.length) {
        console.log(`\n✗ O ensaio NÃO passou: ${falhas.length} problema(s) acima.`);
        process.exit(1);
      }
      console.log('\n✓ O ensaio passou. Apague o banco do ensaio (DROP DATABASE) quando terminar.');
    })
    .catch((e) => {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    });
}
