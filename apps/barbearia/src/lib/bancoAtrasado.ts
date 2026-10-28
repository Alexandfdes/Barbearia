/**
 * O banco atrás do código, no desenvolvimento: chegou migration nova e o banco ainda não a
 * tem. A tela diz isso, e o que fazer — em vez de mostrar a primeira consulta que falha.
 *
 * ── POR QUE ───────────────────────────────────────────────────────────────────
 *
 * O `npm run dev` aplica as migrations quando liga (`predev` → `scripts/startup.mjs`), e só
 * então. Com o servidor ligado de um dia para o outro, o código novo chega e o Astro o
 * recarrega sozinho; as migrations dele, não. Em 13/10/2026, o servidor ligado às 16h de
 * 12/10 recebeu a 0015 e a 0016, e toda página caiu em
 * `Failed query: select ... "carencia_ate" ... from "tenants"`, sem dizer o que fazer
 * (`docs/PENDENCIAS-ABERTAS.md` §2.42). Em 09/10 tinha sido a 0007, com
 * "column trial_ends_at does not exist".
 *
 * ── COMO ──────────────────────────────────────────────────────────────────────
 *
 * Compara a pasta `drizzle/` com a `schema_migrations` — o registro que o
 * `scripts/startup.mjs` grava. A pasta é lida a cada requisição, o que é rápido; o banco, só
 * quando a pasta muda — e de novo, a cada 2 segundos, enquanto faltar alguma ou ele não
 * responder: a tela sai sozinha quando alguém aplica as migrations por fora. Banco que não
 * responde não é "atrasado": a checagem fica quieta, e o erro de sempre aparece.
 *
 * Só no desenvolvimento (`src/middleware.ts`): em produção o boot aplica tudo antes de o
 * servidor subir, e nome de migration não é coisa para mostrar a visitante.
 */
import { readdirSync } from 'node:fs';
import { sqlConn } from '../db/index.js';
import { escaparHtml } from './html.js';

/** A mesma pasta que o `scripts/startup.mjs` lê, do ponto de vista de quem roda o `npm run dev`. */
const PASTA = 'drizzle';
const DE_NOVO_EM_MS = 2000;

/** As migrations da pasta, em ordem — ou `null`, se não deu para ler a pasta. */
export function migrationsNaPasta(pasta = PASTA): string[] | null {
  try {
    return readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return null;
  }
}

/** As que o banco já tem — ou `null`, se ele não respondeu. Banco sem o registro: nenhuma. */
export async function aplicadasNoBanco(): Promise<Set<string> | null> {
  try {
    const [registro] = await sqlConn<{ existe: boolean }[]>`
      SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe`;
    if (!registro?.existe) return new Set();
    const linhas = await sqlConn<{ nome: string }[]>`SELECT nome FROM schema_migrations`;
    return new Set(linhas.map((l) => l.nome));
  } catch {
    return null;
  }
}

/** As da pasta que o banco não tem — ou `null`, se o banco não respondeu. */
export async function migrationsQueFaltam(
  arquivos: string[],
  consultar: () => Promise<Set<string> | null> = aplicadasNoBanco,
): Promise<string[] | null> {
  const aplicadas = await consultar();
  return aplicadas === null ? null : arquivos.filter((f) => !aplicadas.has(f));
}

let ultima: { pasta: string; faltam: string[] | null; em: number } | null = null;
let avisadas = '';

/** Para os testes: esquece a última checagem. */
export function esquecerChecagem(): void {
  ultima = null;
  avisadas = '';
}

/**
 * As migrations que faltam neste banco — vazio quando está em dia, ou quando não deu para
 * saber. Pergunta ao banco só quando precisa (veja o cabeçalho).
 */
export async function faltamNoBanco(
  agora: number = Date.now(),
  ler: () => string[] | null = migrationsNaPasta,
  consultar: () => Promise<Set<string> | null> = aplicadasNoBanco,
): Promise<string[]> {
  const arquivos = ler();
  if (!arquivos || arquivos.length === 0) return [];
  const pasta = arquivos.join('|');
  const emDia = ultima?.faltam?.length === 0;
  if (!ultima || ultima.pasta !== pasta || (!emDia && agora - ultima.em >= DE_NOVO_EM_MS)) {
    ultima = { pasta, faltam: await migrationsQueFaltam(arquivos, consultar), em: agora };
    const faltam = ultima.faltam ?? [];
    if (faltam.length > 0 && faltam.join('|') !== avisadas) {
      console.warn(`\n⚠️  [banco] faltam migrations neste banco: ${faltam.join(', ')}.\n` +
        '    O npm run dev só aplica migrations quando liga: pare o servidor (Ctrl+C) e rode npm run dev de novo.\n');
    }
    avisadas = faltam.join('|');
  }
  return ultima.faltam ?? [];
}

/** A resposta enquanto faltar migration: a tela em português, ou o JSON para as rotas `/api/`. */
export function respostaDoBancoAtrasado(faltam: string[], caminho: string): Response {
  const cabecalhos = { 'cache-control': 'no-store', 'retry-after': '5' };
  const quais = faltam.length === 1 ? 'a migration' : 'as migrations';
  if (caminho.startsWith('/api/')) {
    return new Response(JSON.stringify({
      error: `O banco está atrás do código: faltam ${quais} ${faltam.join(', ')}. ` +
        'Pare o servidor (Ctrl+C) e rode npm run dev de novo: ele aplica as que faltam.',
    }), { status: 503, headers: { ...cabecalhos, 'content-type': 'application/json; charset=utf-8' } });
  }
  const itens = faltam.map((f) => `<li><code>${escaparHtml(f)}</code></li>`).join('');
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>O banco está atrás do código</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.55; }
  main { max-width: 40rem; margin: 0 auto; padding: 3rem 1.25rem; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; color: #fff; }
  code { background: #1e293b; padding: .1rem .35rem; border-radius: .25rem; font-size: .95em; }
  ul { padding-left: 1.25rem; }
  .passo { background: #134e4a; border-left: 4px solid #2dd4bf; padding: .9rem 1rem; border-radius: .25rem; color: #f0fdfa; }
  .nota { color: #94a3b8; font-size: .875rem; margin-top: 2rem; }
</style>
</head>
<body>
<main>
<h1>O banco está atrás do código</h1>
<p>Chegaram ${faltam.length === 1 ? 'uma migration que este banco ainda não tem' : `${faltam.length} migrations que este banco ainda não tem`}:</p>
<ul>${itens}</ul>
<p>O <code>npm run dev</code> só aplica migrations quando liga — e este servidor foi ligado antes de ${faltam.length === 1 ? 'ela chegar' : 'elas chegarem'}.</p>
<p class="passo"><strong>No terminal do <code>npm run dev</code>:</strong> aperte Ctrl+C e rode <code>npm run dev</code> de novo. Ele aplica ${faltam.length === 1 ? 'a que falta' : 'as que faltam'} e sobe.</p>
<p class="nota">Esta tela só existe no desenvolvimento. Em produção, o boot aplica as migrations antes de o servidor subir.</p>
</main>
</body>
</html>`;
  return new Response(html, { status: 503, headers: { ...cabecalhos, 'content-type': 'text/html; charset=utf-8' } });
}
