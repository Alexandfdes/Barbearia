/**
 * "O seu site está no ar" — conferido, não suposto.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ──────────────────────────────────────────────
 *
 * Até 10/10/2026 a tela de fim do cadastro dizia *"O seu site está no ar."*
 * sempre que o app achava a barbearia pelo endereço — sem saber se a internet
 * chegava nele. Em produção, o subdomínio novo só tem certificado quando alguém
 * o adiciona no EasyPanel ou quando existe o certificado curinga
 * (`docs/ARQUITETURA-COBRANCA-V1.md` §7.4). Sem isso, a tela mandava o dono
 * divulgar no WhatsApp um link que não abria, no minuto em que ele estava mais
 * animado com o produto (`docs/JORNADA-DO-BARBEIRO.md` §2.8).
 *
 * ── COMO CONFERE ─────────────────────────────────────────────────────────────
 *
 * O navegador do dono pede ao site um SINAL (`/api/no-ar.svg`) como IMAGEM. A
 * imagem só carrega se o caminho inteiro funciona: o nome existe no DNS, o
 * certificado vale, o proxy entrega ao app, e o app acha a barbearia por aquele
 * endereço. Qualquer elo quebrado é erro — inclusive a página de 404 do proxy,
 * que chega com certificado válido e não é imagem.
 *
 * Rejeitado: `fetch(site, { mode: 'no-cors' })`. Ele dá certo com qualquer
 * resposta, e a página de 404 do proxy passaria por site no ar. E conferir no
 * servidor: o servidor enxerga a própria rede, não a do dono.
 *
 * ⚠️ Se o painel ganhar uma `Content-Security-Policy`, o `img-src` dela tem de
 * aceitar os endereços das barbearias — os subdomínios de `DOMINIO_BASE` e os
 * domínios próprios. Senão a imagem nunca carrega, e a tela diz "quase no ar"
 * para sempre. Hoje não há CSP nenhuma (conferido em 10/10/2026).
 */

export const CAMINHO_DO_SINAL = '/api/no-ar.svg';

/** O endereço do sinal no site: o caminho fixo, com um número que fura o cache. */
export function urlDoSinal(site: string, agora: number = Date.now()): string {
  const u = new URL(site);
  u.pathname = CAMINHO_DO_SINAL;
  u.search = `?t=${agora}`;
  u.hash = '';
  return u.toString();
}

/** O pedaço de `HTMLImageElement` que a conferência usa — para os testes trocarem. */
export interface Imagem {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}

export interface OpcoesDeConferir {
  criarImagem?: () => Imagem;
  /** Quanto esperar a imagem antes de desistir. */
  limiteMs?: number;
  agora?: () => number;
}

/** Uma conferência: `true` se o sinal carregou dentro do limite. Nunca rejeita. */
export function conferirNoAr(site: string, opcoes: OpcoesDeConferir = {}): Promise<boolean> {
  const criar = opcoes.criarImagem ?? (() => new Image() as Imagem);
  const limite = opcoes.limiteMs ?? 8_000;
  const agora = opcoes.agora ?? Date.now;

  return new Promise((resolve) => {
    let acabou = false;
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const img = criar();
    const acabar = (ok: boolean) => {
      if (acabou) return;
      acabou = true;
      if (relogio !== undefined) clearTimeout(relogio);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => acabar(true);
    img.onerror = () => acabar(false);
    relogio = setTimeout(() => acabar(false), limite);
    try {
      img.src = urlDoSinal(site, agora());
    } catch {
      acabar(false); // endereço que nem é URL
    }
  });
}

export interface OpcoesDeEsperar {
  /** O site abriu. Chamado uma vez só. */
  aoAbrir: () => void;
  /** A PRIMEIRA conferência falhou: a tela diz que ainda não abre. Chamado uma vez só. */
  aoFalhar?: () => void;
  /** Passou o tempo todo e não abriu. Chamado uma vez só, e a conferência para. */
  aoDesistir?: () => void;
  intervaloMs?: number;
  tentativas?: number;
  conferir?: (site: string) => Promise<boolean>;
}

/**
 * Confere na hora e, enquanto não abrir, de novo a cada intervalo. Devolve a
 * função que para e a que confere já — a do botão "conferir agora", que também
 * recomeça a contagem depois de a espera ter desistido.
 */
export function esperarNoAr(site: string, o: OpcoesDeEsperar): { parar: () => void; conferirAgora: () => void } {
  const conferir = o.conferir ?? ((s: string) => conferirNoAr(s));
  const intervalo = o.intervaloMs ?? 20_000;
  const tentativas = o.tentativas ?? 90; // 30 minutos, a 20 segundos cada
  let feitas = 0;
  let estado: 'esperando' | 'abriu' | 'desistiu' | 'parado' = 'esperando';
  let avisouFalha = false;
  let emAndamento = false;
  let proxima: ReturnType<typeof setTimeout> | undefined;

  const cancelarProxima = () => {
    if (proxima !== undefined) clearTimeout(proxima);
    proxima = undefined;
  };

  async function rodada(): Promise<void> {
    if (estado !== 'esperando' || emAndamento) return;
    emAndamento = true;
    cancelarProxima();
    feitas += 1;
    const ok = await conferir(site);
    emAndamento = false;
    if (estado !== 'esperando') return; // parado enquanto conferia
    if (ok) {
      estado = 'abriu';
      o.aoAbrir();
      return;
    }
    if (!avisouFalha) {
      avisouFalha = true;
      o.aoFalhar?.();
    }
    if (feitas >= tentativas) {
      estado = 'desistiu';
      o.aoDesistir?.();
      return;
    }
    proxima = setTimeout(() => { void rodada(); }, intervalo);
  }

  void rodada();
  return {
    parar: () => {
      estado = 'parado';
      cancelarProxima();
    },
    conferirAgora: () => {
      if (estado === 'desistiu') {
        estado = 'esperando';
        feitas = 0;
      }
      void rodada();
    },
  };
}
