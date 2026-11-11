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
import { checkRateLimit, consultarRateLimit } from '../../lib/rateLimit.js';
import { getClientIp } from '../../lib/clientIp.js';
import { carregarTenants, invalidarTenants, resolverHost, tenantEmPreparacaoDoHost, urlDoSite } from '../../lib/tenant.js';
import { aprovacaoDoSiteLigada } from '../../lib/previaDoSite.js';
import { makeSessionCookie } from '../../lib/session.js';
import { ultimoDia } from '../../lib/situacao.js';
import { normalizarEmail } from '../../lib/email.js';
import { pedirConfirmacao, trechoDoLink } from '../../lib/confirmacaoDeEmail.js';
import { formatarTelefone } from '../../lib/phone.js';
import { urlDoPainel } from '../../lib/tenant.js';
import { NOME_PRODUTO, PRAZO_DA_CONFERENCIA } from '../../lib/produto.js';
import { avisarOperadorDoCadastro } from '../../lib/avisoAoOperador.js';
import { recusaDoAceite, VERSAO_DOS_TERMOS } from '../../lib/termos.js';

export const CADASTRO_ABERTO = () => process.env.CADASTRO_ABERTO === '1';

const servicoSchema = z.object({
  nome:          z.string().min(1).max(80),
  precoCentavos: z.number().int().min(0).max(1_000_000),
  minutos:       z.number().int().min(5).max(480),
});

const horarioSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  abre:    z.string().max(5).optional(),
  fecha:   z.string().max(5).optional(),
  fechado: z.boolean().optional(),
});

const bodySchema = z.object({
  slug:     z.string().min(2).max(63),
  nome:     z.string().min(2).max(120),
  dono:     z.string().min(2).max(120),
  telefone: z.string().min(8).max(30),
  endereco: z.string().min(3).max(200),
  cidade:   z.string().min(2).max(120),
  /**
   * A sigla do estado: é dela que sai o fuso dos horários da barbearia
   * (`fusoDoEstado`, `lib/timezone.ts`). Qual sigla vale é conferido em
   * `provisionarBarbearia` — aqui só a presença, como o e-mail.
   */
  estado:   z.string().trim().min(2).max(2),
  senha:    z.string().min(8).max(200),
  cor:      z.string().max(9).optional(),
  servicos: z.array(servicoSchema).max(30).optional(),
  horarios: z.array(horarioSchema).max(7).optional(),
  instagram: z.string().max(120).optional(),
  sobre:     z.string().max(1000).optional(),
  frase:     z.string().max(200).optional(),
  /**
   * Obrigatório pela web: é por ele que vão a recuperação de senha e os avisos do
   * teste e da cobrança (decisão de 08/10/2026). A FORMA é conferida em
   * `provisionarBarbearia`, a regra num lugar só — aqui só a presença.
   */
  email:     z.string().trim().min(3).max(254),
  /**
   * A versão do termo de uso que a pessoa viu e aceitou na tela (`lib/termos.ts`). Conferida contra
   * a que vale agora — só quando há termo publicado; antes disso, ignorada.
   */
  termos:    z.string().max(40).optional(),
});

