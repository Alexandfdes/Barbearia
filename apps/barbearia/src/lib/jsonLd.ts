/**
 * JSON para dentro de um `<script>` — com `<` escapado.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ──────────────────────────────────────────────
 *
 * `JSON.stringify` **não escapa `<` nem `/`**. Conferido rodando:
 *
 *     JSON.stringify({ name: 'Barbearia </script><script>alert(1)</script>' })
 *     → {"name":"Barbearia </script><script>alert(1)</script>"}
 *
 * Dentro de `<script type="application/ld+json">`, o navegador fecha o bloco no
 * primeiro `</script>` que encontrar — inclusive um que esteja dentro de uma
 * string JSON. O que vem depois é executado como script.
 *
 * O nome da barbearia, o endereço e o Instagram vêm do painel, e a validação
 * deles limita **tamanho**, não caractere. Com `CADASTRO_ABERTO=1`, qualquer um
 * de fora planta isso pelo formulário público — e o script roda no navegador de
 * todo visitante, num endereço com o domínio do produto.
 *
 * ── POR QUE `<` E NÃO UMA LISTA DE PROIBIDOS ────────────────────────────
 *
 * `<` é escape válido de JSON e o analisador devolve `<` na leitura: o
 * conteúdo chega intacto ao Google, e o navegador nunca vê a sequência que
 * fecharia a tag. Proibir caracteres no cadastro é outra conversa — resolve o
 * caso conhecido e deixa a saída insegura para o próximo campo que alguém
 * adicionar.
 *
 * ⚠️ **Todo `set:html` com JSON passa por aqui.** `tests/json-ld.test.ts` reprova
 * `set:html={JSON.stringify(...)}` em qualquer `.astro` dos dois aplicativos.
 */

/** Escapa o que fecharia a tag, mais os separadores de linha do JS. */
export function jsonLdSeguro(dados: unknown): string {
  return JSON.stringify(dados)
    .replace(/</g, '\\u003c')
    // ⚠️ As duas sequências abaixo são ESCAPES, nunca os caracteres crus: U+2028 e
    // U+2029 são terminadores de linha para o analisador de JavaScript, e escrever
    // um deles aqui dentro quebraria este próprio arquivo. (Já quebrou.)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
