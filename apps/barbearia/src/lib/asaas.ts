/**
 * A API da Asaas — só o pedaço que a cobrança usa (`lib/cobranca.ts`).
 *
 * Conferido na documentação da Asaas em 10/10/2026 (docs.asaas.com), **não
 * testado no sandbox**: a autenticação pelo cabeçalho `access_token`, o
 * `User-Agent` obrigatório para contas criadas desde 13/06/2024, as duas URLs, o
 * Checkout (`POST /checkouts`), o cliente sem notificações
 * (`PUT /customers/{id}` com `notificationDisabled`) e a assinatura
 * (`GET`/`DELETE /subscriptions/{id}`, `GET /subscriptions?customer=`).
 *
 * ⚠️ SEM `ASAAS_AMBIENTE=producao`, É SANDBOX. O erro que sobra de uma variável
 * esquecida é não cobrar — nunca cobrar de verdade num teste. Chave de um
 * ambiente na URL do outro dá 401 (documentação).
 *
 * ⚠️ A chave nunca vai para log, nem para mensagem de erro, nem para o navegador.
 */
import { NOME_PRODUTO } from './produto.js';

export type AmbienteAsaas = 'sandbox' | 'producao';

export interface ConfigAsaas {
  url: string;
  chave: string;
  ambiente: AmbienteAsaas;
}

const URL_PADRAO: Record<AmbienteAsaas, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

/** A configuração, ou `null` quando a cobrança não está ligada (sem `ASAAS_API_KEY`). */
export function configDaAsaas(env: Record<string, string | undefined> = process.env): ConfigAsaas | null {
  const chave = env.ASAAS_API_KEY?.trim();
  if (!chave) return null;
  const ambiente: AmbienteAsaas = env.ASAAS_AMBIENTE?.trim() === 'producao' ? 'producao' : 'sandbox';
  // `ASAAS_URL` só existe para os testes apontarem para uma Asaas de mentira.
  const url = (env.ASAAS_URL?.trim() || URL_PADRAO[ambiente]).replace(/\/+$/, '');
  return { url, chave, ambiente };
}

/** Resposta de erro da Asaas, com o motivo que ela deu — nunca com a chave. */
export class ErroDaAsaas extends Error {
  constructor(mensagem: string, readonly status: number) {
    super(mensagem);
    this.name = 'ErroDaAsaas';
  }
}

/** `{ errors: [{ description }] }` vira uma frase; o resto, um pedaço do corpo. */
function motivo(corpo: unknown): string {
  const erros = (corpo as { errors?: { description?: string; code?: string }[] } | null)?.errors;
  if (Array.isArray(erros) && erros.length) {
    return erros.map((e) => e.description || e.code || '?').join('; ');
  }
  return typeof corpo === 'string' ? corpo.slice(0, 200) : JSON.stringify(corpo ?? null).slice(0, 200);
}

async function pedir<T>(cfg: ConfigAsaas, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${cfg.url}${caminho}`, {
      method: metodo,
      headers: {
        access_token: cfg.chave,
        'content-type': 'application/json',
        'user-agent': `${NOME_PRODUTO}/1.0`,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new ErroDaAsaas(`A Asaas não respondeu a ${metodo} ${caminho}: ${e instanceof Error ? e.message : e}`, 0);
  }
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  if (!r.ok) throw new ErroDaAsaas(`A Asaas respondeu ${r.status} a ${metodo} ${caminho}: ${motivo(dados)}`, r.status);
  return dados as T;
}

const id = (v: string) => encodeURIComponent(v);

export interface CorpoDoCheckout {
  billingTypes: ['CREDIT_CARD'];
  chargeTypes: ['RECURRENT'];
  minutesToExpire: number;
  externalReference: string;
  callback: { successUrl: string; cancelUrl: string; expiredUrl: string };
  items: { name: string; description: string; quantity: number; value: number; imageBase64: string }[];
  subscription: { cycle: 'MONTHLY'; nextDueDate: string };
  /** Um ou outro, nunca os dois (documentação). */
  customer?: string;
  customerData?: { name?: string; email?: string; phone?: string };
}

/** Cria o Checkout. Devolve o id e o endereço que o dono abre. */
export async function criarCheckout(cfg: ConfigAsaas, corpo: CorpoDoCheckout): Promise<{ id: string; link: string }> {
  const r = await pedir<{ id?: string; link?: string | null }>(cfg, 'POST', '/checkouts', corpo);
  if (!r?.id) throw new ErroDaAsaas('A Asaas criou o Checkout sem devolver o id.', 200);
  return { id: r.id, link: r.link || linkDoCheckout(cfg, r.id) };
}

/**
 * O endereço do Checkout quando a resposta não traz o `link`. O de produção é o da
 * documentação; o do sandbox segue o mesmo padrão e **não foi conferido**.
 */
export function linkDoCheckout(cfg: ConfigAsaas, checkoutId: string): string {
  const site = cfg.ambiente === 'producao' ? 'https://asaas.com' : 'https://sandbox.asaas.com';
  return `${site}/checkoutSession/show?id=${id(checkoutId)}`;
}

/**
 * Desliga as notificações da Asaas para o cliente — elas nascem ligadas, oito,
 * inclusive ligação telefônica na cobrança vencida. Quem avisa o dono é o app.
 */
export async function desligarNotificacoes(cfg: ConfigAsaas, clienteId: string): Promise<void> {
  await pedir(cfg, 'PUT', `/customers/${id(clienteId)}`, { notificationDisabled: true });
}

export interface AssinaturaAsaas {
  id: string;
  customer?: string;
  status?: string;
  /** "AAAA-MM-DD": o vencimento da próxima cobrança. */
  nextDueDate?: string;
  deleted?: boolean;
  dateCreated?: string;
}

export async function assinatura(cfg: ConfigAsaas, assinaturaId: string): Promise<AssinaturaAsaas> {
  return pedir<AssinaturaAsaas>(cfg, 'GET', `/subscriptions/${id(assinaturaId)}`);
}

/** As assinaturas do cliente que não foram removidas. */
export async function assinaturasDoCliente(cfg: ConfigAsaas, clienteId: string): Promise<AssinaturaAsaas[]> {
  const r = await pedir<{ data?: AssinaturaAsaas[] }>(cfg, 'GET', `/subscriptions?customer=${id(clienteId)}&limit=100`);
  return (r?.data ?? []).filter((a) => !a.deleted);
}

/** Remove a assinatura: a recorrência acaba, e as cobranças em aberto dela somem (documentação). */
export async function removerAssinatura(cfg: ConfigAsaas, assinaturaId: string): Promise<void> {
  await pedir(cfg, 'DELETE', `/subscriptions/${id(assinaturaId)}`);
}