const UMA_HORA = 60 * 60 * 1000;
const LIMITE_DE_CRIADOS = { maxTries: 5, windowMs: UMA_HORA };
const LIMITE_DE_TENTATIVAS = { maxTries: 30, windowMs: UMA_HORA };

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!CADASTRO_ABERTO()) return new Response('Not found', { status: 404 });

  // Cria linha no banco e gasta bcrypt a cost 12 — sem limite, um laço simples
  // enche o banco de barbearias e ocupa a CPU do processo que atende os sites
  // que já estão no ar.
  //
  // ⚠️ DOIS limites (26/10/2026). Até aqui era um só, de 5 por hora, e contava toda
  // tentativa — inclusive as que falharam: o dono que tentava 4 endereços já tomados
  // levava 429 por uma hora no quinto, válido. E atrás de 4G o IP é de muita gente.
  // Agora: CRIADOS, 5 por hora (conta só depois de dar certo); TENTATIVAS, 30 por
  // hora — o teto do laço, que barra quem testa endereços ou WhatsApps em massa.
  const ip = getClientIp(request, clientAddress);
  const tentativas = checkRateLimit(`cadastro-tentativa:${ip}`, LIMITE_DE_TENTATIVAS);
  const criados = consultarRateLimit(`cadastro:${ip}`, LIMITE_DE_CRIADOS);
  const travado = !tentativas.ok ? tentativas : !criados.ok ? criados : null;
  if (travado) {
    const minutos = Math.max(1, Math.ceil((travado.retryAfterSecs ?? 60) / 60));
    return json({ error: `Muitos cadastros feitos desta conexão. Tente de novo em ${minutos} min.` }, 429);
  }

  // ⚠️ Só JSON. Esta rota ABRE SESSÃO (ver o fim do arquivo), e o
  // `checkOrigin` do Astro está desligado (`astro.config.mjs`). Um formulário de
  // outro site consegue mandar `text/plain` com corpo em formato de JSON — e
  // `request.json()` leria assim mesmo: a página maliciosa criaria uma barbearia
  // e deixaria o visitante logado nela ("login CSRF"). `application/json` vindo
  // de outro site exige pré-voo de CORS, que este servidor não autoriza.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    return json({ error: 'Confira os campos.', campo: primeiro?.path?.[0] ?? null }, 400);
  }

  // O aceite do termo (migration 0021): com ele publicado, sem a versão que vale agora não nasce.
  // Antes de criar qualquer coisa — e antes de contar como cadastro feito.
  const recusaDoTermo = recusaDoAceite(parsed.data.termos, VERSAO_DOS_TERMOS);
  if (recusaDoTermo) return json({ error: recusaDoTermo.erro, campo: 'termos' }, recusaDoTermo.status);

  // O site nasce esperando a sua aprovação (migration 0020, `lib/previaDoSite.ts`) — a não ser
  // com `SITE_SEM_APROVACAO=1`. Depois do corpo, de propósito: quem decide é o servidor.
  const { termos: _versaoVista, ...dados } = parsed.data;
  const r = await provisionarBarbearia(sqlConn, {
    ...dados,
    esperaAprovacao: aprovacaoDoSiteLigada(),
    termosAceitos: VERSAO_DOS_TERMOS === null ? null : { versao: VERSAO_DOS_TERMOS },
  });

  if (!r.ok) {
    return json({ error: r.erro, campo: r.campo }, r.conflito ? 409 : 400);
  }
  checkRateLimit(`cadastro:${ip}`, LIMITE_DE_CRIADOS); // deu certo: este conta

  // O cache de tenants tem até 30s de atraso. Sem isto, o dono termina o
  // cadastro, é levado ao painel e leva 404 no próprio endereço — a primeira
  // coisa que ele veria do produto seria uma página de erro.
  invalidarTenants();
  await carregarTenants(true);

  // O endereço do site, para a tela de fim mostrar e mandar no WhatsApp. Passa
  // pelo RESOLVEDOR de propósito: se ele não achar a barbearia pelo slug, o link
  // daria 404 — e é melhor não mostrar link nenhum. Sem `DOMINIO_BASE`
  // (desenvolvimento), `urlDoSite` devolve vazio, e a tela diz isso. O site que espera a
  // aprovação o resolvedor não serve: ele vem pelo `tenantEmPreparacaoDoHost`, e a tela não
  // confere o endereço — ele mostra "em preparação" até você aprovar.
  const recemCriada = resolverHost(r.slug) ?? tenantEmPreparacaoDoHost(r.slug);
  const site = recemCriada ? urlDoSite(recemCriada) || null : null;

  const corpo = {
    ok: true,
    slug: r.slug,
    site,
    telefoneLogin: r.telefoneLogin,
    servicosAtivos: r.servicosAtivos,
    /** O site espera a sua aprovação: a tela de fim não confere o endereço, e o teste conta da aprovação. */
    emPreparacao: r.siteEmPreparacao,
    /**
     * "15/10", no fuso da barbearia — o navegador de quem cadastra pode estar em outro. Nulo
     * com o site esperando a aprovação: o fim do teste é recontado quando ele abrir (`aprovarSite`).
     */
    ultimoDiaDoTeste: r.testeAte && !r.siteEmPreparacao ? ultimoDia(r.testeAte, r.fuso) : null,
    /** O que ainda falta para o site ficar de pé, dito na hora. */
    avisos: r.servicosAtivos === 0
      ? ['Nenhum serviço com preço: ninguém consegue agendar até você preencher um em /admin/servicos.']
      : [],
  };

  /**
   * O dono sai do cadastro JÁ DENTRO do painel da barbearia que acabou de criar
   * — decisão de 24/09/2026: "o barbeiro cadastra as informações e já recebe o
   * painel". A sessão nova SUBSTITUI qualquer outra que houvesse no aparelho:
   * mesmo cookie, valor novo.
   *
   * ⚠️ Histórico: até 25/09/2026 esta rota APAGAVA a sessão aberta, e o dono
   * entrava pelo login. O motivo continua valendo e é o que este cookie resolve
   * de outro jeito: encontrado em 15/09/2026, criando a segunda barbearia no
   * mesmo navegador, o "Ir para o painel" levava ao painel da barbearia ERRADA —
   * `admin/login.astro` manda para `/admin` quando já há sessão, e `/admin` lê a
   * barbearia da SESSÃO. Com a sessão do dono novo no lugar da antiga, não sobra
   * sessão de outra barbearia para ele cair dentro.
   */
  const sessao = await makeSessionCookie({ barberId: r.barbeiroId, role: 'admin', tenantId: r.tenantId });

  // O primeiro e-mail, com o link que confirma o endereço (`lib/confirmacaoDeEmail.ts`):
  // até ele ser aberto, nada mais vai para lá — nem a senha nova, nem os avisos. Se não
  // chegar, o dono descobre hoje, com o cadastro fresco. Sem esperar o provedor: o
  // cadastro já deu certo, e um provedor lento não pode segurar a tela de fim.
  if (normalizarEmail(parsed.data.email)) {
    const boasVindas = {
      painel: urlDoPainel(),
      whatsapp: formatarTelefone(r.telefoneLogin),
      ultimoDiaDoTeste: corpo.ultimoDiaDoTeste,
      siteEmPreparacao: r.siteEmPreparacao,
    };
    const resultado = await pedirConfirmacao({
      tenantId: r.tenantId,
      barberId: r.barbeiroId,
      esperarEnvio: false,
      montar: (linkDeConfirmacao) => emailDeBoasVindas({ ...boasVindas, linkDeConfirmacao }),
    });
    if (resultado !== 'enviado') console.warn(`[cadastro] o e-mail de boas-vindas não saiu: ${resultado}`);
  }

  // O aviso ao operador (10/11/2026, `lib/avisoAoOperador.ts`): o site espera a aprovação, e o
  // dono acabou de ouvir que ele abre em até `PRAZO_DA_CONFERENCIA`. Sem esperar o envio, como as
  // boas-vindas — e só com o endereço escolhido e a ficha, nada do que foi digitado.
  avisarOperadorDoCadastro({ tenantId: r.tenantId, slug: r.slug, emPreparacao: r.siteEmPreparacao });

  return new Response(JSON.stringify(corpo), {
    status: 201,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': sessao,
    },
  });
};

