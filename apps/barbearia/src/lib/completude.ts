/**
 * Medidor de completude — `PENDENCIAS-ABERTAS.md` §4.4.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * Não é enfeite de painel. A R$ 100/mês, o preço só fecha se o suporte ficar
 * perto de meia hora por cliente (`PRECIFICACAO.md` §5.1) — a 1,5h dá prejuízo.
 * Cada item aqui foi escolhido por uma pergunta só: **que mensagem de WhatsApp
 * no sábado isso evita?**
 *
 * Item que não evita pergunta nenhuma não entra, por mais bonito que fique.
 *
 * ── POR QUE DUAS LISTAS, E NÃO UMA PORCENTAGEM SÓ ────────────────────────────
 *
 * Uma barbearia pode ter 90% dos campos preenchidos e **não receber um
 * agendamento sequer**, porque falta cadastrar o primeiro serviço. Dizer "90%
 * completo" nesse caso é pior que não ter medidor: passa a sensação de que está
 * quase pronto quando o negócio está parado.
 *
 * Então são duas perguntas separadas:
 *   1. `bloqueios` — o que impede de FUNCIONAR. Enquanto houver um, não há
 *      porcentagem: só a lista.
 *   2. `pendencias` + `percentual` — o que falta para ficar APRESENTÁVEL.
 */
import { MINIMO_PARA_APARECER } from './galeria.js';

/** O estado da barbearia, do jeito que o medidor precisa ver. */
export interface EstadoDaBarbearia {
  logoPath: string | null;
  heroPath: string | null;
  tagline: string | null;
  aboutText: string | null;
  whatsappNumber: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  instagramUrl: string | null;
  googleReviewsUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Cor de marca escolhida pelo dono; o padrão do template não conta. */
  accentColor: string | null;
  /** Quantidade de blocos em `business_hours`. */
  horariosPublicados: number;
  /** Serviços ativos no catálogo. */
  servicosAtivos: number;
  /** Barbeiros ativos QUE TÊM expediente cadastrado. */
  barbeirosComAgenda: number;
  /** Fotos na galeria do site (`gallery_images`). */
  fotosNaGaleria: number;
}

export interface Item {
  /** Chave estável — serve de âncora e de identificador em teste. */
  id: string;
  /** O que falta, na língua do dono. Nunca o nome da coluna. */
  titulo: string;
  /** Por que importa. Aparece embaixo do título. */
  porque: string;
  /** Para onde o botão leva. */
  href: string;
  peso: number;
}

/** A cor que o template usa quando ninguém escolheu nada (`lib/accent.ts`). */
const ACCENT_PADRAO = '#0f766e';

const vazio = (v: string | null | undefined): boolean => !v || v.trim() === '';

/**
 * O que impede a barbearia de FUNCIONAR. Sem peso: ou tem, ou o negócio não roda.
 */
function bloqueiosDe(e: EstadoDaBarbearia): Item[] {
  const b: Item[] = [];

  if (e.servicosAtivos === 0) b.push({
    id: 'servicos',
    titulo: 'Cadastre pelo menos um serviço',
    porque: 'Sem serviço no catálogo ninguém consegue marcar horário — e a seção de serviços nem aparece no site.',
    href: '/admin/servicos', peso: 0,
  });

  if (e.barbeirosComAgenda === 0) b.push({
    id: 'agenda',
    titulo: 'Defina o horário de trabalho',
    porque: 'Sem expediente cadastrado a agenda não tem vaga nenhuma para oferecer.',
    href: '/admin/horarios', peso: 0,
  });

  if (vazio(e.whatsappNumber)) b.push({
    id: 'whatsapp',
    titulo: 'Informe o WhatsApp',
    porque: 'É o botão que o cliente mais aperta no site. Vazio, ele não leva a lugar nenhum.',
    href: '/admin/configuracoes', peso: 0,
  });

  if (vazio(e.addressStreet) || vazio(e.addressCity)) b.push({
    id: 'endereco',
    titulo: 'Informe o endereço',
    porque: 'O cliente não descobre onde é, e o mapa e a rota não abrem.',
    href: '/admin/configuracoes', peso: 0,
  });

  return b;
}

/**
 * O que falta para o site ficar APRESENTÁVEL. Peso alto para o que gera
 * pergunta; baixo para o que é cosmético.
 */
