/**
 * O site de uma barbearia FORA DO AR — o teste ou a carência venceram sem
 * pagamento, ou você a tirou do ar à mão.
 *
 * Decisão do dono em 08/10/2026 (`docs/PLANO-PRODUTIZACAO.md` §13): o cliente
 * da barbearia vê que o agendamento está **temporariamente indisponível**, com o
 * nome e o **WhatsApp da barbearia** — e nenhuma palavra sobre dívida. O cliente
 * dela não tem nada com isso, e continua conseguindo falar com ela.
 *
 * ── POR QUE 503, E NÃO 404 NEM 200 ───────────────────────────────────────────
 *
 * 404 diz ao Google que a página deixou de existir, e ele tira o site da busca;
 * 200 diz que este aviso É a página, e ele passa a mostrar o aviso no resultado.
 * 503 com `Retry-After` diz o que é verdade: está fora agora, volte depois. A
 * barbearia que paga no dia seguinte não perdeu a posição na busca.
 *
 * Quem responde é o `src/middleware.ts`, antes de qualquer rota: nenhuma página
 * ou API pública chega a rodar para barbearia fora do ar.
 */
import { numeroDaLojaInternacional, type Settings } from './settings.js';
import { ACCENT_PADRAO, isHex } from './accent.js';

type Dados = Pick<Settings, 'businessName' | 'whatsappNumber' | 'accentColor'>;

/** Um dia. Ninguém sabe quando ela paga; o número só diz "não é para sempre". */
const VOLTE_EM_SEGUNDOS = 86_400;

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * ⚠️ O nome vem do painel, escrito pelo dono, e o cadastro limita só o tamanho —
 * não os caracteres. Sem escapar, um nome com `<script>` rodaria no navegador de
 * todo cliente que abrisse o endereço (skill `barbearia-vazamento-entre-clientes`).
 */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

export function paginaForaDoAr(s: Dados): string {
  const nome = escaparHtml(s.businessName?.trim() || 'Barbearia');
  // Só dígitos: o número vai para dentro de um atributo.
  const numero = numeroDaLojaInternacional(s).replace(/\D/g, '');
  // A cor gravada já passou pela derivação de contraste ao ser salva; aqui só
  // se confere que é cor — é o que impede o campo de virar injeção de CSS.
  const cor = isHex(s.accentColor) ? s.accentColor : ACCENT_PADRAO.color;

  const contato = numero
    ? `<p>Para marcar um horário ou falar com a barbearia, chame no WhatsApp.</p>
      <a class="botao" href="https://wa.me/${numero}" rel="noopener">Chamar no WhatsApp</a>`
    : `<p>Volte daqui a pouco.</p>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${nome}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
           background: #0a0a0a; color: #e8e0d4;
           font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    main { width: 100%; max-width: 30rem; text-align: center; }
    .nome { margin: 0 0 12px; font: italic 18px/1.3 Georgia, "Times New Roman", serif; color: #b8ad9d; }
    h1 { margin: 0 0 14px; font: 600 26px/1.25 Georgia, "Times New Roman", serif; text-wrap: balance; }
    p { margin: 0 0 22px; color: #b8ad9d; }
    .botao { display: inline-block; padding: 13px 22px; border-radius: 6px; background: ${cor}; color: #fff;
             font-weight: 600; text-decoration: none; letter-spacing: .02em; }
    .botao:focus-visible { outline: 2px solid #e8e0d4; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <p class="nome">${nome}</p>
    <h1>O agendamento online está temporariamente indisponível.</h1>
    ${contato}
  </main>
</body>
</html>`;
}

/** A resposta inteira: a página para quem navega, JSON para quem chama a API. */
export function respostaForaDoAr(caminho: string, s: Dados): Response {
  const cabecalhos = { 'Retry-After': String(VOLTE_EM_SEGUNDOS), 'Cache-Control': 'no-store' };
  if (caminho.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Temporariamente indisponível.' }), {
      status: 503,
      headers: { ...cabecalhos, 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return new Response(paginaForaDoAr(s), {
    status: 503,
    headers: { ...cabecalhos, 'content-type': 'text/html; charset=utf-8' },
  });
}
