// O `.env.example` conta toda variável que o app lê.
//
// Não precisa de banco: lê o código.
//
// POR QUE ESTE TESTE EXISTE
//
// O `.env.example` é a lista que se olha para configurar o servidor no EasyPanel. Até
// 13/10/2026 ele não contava sete variáveis que o app lê em produção — `DOMINIO_BASE`,
// `PAINEL_URL`, `CADASTRO_ABERTO`, `SMTP_URL`, `EMAIL_REMETENTE`, `EMAIL_RESPONDER_PARA`
// e `EMAIL_PASTA` —, e nem a `DATABASE_URL_APP` da troca do superusuário: estavam
// explicadas, mas espalhadas pelos documentos. Configurar o e-mail e o domínio por ele
// era esquecer metade. Variável nova entra no exemplo junto com o código que a lê.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/**
 * As que não são configuração do servidor — e por quê. Lista fechada: entrar aqui
 * é decisão, não esquecimento.
 */
const NAO_SAO_CONFIGURACAO: Record<string, string> = {
  NODE_ENV: 'o Dockerfile define (`production`); fora dele, o Astro e o vitest',
  PORT: 'o Dockerfile define (4321); fora dele, o Astro',
  VITEST: 'o vitest define, para o e-mail ir para a memória nos testes',
  PORTA_TESTE: 'só do `scripts/testar.mjs`, na máquina de desenvolvimento',
  ASAAS_URL: 'só os testes, para apontar para uma Asaas de mentira (`src/lib/asaas.ts`)',
  TZ_BARBEARIA: 'não é mais lida: o boot só avisa quem ainda a tiver (`scripts/startup.mjs`)',
  ADMIN_NEW_PASSWORD: 'a senha nova de um dono, passada na linha de comando do `scripts/set-admin-password.mjs`',
  SENHA_INICIAL: 'a senha do dono, passada na linha de comando do `scripts/provisionar.mts`',
};

/** O código sem os comentários — que é onde as variáveis antigas ficam registradas. */
function soCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

/** Os nomes de variável que um trecho de código lê, em todas as formas usadas aqui. */
export function variaveisLidas(codigo: string): string[] {
  const nomes = new Set<string>();
  // process.env.X, import.meta.env.X, env.X e env?.X — `env` é o `Ambiente` que as
  // funções recebem, com `process.env` de padrão.
  for (const m of codigo.matchAll(/\b(?:process\.env|import\.meta\.env|env)\??\.([A-Z][A-Z0-9_]*)\b/g)) nomes.add(m[1]);
  // process.env['X'] e env["X"].
  for (const m of codigo.matchAll(/\b(?:process\.env|env)\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\]/g)) nomes.add(m[1]);
  // const { A, B } = process.env — o `scripts/backup.mjs` lê o S3 assim.
  for (const m of codigo.matchAll(/\{([^{}]*)\}\s*=\s*(?:process\.env|import\.meta\.env)\b/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().split(/[\s:=]/)[0];
      if (/^[A-Z][A-Z0-9_]*$/.test(nome)) nomes.add(nome);
    }
  }
  // VARIAVEL_DA_SENHA = 'OPERADOR_SENHA_HASH', lida depois por `env[VARIAVEL_DA_SENHA]`.
  for (const m of codigo.matchAll(/\bVARIAVEL_[A-Z0-9_]*\s*=\s*['"`]([A-Z][A-Z0-9_]*)['"`]/g)) nomes.add(m[1]);
  return [...nomes].sort();
}

/** As variáveis do exemplo: toda linha `NOME=`, comentada (opcional) ou não. */
export function variaveisDoExemplo(texto: string): string[] {
  return [...new Set([...texto.matchAll(/^#?\s?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))].sort();
}

const arquivos = [
  ...globSync('src/**/*.{ts,mts,mjs,astro}'),
  ...globSync('scripts/**/*.{ts,mts,mjs,js}'),
].map((c) => c.split(sep).join('/')).sort();

describe('o .env.example conta toda variável que o app lê', () => {
  it('controle: a leitura acha as formas que o código usa, e não comentário', () => {
    const trecho = [
      'const a = process.env.SESSION_SECRET;',
      "const b = process.env['DATABASE_URL'];",
      'if (env.SMTP_URL?.trim()) {}',
      'const c = env?.EMAIL_PASTA;',
      'const { S3_ENDPOINT, S3_BUCKET: balde } = process.env;',
      "export const VARIAVEL_DA_SENHA = 'OPERADOR_SENHA_HASH';",
      '// process.env.TZ_BARBEARIA era lida aqui',
    ].join('\n');
    expect(variaveisLidas(soCodigo(trecho))).toEqual([
      'DATABASE_URL', 'EMAIL_PASTA', 'OPERADOR_SENHA_HASH', 'S3_BUCKET', 'S3_ENDPOINT', 'SESSION_SECRET', 'SMTP_URL',
    ]);
    expect(variaveisDoExemplo('# Comentário: NÃO_É=nada\nSESSION_SECRET=x\n# SMTP_URL=smtps://...\n#   NAO=conta\n'))
      .toEqual(['SESSION_SECRET', 'SMTP_URL']);
  });

  it('o glob encontrou o código (guarda contra passar em silêncio)', () => {
    const lidas = new Set(arquivos.flatMap((c) => variaveisLidas(soCodigo(readFileSync(c, 'utf8')))));
    expect(arquivos.length).toBeGreaterThan(50);
    // As de sempre — se sumirem, quem sumiu foi a leitura, não a variável.
    for (const v of ['DATABASE_URL', 'SESSION_SECRET', 'SMTP_URL', 'S3_BUCKET', 'OPERADOR_SENHA_HASH']) {
      expect(lidas.has(v), v).toBe(true);
    }
  });

  it('toda variável lida pelo app ou pelos scripts está no exemplo — ou na lista do que não é configuração', () => {
    const exemplo = new Set(variaveisDoExemplo(readFileSync('.env.example', 'utf8')));
    const faltam = arquivos.flatMap((c) =>
      variaveisLidas(soCodigo(readFileSync(c, 'utf8')))
        .filter((v) => !exemplo.has(v) && !(v in NAO_SAO_CONFIGURACAO))
        .map((v) => `${v} (lida em ${c})`)
    );
    expect(faltam).toEqual([]);
  });

  it('o exemplo não guarda variável que o código não lê mais', () => {
    const lidas = new Set(arquivos.flatMap((c) => variaveisLidas(soCodigo(readFileSync(c, 'utf8')))));
    const sobram = variaveisDoExemplo(readFileSync('.env.example', 'utf8')).filter((v) => !lidas.has(v));
    expect(sobram).toEqual([]);
  });

  it('a lista do que não é configuração só tem quem o código lê de fato', () => {
    const lidas = new Set(arquivos.flatMap((c) => variaveisLidas(soCodigo(readFileSync(c, 'utf8')))));
    expect(Object.keys(NAO_SAO_CONFIGURACAO).filter((v) => !lidas.has(v))).toEqual([]);
  });
});
