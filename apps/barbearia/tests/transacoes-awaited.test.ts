// Guarda-corpo: toda transação tem que ser esperada.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// Duas rotas abriam a transação sem `await` e respondiam `ok: true` na linha
// seguinte:
//
//     db.transaction(async (tx) => { … });   // sem await
//     return json({ ok: true });             // responde antes de gravar
//
// O efeito não é "às vezes demora": é que a resposta de sucesso sai ANTES de a
// gravação terminar. Se a transação falhar, o erro vira uma rejeição não
// tratada no processo — sem status de erro, sem log na requisição — e a tela do
// barbeiro já disse "pronto" sobre uma comanda que não existe. Foi encontrado
// em `appointments/[id]/complete.ts` (concluir atendimento, com os serviços
// extras) e em `reservations/[id].ts` (retirada de produto, que também grava a
// venda no faturamento). Os dois gravam dinheiro.
//
// Não precisa de banco: lê o código-fonte. Roda no `npm test` de qualquer
// máquina, que é onde um guarda-corpo tem que rodar.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/**
 * As duas formas CERTAS de chamar `.transaction(`:
 *
 *   await db.transaction(…)      espera aqui
 *   return db.transaction(…)     devolve a promessa para quem chamou esperar
 *   const x = await db.transaction(…)
 *
 * Qualquer outra deixa a promessa solta.
 */
const ESPERADA = /(?:await|return)\s+[A-Za-z_$][\w$]*\.transaction\(/;

interface Chamada { arquivo: string; linha: number; texto: string }

const chamadas: Chamada[] = [
  ...globSync('src/**/*.ts'),
  ...globSync('src/**/*.astro'),
]
  .sort()
  .flatMap((caminho) => {
    // globSync devolve o separador do sistema — `\` no Windows. O
    // desenvolvimento é em Windows e a produção em Linux.
    const nome = caminho.split(sep).join('/');
    const linhas: string[] = readFileSync(caminho, 'utf8').split('\n');
    return linhas
      .map((texto: string, i: number): Chamada => ({ arquivo: nome, linha: i + 1, texto }))
      .filter((l: Chamada) => /\.transaction\(/.test(l.texto));
  });

describe('toda transação é esperada', () => {
  it('encontra as chamadas (guarda contra o glob quebrar em silêncio)', () => {
    expect(chamadas.length).toBeGreaterThan(3);
  });

  it('nenhuma transação fica com a promessa solta', () => {
    const soltas = chamadas
      .filter((c) => !ESPERADA.test(c.texto))
      .map((c) => `${c.arquivo}:${c.linha} — ${c.texto.trim()}`);

    expect(
      soltas,
      'transação sem await nem return: a rota responde antes de gravar',
    ).toEqual([]);
  });
});
