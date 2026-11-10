/**
 * O aviso ao operador de cada cadastro novo pela web — decidido pelo dono em 10/11/2026, junto
 * com o prazo de conferência prometido a quem se cadastra (`docs/PENDENCIAS-ABERTAS.md` §2.70).
 *
 * ── O BURACO QUE ELE FECHA ───────────────────────────────────────────────────
 *
 * O site novo espera a aprovação do operador (migration 0020), e o dono ouve que ele abre em até
 * `PRAZO_DA_CONFERENCIA`. Até aqui, o cadastro mandava e-mail só para o dono: o operador sabia do
 * site que espera quando abria o painel e via o Início — a promessa dependia de alguém lembrar de
 * olhar. E, passados 10 dias do cadastro sem aprovação, o painel do dono fecha sem aviso nenhum.
 *
 * ── PARA ONDE VAI ────────────────────────────────────────────────────────────
 *
 * `OPERADOR_EMAIL`, do ambiente. O endereço é de quem configura o servidor, não de formulário —
 * por isso não passa pela confirmação de `lib/confirmacaoDeEmail.ts`, a regra dos endereços que
 * alguém digitou. Sem a variável, ou fora da forma, nada sai; a tela de Sistema do operador diz.
 *
 * ── O QUE NUNCA LEVA ─────────────────────────────────────────────────────────
 *
 * Nada que a pessoa digitou, fora o endereço escolhido — e esse só tem letra minúscula, número e
 * hífen (`provisionarBarbearia`), sem o domínio, para não virar link. Nem o nome da barbearia,
 * nem o do dono, nem o telefone, nem o e-mail dele; o assunto é fixo. Conferir é na prévia, pela
 * ficha: o e-mail com o texto de um estranho seria o golpe mirando o próprio operador, com o
 * remetente do produto.
 *
 * ── O LIMITE ─────────────────────────────────────────────────────────────────
 *
 * Quem dispara é quem se cadastra — qualquer pessoa, com o cadastro aberto. O aviso sai da parte
 * `operador` do orçamento do dia (`lib/email.ts`, 5%). Passado dela, o Início do operador
 * continua listando quem espera, o mais antigo primeiro.
 *
 * O aviso nunca derruba o cadastro: o envio vai sem `await`, como o aviso de agenda.
 */
import { enviarEmail, emailValido, mascararEmail, normalizarEmail, type Email } from './email.js';
import { NOME_PRODUTO, PRAZO_DA_CONFERENCIA } from './produto.js';
import { urlDoPainel } from './tenant.js';

type Ambiente = Record<string, string | undefined>;

/** Para quem o aviso vai: `OPERADOR_EMAIL`, se tiver forma de e-mail. `null`: para ninguém. */
export function emailDoOperador(env: Ambiente = process.env): string | null {
  const e = normalizarEmail(env.OPERADOR_EMAIL);
  return e && emailValido(e) ? e : null;
}

/** O que a tela de Sistema mostra: o endereço mascarado, ou `null` quando o aviso não vai a ninguém. */
export function avisoDeCadastroNoPainel(env: Ambiente = process.env): string | null {
  const e = emailDoOperador(env);
  return e ? mascararEmail(e) : null;
}

/** O endereço da ficha da barbearia no painel do operador. Vazio sem o endereço do painel. */
export function fichaNoPainel(tenantId: number, env: Ambiente = process.env): string {
  const painel = urlDoPainel(env);
  return painel ? `${painel}/operador/barbearias/${tenantId}` : '';
}

/**
 * O assunto e o texto. ⚠️ Recebe só o que o sistema monta ou confere: o endereço (do formato do
 * `provisionarBarbearia`), o link da ficha e se o site espera — nada digitado cabe aqui.
 */
export function textoDoAvisoDeCadastro(d: { slug: string; ficha: string; emPreparacao: boolean }): { assunto: string; texto: string } {
  const abrir = d.ficha
    ? ['Na ficha, "Ver como o site está" abre a prévia:', d.ficha]
    : ['Abra o painel do operador, em Barbearias.'];
  return d.emPreparacao
    ? {
        assunto: 'Site novo esperando a sua aprovação',
        texto: [
          'Uma barbearia acabou de se cadastrar pela web, e o site dela espera a sua aprovação.',
          '',
          `O endereço escolhido: ${d.slug}`,
          '',
          `O dono ouviu que o site abre em até ${PRAZO_DA_CONFERENCIA}. Até você aprovar, o endereço mostra "em preparação".`,
          '',
          ...abrir,
          '',
          'Este e-mail não traz o nome nem o texto que a pessoa digitou, de propósito: é na prévia que se confere.',
          '',
          `— ${NOME_PRODUTO}`,
        ].join('\n'),
      }
    : {
        assunto: 'Cadastro novo — o site já está no ar',
        texto: [
          'Uma barbearia acabou de se cadastrar pela web. Sem a aprovação (SITE_SEM_APROVACAO=1), o site dela já está no ar.',
          '',
          `O endereço escolhido: ${d.slug}`,
          '',
          ...abrir,
          '',
          'Este e-mail não traz o nome nem o texto que a pessoa digitou, de propósito: é no site que se confere.',
          '',
          `— ${NOME_PRODUTO}`,
        ].join('\n'),
      };
}

/**
 * Avisa o operador do cadastro que acabou de dar certo. Nunca lança: o cadastro já está feito.
 * Devolve se o aviso foi mandado — para o teste.
 *
 * `enviar` existe para o teste simular o provedor que recusa.
 */
export function avisarOperadorDoCadastro(p: {
  tenantId: number;
  slug: string;
  emPreparacao: boolean;
  env?: Ambiente;
  enviar?: (e: Email) => Promise<unknown>;
}): boolean {
  const env = p.env ?? process.env;
  const para = emailDoOperador(env);
  if (!para) return false;
  const enviar = p.enviar ?? enviarEmail;
  const naoSaiu = (erro: unknown) => console.warn(
    `[cadastro] o aviso ao operador do cadastro ${p.tenantId} não saiu:`,
    erro instanceof Error ? erro.message : erro,
  );
  try {
    const conteudo = textoDoAvisoDeCadastro({ slug: p.slug, ficha: fichaNoPainel(p.tenantId, env), emPreparacao: p.emPreparacao });
    // Sem `await`, de propósito: ver o cabeçalho. O `try` pega o envio que estoura antes de
    // devolver a promessa.
    enviar({ para, ...conteudo, barbearia: p.tenantId, tipo: 'operador' }).catch(naoSaiu);
    return true;
  } catch (erro) {
    naoSaiu(erro);
    return false;
  }
}
