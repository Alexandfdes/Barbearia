/**
 * De onde veio a requisição que muda dado — a parede contra o CSRF entre
 * subdomínios (`docs/PENDENCIAS-ABERTAS.md` §2.30).
 *
 * ── O BURACO QUE ISTO FECHA ──────────────────────────────────────────────────
 *
 * A sessão do painel é `SameSite=Lax`, e o `checkOrigin` do Astro está desligado
 * (`astro.config.mjs`). O `SameSite` segura o pedido que vem de OUTRO site — mas,
 * para o navegador, `painel.fadeline.com.br` e `qualquer.fadeline.com.br` são o
 * MESMO site, e os sites das barbearias são exatamente esses subdomínios. Um
 * script rodando no site de uma barbearia fazia o navegador do dono de OUTRA,
 * logado no painel, cancelar agendamento dela: reproduzido em 09/10/2026, com um
 * `fetch` simples. Pelo mesmo caminho, trocar a senha de um barbeiro, criar e
 * reagendar horário, mexer em preço. Bastava um XSS em qualquer site de
 * barbearia — e o do `/agendar` executou num navegador (§2.24).
 *
 * ── A REGRA ──────────────────────────────────────────────────────────────────
 *
 * Requisição que muda dado — tudo que não é GET, HEAD ou OPTIONS — só passa
 * vinda do PRÓPRIO endereço:
 *
 * 1. Com `Origin` — todo navegador manda num POST —, o nome dela tem que ser o
 *    do `Host`. Só o nome: o esquema e a porta mudam atrás do proxy (`https` lá
 *    fora, `http` aqui dentro), e é por isso que o `checkOrigin` do Astro, que
 *    compara os dois, teve de ser desligado.
 * 2. Sem `Origin`, o `Sec-Fetch-Site` tem que dizer `same-origin` — ou `none`, o
 *    que a pessoa fez direto no navegador.
 * 3. Sem nenhum dos dois, não é navegador — o daemon dos avisos, o `curl`, o
 *    webhook de um gateway — e passa: só o navegador da vítima carrega o cookie
 *    dela, e é ele que se protege aqui.
 *
 * `Origin: null` — iframe isolado, página `data:`, alguns redirecionamentos — não
 * é endereço nenhum, e não passa.
 *
 * O `Host` é o mesmo cabeçalho que decide a barbearia (`lib/tenant.ts`): se o proxy
 * não o preservasse, nenhum site de barbearia abriria.
 *
 * Rejeitado: religar o `checkOrigin` do Astro. Ele monta a origem esperada com o
 * esquema que o servidor enxerga, que atrás do proxy não é o do navegador — o
 * motivo de ter sido desligado —, e só olha formulário, não `fetch` com outro tipo
 * de corpo.
 */

const METODOS_QUE_SO_LEEM = new Set(['GET', 'HEAD', 'OPTIONS']);

/** O nome do endereço, sem porta e sem o ponto final: `Painel.X:4321` → `painel.x`. */
function nomeDoEndereco(host: string | null): string {
  const h = (host ?? '').trim().toLowerCase();
  // IPv6 vem entre colchetes, e os dois-pontos de dentro não são a porta.
  const nome = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
  return nome.replace(/\.$/, '');
}

/**
 * Por que a requisição foi recusada — ou `null`, quando passa. O motivo vai para
 * o log; para quem chamou, a resposta diz só que não veio deste endereço.
 */
export function motivoDaRecusa(request: Request): string | null {
  if (METODOS_QUE_SO_LEEM.has(request.method.toUpperCase())) return null;

  const host = nomeDoEndereco(request.headers.get('host'));
  const origem = request.headers.get('origin');

  if (origem !== null) {
    if (origem.trim() === 'null') return 'origem opaca (Origin: null)';
    let nome: string;
    try {
      nome = nomeDoEndereco(new URL(origem).host);
    } catch {
      return `origem que não é endereço (${origem.slice(0, 80)})`;
    }
    return nome === host ? null : `veio de ${nome}, endereço ${host || '(sem Host)'}`;
  }

  const site = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (site && site !== 'same-origin' && site !== 'none') return `Sec-Fetch-Site: ${site}`;

  return null;
}

/** A resposta da recusa: JSON para a API, texto para o resto. 403, sem detalhe. */
export function respostaDaRecusa(caminho: string): Response {
  const cabecalhos = { 'cache-control': 'no-store' };
  if (caminho.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Requisição recusada: ela não veio deste endereço.' }), {
      status: 403,
      headers: { ...cabecalhos, 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return new Response('Requisição recusada: ela não veio deste endereço.', {
    status: 403,
    headers: { ...cabecalhos, 'content-type': 'text/plain; charset=utf-8' },
  });
}
