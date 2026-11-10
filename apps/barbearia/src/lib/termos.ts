/**
 * O termo de uso e o aviso de privacidade que o dono aceita no cadastro (decisão de 24/09/2026,
 * `docs/PENDENCIAS-ABERTAS.md` §1.2; o mecanismo, de 10/11/2026, migration 0021).
 *
 * ── DESLIGADO ATÉ O TEXTO FINAL ──────────────────────────────────────────────
 *
 * O rascunho existe num documento do claude.ai, fora deste repositório — que é público —, e espera
 * o advogado. Enquanto `VERSAO_DOS_TERMOS` for `null`: o cadastro não mostra a caixa de aceite, nada
 * é gravado em `tenants.termos_versao`, e as duas páginas respondem 404 em produção. Aceitar um
 * rascunho seria pior que não aceitar nada: vira o combinado sem ter sido revisado. No
 * desenvolvimento, as páginas abrem com a faixa de rascunho, para se ver como ficam.
 *
 * ── PARA PUBLICAR ────────────────────────────────────────────────────────────
 *
 *  1. O texto final em `src/termos/uso.md` e `src/termos/privacidade.md`.
 *  2. `VERSAO_DOS_TERMOS` com a data do texto, no formato `'2026-12-01'`.
 *  3. Mudou o texto depois? Versão nova. Quem aceitou a anterior continua gravado com a anterior —
 *     e pedir o aceite da nova a quem já está dentro ainda não existe (o painel não pergunta).
 *
 * ⚠️ O texto e a versão mudam no MESMO commit: a versão é o que prova qual texto a pessoa leu.
 */

/** A versão em vigor — a data do texto. `null`: ainda não publicados, e o cadastro não pede aceite. */
export const VERSAO_DOS_TERMOS: string | null = null;

/**
 * Os endereços das duas páginas, no endereço do painel (`lib/painelCentral.ts`). Sob `/termos/` e
 * não na raiz: o `/privacidade` do site de cada barbearia é de outro texto — o aviso a quem agenda.
 */
export const CAMINHO_DO_TERMO = '/termos/uso';
export const CAMINHO_DA_PRIVACIDADE = '/termos/privacidade';

/**
 * As duas páginas abrem? Publicados, sempre; em rascunho, só no desenvolvimento.
 *
 * ⚠️ A versão vem sempre de quem chama, sem valor padrão — nesta função e na de baixo. Com o padrão
 * `= VERSAO_DOS_TERMOS`, a função lia a constante DESTE arquivo, e o teste que simula o termo
 * publicado (`tests/termos-publicados.test.ts`) via o cadastro passar sem aceite: a rota usava a
 * versão de verdade, nula, por dentro da função (10/11/2026).
 */
export function paginasDosTermosAbrem(versao: string | null, desenvolvimento: boolean): boolean {
  return versao !== null || desenvolvimento;
}

/**
 * O que o cadastro mandou de aceite — a versão que a pessoa viu na tela — contra a que vale agora.
 * `null`: pode seguir. Senão, o texto para a tela e o status.
 */
export function recusaDoAceite(
  enviada: unknown,
  vigente: string | null,
): { erro: string; status: 400 | 409 } | null {
  if (vigente === null || enviada === vigente) return null;
  if (typeof enviada !== 'string' || enviada.trim() === '') {
    return { erro: 'Para criar a barbearia, marque que leu e aceita o termo de uso e o aviso de privacidade.', status: 400 };
  }
  // A página ficou aberta durante um deploy que trocou o texto: o aceite é de um texto que não
  // vale mais. Recarregar mostra o novo.
  return { erro: 'O termo de uso mudou enquanto esta página estava aberta. Recarregue a página e leia a versão nova.', status: 409 };
}
