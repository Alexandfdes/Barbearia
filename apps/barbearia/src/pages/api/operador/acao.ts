export const prerender = false;

/**
 * As ações do painel do operador: estender o teste ou a carência, tirar do ar,
 * reativar (`lib/operadorBarbearias.ts`). Cada uma numa transação, com a linha da
 * barbearia travada, e gravada em `acoes_do_operador` na mesma transação — ação
 * sem registro não acontece. E, desde 12/10/2026, anotar na ficha dela o que se
 * combinou com o dono: a anotação É o registro (`acao = 'anotou'`, migration 0014).
 * Desde 05/11/2026, aprovar o site novo e trocar o e-mail do dono (migration 0020).
 *
 * A barbearia vem do CORPO, e aqui isso é certo: o operador age sobre a barbearia
 * que escolheu na lista — não existe "a barbearia desta requisição". Quem impede
 * o abuso é a sessão de operador, não o escopo.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '../../../lib/api.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { naoEncontrado, operadorAutenticado, portaoDoOperador } from '../../../lib/operador.js';
import {
  ANOTACAO_MAXIMA, DIAS_MAXIMOS_DE_EXTENSAO, ErroDoOperador, anotar, aprovarSite, estenderCarencia, estenderTeste, liberarTelefones,
  reativar, suspender, trocarEmailDoDono,
} from '../../../lib/operadorBarbearias.js';

const barbearia = z.number().int().positive();

const corpoSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('estender-teste'), barbearia, dias: z.number().int().min(1).max(DIAS_MAXIMOS_DE_EXTENSAO) }),
  z.object({ acao: z.literal('estender-carencia'), barbearia, dias: z.number().int().min(1).max(DIAS_MAXIMOS_DE_EXTENSAO) }),
  z.object({ acao: z.literal('suspender'), barbearia, confirmacao: z.string().max(100), motivo: z.string().max(300).optional() }),
  z.object({ acao: z.literal('reativar'), barbearia, comoEra: z.enum(['trial', 'active']).optional() }),
  z.object({ acao: z.literal('liberar-telefones'), barbearia }),
  // Folga de 200 sobre o máximo: quem conta os caracteres de verdade é `anotar`,
  // depois de limpar as quebras de linha — e a mensagem de lá diz o limite certo.
  z.object({ acao: z.literal('anotar'), barbearia, texto: z.string().max(ANOTACAO_MAXIMA + 200) }),
  z.object({ acao: z.literal('aprovar-site'), barbearia }),
  // `conferido: true` é a caixa "conferi pelo WhatsApp do login" (`trocarEmailDoDono`): sem ela, recusa.
  z.object({
    acao: z.literal('trocar-email-do-dono'), barbearia, barbeiro: z.number().int().positive(),
    email: z.string().max(254), conferido: z.literal(true), motivo: z.string().max(300).optional(),
  }),
]);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (portaoDoOperador(request) !== 'aberto') return naoEncontrado();
  if (!(await operadorAutenticado(request))) return json({ error: 'Entre de novo: a sessão do operador acabou.' }, 401);

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }
  let corpo: unknown;
  try { corpo = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }
  const parsed = corpoSchema.safeParse(corpo);
  if (!parsed.success) {
    const pedido = corpo as { acao?: unknown; conferido?: unknown } | null;
    return json({
      error: pedido?.acao === 'anotar'
        ? `A anotação vai até ${ANOTACAO_MAXIMA} caracteres.`
        : pedido?.acao === 'trocar-email-do-dono'
          ? pedido.conferido === true
            ? 'Confira o e-mail novo.'
            : 'Antes de trocar, confira pelo WhatsApp do login que é o dono — e marque a caixa.'
          : `Dados inválidos. Os dias vão de 1 a ${DIAS_MAXIMOS_DE_EXTENSAO}.`,
    }, 400);
  }

  const ip = getClientIp(request, clientAddress);
  const d = parsed.data;
  try {
    if (d.acao === 'anotar') {
      const { slug } = await anotar(d.barbearia, d.texto, ip);
      // O texto não vai para o log: é do operador, e pode ter o que ele combinou.
      console.info(`[operador] anotou em ${slug} (ip ${ip})`);
      return json({ ok: true, slug });
    }
    if (d.acao === 'trocar-email-do-dono') {
      const r = await trocarEmailDoDono({ tenantId: d.barbearia, barbeiroId: d.barbeiro, email: d.email, motivo: d.motivo, ip });
      // Os endereços não vão para o log: o registro guarda os dois, mascarados.
      console.info(`[operador] ${r.reenvio ? 'mandou de novo a confirmação do e-mail' : 'trocou o e-mail'} do dono de ${r.slug}: confirmação ${r.confirmacao}`
        + `${r.avisouAntigo ? ', o endereço antigo avisado' : ''} (ip ${ip})`);
      return json({ ok: true, slug: r.slug, confirmacao: r.confirmacao, avisouAntigo: r.avisouAntigo, reenvio: r.reenvio });
    }
    if (d.acao === 'liberar-telefones') {
      const r = await liberarTelefones(d.barbearia, ip);
      console.info(`[operador] liberou os telefones de ${r.slug}: ${r.desligados.length} desligado(s) (ip ${ip})`);
      return json({ ok: true, slug: r.slug, desligados: r.desligados });
    }
    const r = d.acao === 'estender-teste' ? await estenderTeste(d.barbearia, d.dias, ip)
      : d.acao === 'estender-carencia' ? await estenderCarencia(d.barbearia, d.dias, ip)
      : d.acao === 'suspender' ? await suspender(d.barbearia, d.confirmacao, d.motivo, ip)
      : d.acao === 'aprovar-site' ? await aprovarSite(d.barbearia, ip)
      : await reativar(d.barbearia, d.comoEra, ip);
    console.info(`[operador] ${d.acao} ${r.slug} → ${r.tela.rotulo} (${r.tela.detalhe}) (ip ${ip})`);
    return json({ ok: true, slug: r.slug, fase: r.tela });
  } catch (erro) {
    if (erro instanceof ErroDoOperador) return json({ error: erro.message }, erro.status);
    throw erro;
  }
};
