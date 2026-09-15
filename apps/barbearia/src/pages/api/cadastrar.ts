export const prerender = false;

/**
 * Cadastro de barbearia pela web — a porta que o `scripts/provisionar.mts` abria
 * só na linha de comando.
 *
 * ── ELA NASCE FECHADA, E ISSO NÃO É EXCESSO DE ZELO ──────────────────────────
 *
 * Sem `CADASTRO_ABERTO=1` esta rota responde **404**, como se não existisse.
 *
 * Um cadastro aberto cria tenant de verdade: ocupa slug no domínio do produto,
 * entra no backup, e publica um site sob o nosso endereço. Enquanto não houver
 * cobrança (`PENDENCIAS-ABERTAS.md` §3.5 — não existe uma linha de código sobre
 * assinatura) nem contrato/LGPD (§1.2, adiado por decisão do dono), deixar essa
 * porta aberta em produção é convidar barbearia fantasma e dado de terceiro sem
 * termo aceito.
 *
 * A variável é o interruptor: ligada no desenvolvimento, ausente em produção.
 * 404 e não 403 de propósito — rota que responde "proibido" anuncia que existe.
 *
 * ── POR QUE AQUI E NÃO NO `apps/vendas` ──────────────────────────────────────
 *
 * A landing não tem banco: nenhuma dependência de `postgres`, nenhum schema,
 * nenhum bcrypt. Pôr o cadastro lá obrigaria a duplicar a camada de dados num
 * segundo app — e dois lugares que sabem nascer uma barbearia divergem, que é o
 * defeito registrado em `PENDENCIAS-ABERTAS.md` §4.6 e §4.2. A landing linka
 * para cá.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
/**
 * ⚠️ `sqlConn` — a conexão do DONO — e este é o terceiro lugar onde isso é
 * certo. A barbearia que está nascendo ainda não existe: não há `tenant_id`
 * para gravar em `app.tenant_id`, e sob RLS o INSERT em `tenants` não teria a
 * quem pertencer. `tests/rls.test.ts` mantém essa lista fechada.
 */
import { sqlConn } from '../../db/index.js';
import { provisionarBarbearia } from '../../lib/provisionarBarbearia.js';
import { CATALOGO_SUGERIDO } from '../../lib/catalogoSugerido.js';
import { json } from '../../lib/api.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { getClientIp } from '../../lib/clientIp.js';
import { carregarTenants, invalidarTenants } from '../../lib/tenant.js';

export const CADASTRO_ABERTO = () => process.env.CADASTRO_ABERTO === '1';

const servicoSchema = z.object({
  nome:          z.string().min(1).max(80),
  precoCentavos: z.number().int().min(0).max(1_000_000),
  minutos:       z.number().int().min(5).max(480),
});

const bodySchema = z.object({
  slug:     z.string().min(2).max(63),
  nome:     z.string().min(2).max(120),
  dono:     z.string().min(2).max(120),
  telefone: z.string().min(8).max(30),
  endereco: z.string().min(3).max(200),
  cidade:   z.string().min(2).max(120),
  senha:    z.string().min(8).max(200),
  cor:      z.string().max(9).optional(),
  servicos: z.array(servicoSchema).max(30).optional(),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!CADASTRO_ABERTO()) return new Response('Not found', { status: 404 });

  // Cria linha no banco e gasta bcrypt a cost 12 — sem limite, um laço simples
  // enche o banco de barbearias e ocupa a CPU do processo que atende os sites
  // que já estão no ar.
  const ip = getClientIp(request, clientAddress);
  const rl = checkRateLimit(`cadastro:${ip}`, { maxTries: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return json({ error: `Muitas tentativas. Tente em ${rl.retryAfterSecs}s` }, 429);
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    return json({ error: 'Confira os campos.', campo: primeiro?.path?.[0] ?? null }, 400);
  }

  const r = await provisionarBarbearia(sqlConn, parsed.data);

  if (!r.ok) {
    return json({ error: r.erro, campo: r.campo }, r.conflito ? 409 : 400);
  }

  // O cache de tenants tem até 30s de atraso. Sem isto, o dono termina o
  // cadastro, é levado ao painel e leva 404 no próprio endereço — a primeira
  // coisa que ele veria do produto seria uma página de erro.
  invalidarTenants();
  await carregarTenants(true);

  return json({
    ok: true,
    slug: r.slug,
    telefoneLogin: r.telefoneLogin,
    servicosAtivos: r.servicosAtivos,
    /** O que ainda falta para o site ficar de pé, dito na hora. */
    avisos: r.servicosAtivos === 0
      ? ['Nenhum serviço com preço: ninguém consegue agendar até você preencher um em /admin/servicos.']
      : [],
  }, 201);
};

/** A lista que a tela mostra com os preços em branco. Uma fonte só. */
export const GET: APIRoute = async () => {
  if (!CADASTRO_ABERTO()) return new Response('Not found', { status: 404 });
  return json({ catalogo: CATALOGO_SUGERIDO });
};