/**
 * O e-mail de boas-vindas. Exportado para o teste ler o que o dono vai ler.
 *
 * ⚠️ NADA que a pessoa digitou no formulário entra no assunto nem no texto
 * (26/10/2026). O e-mail não é confirmado: quem cadastra escolhe para quem ele
 * vai. Com o nome da barbearia no assunto e o do dono na saudação, dava para
 * mandar, do remetente do produto, "URGENTE: regularize em http://golpe…" para
 * qualquer endereço. O que entra agora é só o que o sistema monta: o endereço do
 * painel, o WhatsApp formatado e a data.
 *
 * ⚠️ E não leva o endereço do site (05/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.67).
 * Até aqui levava, com o argumento de que o slug só tem letra, número e hífen — mas é
 * o nome que a pessoa escolheu ("suporte-fadeline-regularize-o-pix" cabe nele), e o
 * link abre a página que ela escreveu, sob o nosso domínio. Era um link de estranho,
 * do nosso remetente, para qualquer endereço. O dono vê o endereço na tela de fim do
 * cadastro e em toda tela do painel (o "Ver meu site", do `AdminLayout`).
 *
 * ⚠️ Não diz que o site "está no ar" — até 10/10/2026 dizia, no assunto e no
 * corpo. O e-mail sai no segundo do cadastro, e o servidor não sabe se a internet
 * já chega no endereço novo: o certificado do subdomínio pode ainda não existir
 * (`docs/ARQUITETURA-COBRANCA-V1.md` §7.4). Quem confere é a tela de fim, do
 * navegador do dono (`src/lib/noAr.ts`).
 */
export function emailDeBoasVindas(d: {
  painel: string;
  whatsapp: string;
  ultimoDiaDoTeste: string | null;
  /** O site espera a sua aprovação (migration 0020): o teste começa quando ele abrir. */
  siteEmPreparacao?: boolean;
  /** O link que confirma este e-mail (`lib/confirmacaoDeEmail.ts`). */
  linkDeConfirmacao: string;
}): { assunto: string; texto: string } {
  return {
    assunto: `O seu cadastro no ${NOME_PRODUTO}`,
    texto: [
      'Olá!',
      '',
      `O cadastro da sua barbearia no ${NOME_PRODUTO} foi feito.`,
      '',
      ...(d.painel ? [`O seu painel: ${d.painel}/admin`] : []),
      `Você entra com o seu WhatsApp, ${d.whatsapp}, e a senha que criou no cadastro.`,
      '',
      ...(d.siteEmPreparacao
        ? [`O seu site abre depois de uma conferência nossa, em até ${PRAZO_DA_CONFERENCIA} — o painel já funciona inteiro. Os 7 dias de teste grátis começam quando ele abrir.`, '']
        : d.ultimoDiaDoTeste ? [`O teste grátis vai até ${d.ultimoDiaDoTeste}. Até lá, nada é cobrado.`, ''] : []),
      'É para este e-mail que vão o link de senha nova, se você esquecer a sua, e os avisos do teste e da cobrança.',
      '',
      ...trechoDoLink(d.linkDeConfirmacao),
      '',
      'Não foi você que fez este cadastro? Pode ignorar este e-mail.',
      '',
      `— ${NOME_PRODUTO}`,
    ].join('\n'),
  };
}

/** A lista que a tela mostra com os preços em branco. Uma fonte só. */
export const GET: APIRoute = async () => {
  if (!CADASTRO_ABERTO()) return new Response('Not found', { status: 404 });
  return json({ catalogo: CATALOGO_SUGERIDO });
};
