/**
 * `www.<DOMINIO_BASE>` vai para a raiz (05/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.69).
 *
 * Hoje o `www` é do site de vendas, e este app nem o vê. Com o certificado curinga
 * (`*.<DOMINIO_BASE>`), o `www` também casa com o curinga — e, conforme a prioridade que o
 * painel do servidor der a cada regra, pode passar a cair aqui. O resolvedor leria `www` como
 * o endereço de uma barbearia (é reservado: nenhuma o tem) e responderia 404 no lugar da
 * landing. Este desvio manda para a raiz, onde o site de vendas atende — e não muda nada
 * enquanto o `www` não chegar aqui.
 *
 * GET e HEAD levam 301; o resto, 308, que mantém o método.
 */
import { protocoloDe } from './tenant.js';

type Ambiente = Record<string, string | undefined>;

export function desvioDoWww(request: Request, env: Ambiente = process.env): Response | null {
  const base = env.DOMINIO_BASE?.trim().toLowerCase().replace(/\.$/, '');
  if (!base) return null;
  const host = (request.headers.get('host') ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (host !== `www.${base}`) return null;
  const url = new URL(request.url);
  const destino = `${protocoloDe(base)}://${base}${url.pathname}${url.search}`;
  const metodo = request.method.toUpperCase();
  return new Response(null, {
    status: metodo === 'GET' || metodo === 'HEAD' ? 301 : 308,
    headers: { location: destino },
  });
}
