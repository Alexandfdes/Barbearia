/**
 * O aviso ao e-mail ANTIGO quando o e-mail de alguém da equipe muda — 13/10/2026,
 * escolhido pelo dono (`docs/PENDENCIAS-ABERTAS.md` §4.17).
 *
 * ── O BURACO QUE ELE FECHA ───────────────────────────────────────────────────
 *
 * Quem pega o painel de um dono aberto — no computador da barbearia, num celular
 * emprestado — troca o e-mail da conta por um dele e pede "esqueci minha senha": o
 * link vai para o e-mail novo, e o dono perde a conta sem aviso nenhum. Até aqui era
 * "risco aceito". Agora o endereço antigo fica sabendo na hora — é a última coisa que
 * chega nele —, com o que fazer se não reconhecer a troca.
 *
 * ── O QUE NUNCA ACONTECE ─────────────────────────────────────────────────────
 *
 * O aviso nunca desfaz nem segura a troca: ela já está gravada. Os dados são lidos
 * DENTRO da requisição, porque a conexão é a da barbearia (`comTenant`, RLS) e acaba
 * com ela; o envio, não — como o aviso de agenda (`lib/avisoDeAgenda.ts`). Em
 * produção sem `SMTP_URL` o envio recusa (`lib/email.ts`), e isso vira uma linha no
 * log. O endereço novo vai mascarado: o aviso diz que mudou, não para quem entrega.
 *
 * ⚠️ Texto puro, como todo e-mail do sistema. Os nomes vêm de formulário.
 */
import { formatInTimeZone } from 'date-fns-tz';
import { enviarEmail, mascararEmail, normalizarEmail, type Email } from './email.js';
import { NOME_PRODUTO } from './produto.js';
import { getSettings } from './settings.js';
import { urlDoPainel, type Tenant } from './tenant.js';
import { fusoDe } from './timezone.js';

export interface TrocaDeEmail {
  /** De quem é o e-mail que mudou. */
  pessoa: { id: number; nome: string; papel: 'admin' | 'barber' };
  antigo: string | null;
  /** `null` quando o e-mail foi apagado. */
  novo: string | null;
  /** Quem estava com o painel aberto e fez a troca. */
  quemTrocou: { id: number; nome: string };
}

/**
 * Houve troca que avise alguém? Só quando havia e-mail antes — sem ele, não há a quem
 * avisar — e o de agora é outro. Salvar a ficha sem mexer no e-mail não avisa.
 */
export function trocaQueAvisa(antigo: string | null | undefined, novo: string | null | undefined): boolean {
  const a = normalizarEmail(antigo);
  if (!a) return false;
  return a !== normalizarEmail(novo);
}

/** O e-mail. Exportado para o teste ler o que o dono vai ler. */
export function textoDoAvisoDeEmailTrocado(
  troca: TrocaDeEmail,
  ctx: { barbearia: string; painel: string; quando: string },
): Pick<Email, 'assunto' | 'texto'> {
  const { pessoa, novo, quemTrocou } = troca;
  const porQuem = quemTrocou.id === pessoa.id ? 'pelo seu próprio acesso' : `por ${quemTrocou.nome}`;
  const oQue = novo
    ? [
        `O e-mail do seu acesso ao painel — ${ctx.barbearia} — foi trocado em ${ctx.quando}, ${porQuem}.`,
        `Agora é ${mascararEmail(novo)}: é para lá que vão a senha nova e os avisos. Este endereço não recebe mais nada.`,
      ]
    : [
        `O e-mail do seu acesso ao painel — ${ctx.barbearia} — foi apagado em ${ctx.quando}, ${porQuem}.`,
        'Sem e-mail, a senha nova e os avisos não chegam mais a você. Este é o último que chega aqui.',
      ];

  const entrar = ctx.painel
    ? `Entre no painel com o seu WhatsApp e a sua senha: ${ctx.painel}/admin/login`
    : 'Entre no painel com o seu WhatsApp e a sua senha.';
  // O barbeiro não tem a tela da Equipe: quem mexe no e-mail e na senha dele é o dono.
  const seNaoFoi = pessoa.papel === 'admin'
    ? [
        'Não reconhece a troca? Alguém pode estar com o painel da barbearia aberto. Faça isto agora:',
        `1. ${entrar}`,
        '2. Em Equipe, na sua linha, ponha uma senha nova — todo aparelho com o painel aberto vai pedir login de novo.',
        '3. Na mesma tela, volte o e-mail para este.',
        '',
        `Se a sua senha não entrar mais, fale com o suporte do ${NOME_PRODUTO} pelo mesmo WhatsApp do seu login.`,
      ]
    : [
        'Não reconhece a troca? Fale com o dono da barbearia: é ele quem cuida do e-mail e da senha da equipe.',
      ];

  return {
    assunto: novo
      ? `O e-mail do seu acesso foi trocado — ${NOME_PRODUTO}`
      : `O e-mail do seu acesso foi apagado — ${NOME_PRODUTO}`,
    texto: [
      `Olá, ${pessoa.nome}.`,
      '',
      ...oQue,
      '',
      'Foi você, ou alguém da barbearia que pode fazer isso? Então não precisa fazer nada.',
      '',
      ...seNaoFoi,
      '',
      `— ${NOME_PRODUTO}`,
    ].join('\n'),
  };
}

/**
 * Avisa o endereço antigo. Nunca lança: a troca já está feita. Devolve se o aviso
 * foi mandado — para o teste.
 *
 * `enviar` existe para o teste simular o provedor que recusa.
 */
export async function avisarEmailTrocado(p: TrocaDeEmail & {
  tenant: Tenant;
  agora?: Date;
  enviar?: (e: Email) => Promise<unknown>;
}): Promise<boolean> {
  if (!trocaQueAvisa(p.antigo, p.novo)) return false;
  const para = normalizarEmail(p.antigo)!;
  const enviar = p.enviar ?? enviarEmail;
  try {
    const conteudo = textoDoAvisoDeEmailTrocado(p, {
      barbearia: (await getSettings(p.tenant)).businessName,
      painel: urlDoPainel(),
      quando: formatInTimeZone(p.agora ?? new Date(), fusoDe(p.tenant), "dd/MM/yyyy 'às' HH:mm"),
    });
    const naoSaiu = (erro: unknown) => console.warn(
      `[equipe] o aviso de e-mail trocado para ${mascararEmail(para)} não saiu:`,
      erro instanceof Error ? erro.message : erro,
    );
    // Sem `await`, de propósito: ver o cabeçalho. O `try` pega o envio que estoura
    // antes de devolver a promessa.
    try { enviar({ para, ...conteudo }).catch(naoSaiu); } catch (erro) { naoSaiu(erro); return false; }
    return true;
  } catch (erro) {
    console.error('[equipe] não consegui montar o aviso de e-mail trocado:', erro);
    return false;
  }
}