function pendenciasDe(e: EstadoDaBarbearia): { faltando: Item[]; total: number } {
  const todos: (Item & { ok: boolean })[] = [
    { id: 'logo', peso: 20, ok: !vazio(e.logoPath),
      titulo: 'Suba a logo',
      porque: 'Sem ela o topo do site mostra só o nome escrito.',
      href: '/admin/configuracoes' },

    { id: 'horarios-publicados', peso: 15, ok: e.horariosPublicados > 0,
      titulo: 'Publique os horários de funcionamento',
      porque: '"Vocês abrem domingo?" é a pergunta que mais chega no WhatsApp.',
      href: '/admin/configuracoes' },

    { id: 'sobre', peso: 15, ok: !vazio(e.aboutText),
      titulo: 'Escreva o texto sobre a barbearia',
      porque: 'É o que aparece no rodapé. Vazio, sobra um buraco.',
      href: '/admin/configuracoes' },

    { id: 'tagline', peso: 15, ok: !vazio(e.tagline),
      titulo: 'Escreva a frase do topo',
      porque: 'É a primeira coisa que o cliente lê. Sem ela, o topo fica genérico.',
      href: '/admin/configuracoes' },

    { id: 'hero', peso: 10, ok: !vazio(e.heroPath),
      titulo: 'Suba uma foto de capa',
      porque: 'Opcional: sem foto o topo usa uma versão só com texto, que também fica boa.',
      href: '/admin/configuracoes' },

    // A pergunta que evita: "como eu coloco as fotos dos meus cortes no site?".
    { id: 'galeria', peso: 10, ok: e.fotosNaGaleria >= MINIMO_PARA_APARECER,
      titulo: 'Suba fotos dos seus cortes',
      porque: `A partir de ${MINIMO_PARA_APARECER} fotos a galeria aparece no site — cliente novo escolhe pelo trabalho que vê.`,
      href: '/admin/galeria' },

    { id: 'cor', peso: 10, ok: !vazio(e.accentColor) && e.accentColor !== ACCENT_PADRAO,
      titulo: 'Escolha a cor da sua marca',
      porque: 'O site está no verde padrão do sistema, igual ao de todo mundo.',
      href: '/admin/configuracoes' },

    { id: 'instagram', peso: 5, ok: !vazio(e.instagramUrl),
      titulo: 'Ligue o Instagram',
      porque: 'O botão do rodapé leva o cliente para o seu perfil.',
      href: '/admin/configuracoes' },

    { id: 'avaliacoes', peso: 5, ok: !vazio(e.googleReviewsUrl),
      titulo: 'Ligue as avaliações do Google',
      porque: 'Mostra sua nota real no site — quem tem avaliação boa vende mais.',
      href: '/admin/configuracoes' },

    { id: 'seo', peso: 5, ok: !vazio(e.seoTitle) && !vazio(e.seoDescription),
      titulo: 'Ajuste como o site aparece no Google',
      porque: 'É o título e a descrição que saem na busca.',
      href: '/admin/configuracoes' },
  ];

  const total = todos.reduce((s, i) => s + i.peso, 0);
  const faltando = todos.filter((i) => !i.ok).map(({ ok: _ok, ...i }) => i);
  return { faltando, total };
}

export interface Completude {
  /** Impede de funcionar. Enquanto houver, ignore o percentual. */
  bloqueios: Item[];
  /** Falta para ficar apresentável, do mais pesado para o mais leve. */
  pendencias: Item[];
  /** 0–100. Só faz sentido quando `bloqueios` está vazio. */
  percentual: number;
  /** Nada a fazer: o card pode sumir do painel. */
  completo: boolean;
}

export function calcularCompletude(e: EstadoDaBarbearia): Completude {
  const bloqueios = bloqueiosDe(e);
  const { faltando, total } = pendenciasDe(e);

  const pesoQueFalta = faltando.reduce((s, i) => s + i.peso, 0);
  const percentual = Math.round(((total - pesoQueFalta) / total) * 100);

  return {
    bloqueios,
    // Mais pesado primeiro: o dono resolve o que mais rende antes de cansar.
    pendencias: [...faltando].sort((a, b) => b.peso - a.peso),
    percentual,
    completo: bloqueios.length === 0 && faltando.length === 0,
  };
}
