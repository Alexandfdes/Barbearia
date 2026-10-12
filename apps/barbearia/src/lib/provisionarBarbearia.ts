/**
 * Criar uma barbearia — a regra, num lugar só.
 *
 * ── POR QUE ISTO FOI EXTRAÍDO ────────────────────────────────────────────────
 *
 * Isto morava inteiro dentro de `scripts/provisionar.mts`. Quando o cadastro
 * pela web apareceu, havia duas saídas: reescrever a transação na rota, ou
 * compartilhar. Reescrever criaria dois lugares que sabem nascer uma barbearia
 * — e a primeira mudança feita em um deles sobreviveria meses no outro sem
 * ninguém notar. É literalmente o defeito que `PENDENCIAS-ABERTAS.md` §4.6 e
 * §4.2 registram, das duas vezes em que aconteceu neste projeto.
 *
 * ── POR QUE DEVOLVE ERRO EM VEZ DE ESTOURAR ──────────────────────────────────
 *
 * O script podia `process.exit(1)` com uma mensagem no terminal. Uma rota HTTP
 * não pode: ela precisa saber QUAL campo recusou para devolver 409 ou 400 e
 * dizer ao dono o que corrigir. Por isso o retorno é `{ ok: false, campo, erro }`
 * — e quem chama decide se imprime, se responde 409, ou se ignora.
 *
 * ── A CONEXÃO VEM DE FORA, DE PROPÓSITO ──────────────────────────────────────
 *
 * O script abre a própria (`postgres(DATABASE_URL)`); a rota passa a do app.
 * Assim a mesma função serve aos dois sem que este arquivo saiba de qual mundo
 * veio a chamada — e sem importar `db/index.ts`, que arrastaria o contexto de
 * requisição para dentro de um script de linha de comando.
 *
 * ⚠️ Tem que ser a conexão do DONO do banco, nunca a da requisição sob RLS:
 * criar tenant é trabalho de manutenção, e a barbearia que está nascendo ainda
 * não é de ninguém.
 */
import type postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { derivarAccent, ACCENT_PADRAO, isHex, type Accent } from './accent.js';
import { formatarTelefone } from './phone.js';
import { enderecoReservado } from './enderecosReservados.js';
import { fimDoTeste } from './situacao.js';
import { ehFusoDoBrasil, fusoDoEstado } from './timezone.js';
import { emailValido, normalizarEmail } from './email.js';

const BCRYPT_COST = 12;

export interface DadosDaBarbearia {
  slug: string;
  nome: string;
  dono: string;
  telefone: string;
  endereco: string;
  cidade: string;
  /**
   * A sigla do estado ("RN"): é dela que sai o fuso dos horários da barbearia
   * (`fusoDoEstado`). O cadastro pela web pede sempre. O script aceita também a
   * sigla no fim da cidade ("Mossoró/RN"), como os exemplos antigos.
   */
  estado?: string;
  /**
   * O fuso direto, por cima do estado — para quem está numa ponta de estado com
   * dois fusos (o oeste do Amazonas, Noronha). Um dos 16 de `FUSOS_DO_BRASIL`.
   */
  fuso?: string;
  senha: string;
  /** O do topo e do rodapé. Sem ele, o nome sem o prefixo genérico. */
  curto?: string;
  /** Com quem o DONO entra no painel. Sem ele, o mesmo da barbearia. */
  telefoneDono?: string;
  cor?: string;
  dominio?: string | null;
  /**
   * Os serviços que o dono digitou no cadastro, COM o preço dele.
   *
   * ⚠️ Preço zero não vai para o ar — a regra do §4.5 continua valendo, só mudou
   * o momento da pergunta. Antes o dono apertava um botão no painel e recebia
   * oito serviços desligados para preencher; agora ele preenche no cadastro. O
   * que tem preço nasce ATIVO, o que ficou em branco nasce DESLIGADO — nunca
   * "R$ 0,00" publicado, que é o que aquela decisão existe para impedir.
   */
  servicos?: ServicoDoCadastro[];
  /** `@fulano` ou a URL inteira; guardamos as duas formas. */
  instagram?: string;
  /** Como o dono descreve a barbearia. Vai para `about_text`. */
  sobre?: string;
  /**
   * A frase do topo do site — o título que o visitante lê primeiro. Vai para
   * `tagline`; sem ela, o topo mostra o nome da barbearia (`Hero.astro`).
   */
  frase?: string;
  /**
   * O e-mail do dono: recuperação de senha e avisos do teste e da cobrança
   * (decisão de 08/10/2026). O cadastro pela web exige; o script de linha de
   * comando, não — por isso é opcional aqui.
   */
  email?: string;
  /**
   * A semana dele. Ausente = comercial padrão.
   *
   * ⚠️ Alimenta DUAS coisas que o schema mantém separadas de propósito:
   * `working_hours`, que gera as vagas do agendamento, e `settings.business_hours`,
   * que é o texto que aparece no site. Antes desta versão as duas eram cravadas
   * aqui, iguais para todo mundo — e a barbearia que abre ao meio-dia nascia
   * anunciando 09:00 e oferecendo vaga às 09:00.
   */
  horarios?: HorarioDoCadastro[];
  /**
   * Nasce pagando, sem o teste de 7 dias. Só o script de linha de comando oferece
   * (`--sem-teste`), para barbearia que você combinou por fora; o cadastro pela
   * web nunca — lá todo mundo começa no teste (decisão de 08/10/2026).
   */
  semTeste?: boolean;
}

export interface HorarioDoCadastro {
  /** 0 domingo … 6 sábado, como `Date.getDay()`. */
  weekday: number;
  /** "09:00". Ignorado quando `fechado`. */
  abre?: string;
  fecha?: string;
  fechado?: boolean;
}

export interface ServicoDoCadastro {
  nome: string;
  /** Em centavos. Zero ou ausente = entra desligado. */
  precoCentavos: number;
  minutos: number;
}

export interface BarbeariaCriada {
  ok: true;
  tenantId: number;
  barbeiroId: number;
  slug: string;
  nome: string;
  curto: string;
  /** Já normalizado: é ISTO que ele digita no login. */
  telefoneLogin: string;
  accent: Accent;
  corVeioDoCliente: boolean;
  servicosCriados: number;
  /** Quantos já nascem no ar. Zero significa site sem agendamento possível. */
  servicosAtivos: number;
  /** Fim do teste grátis; `null` quando nasceu pagando (`semTeste`). */
  testeAte: Date | null;
  /** O fuso da barbearia, gravado em `tenants.timezone`. */
  fuso: string;
}

export interface RecusaDeProvisionamento {
  ok: false;
  /** Qual campo recusou, para a tela poder apontar o erro no lugar certo. */
  campo: 'slug' | 'nome' | 'dono' | 'telefone' | 'telefone-dono' | 'endereco' | 'cidade' | 'estado' | 'senha' | 'cor' | 'servicos' | 'horarios' | 'email' | 'frase';
  erro: string;
  /** `true` quando o problema é colisão com algo que já existe (HTTP 409). */
  conflito?: boolean;
}

export type ResultadoProvisionamento = BarbeariaCriada | RecusaDeProvisionamento;

/** Só dígitos, como o resto do sistema guarda. Tira o 55 do início. */
export function soDigitos(t: string): string {
  return t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
}

/**
 * O nome curto vai no topo e no rodapé, em maiúsculas e com espaçamento largo:
 * "BARBEARIA CORTES DO ZÉ" estoura a barra. Sem um curto explícito, tiramos o
 * prefixo genérico e ficamos com a parte que identifica a barbearia.
 */
export function curtoPadrao(nome: string): string {
  const semPrefixo = nome
    .replace(/^\s*(barbearia|barber\s*shop|salão|salao)\s+(do\s+|da\s+|de\s+)?/i, '')
    .trim();
  return semPrefixo || nome;
}

/** Mesma regra do `api/admin/services/catalogo-sugerido.ts`. */
export function slugificar(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Horário comercial padrão, para quem não preencher. Neutro, não de outra barbearia. */
const HORARIO_PADRAO: HorarioDoCadastro[] = [
  { weekday: 0, fechado: true },
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, abre: '09:00', fecha: '19:00' })),
  { weekday: 6, abre: '09:00', fecha: '18:00' },
];

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * O texto que aparece no site, a partir da semana que o dono preencheu.
 *
 * Agrupa dias seguidos com o mesmo horário: sete linhas idênticas numa lista de
 * "onde estamos" é ruído, e "Segunda — Sexta" é como qualquer barbearia escreve.
 */
export function horarioDeVitrine(semana: HorarioDoCadastro[]): string {
  const porDia = new Map(semana.map((h) => [h.weekday, h]));
  const blocos: { label: string; hours: string; closed: boolean }[] = [];

  let i = 0;
  const ordem = [1, 2, 3, 4, 5, 6, 0];   // a semana do comércio começa na segunda
  while (i < ordem.length) {
    const atual = porDia.get(ordem[i]);
    const texto = !atual || atual.fechado ? null : `${atual.abre} — ${atual.fecha}`;
    let j = i;
    while (j + 1 < ordem.length) {
      const prox = porDia.get(ordem[j + 1]);
      const proxTexto = !prox || prox.fechado ? null : `${prox.abre} — ${prox.fecha}`;
      if (proxTexto !== texto) break;
      j++;
    }
    const label = i === j ? DIAS[ordem[i]] : `${DIAS[ordem[i]]} — ${DIAS[ordem[j]]}`;
    blocos.push({ label, hours: texto ?? 'Fechado', closed: texto === null });
    i = j + 1;
  }
  return JSON.stringify(blocos);
}

export async function provisionarBarbearia(
  sql: postgres.Sql,
  dados: DadosDaBarbearia,
  /** O relógio, para o teste poder fixar a data do cadastro. */
  agora: Date = new Date(),
): Promise<ResultadoProvisionamento> {
  const slug = (dados.slug ?? '').trim().toLowerCase();
  const nome = (dados.nome ?? '').trim();
  const dono = (dados.dono ?? '').trim();
  const endereco = (dados.endereco ?? '').trim();
  const cidade = (dados.cidade ?? '').trim();
  const senha = dados.senha ?? '';
  const curto = (dados.curto ?? '').trim() || curtoPadrao(nome);
  const dominio = dados.dominio?.trim().toLowerCase() || null;

  for (const [campo, valor] of [
    ['slug', slug], ['nome', nome], ['dono', dono],
    ['telefone', dados.telefone], ['endereco', endereco], ['cidade', cidade],
  ] as const) {
    if (!valor || !String(valor).trim()) {
      return { ok: false, campo: campo as RecusaDeProvisionamento['campo'], erro: `Falta informar ${campo}.` };
    }
  }

  if (senha.length < 8) {
    return { ok: false, campo: 'senha', erro: 'A senha precisa de pelo menos 8 caracteres.' };
  }

  // O slug vira subdomínio: precisa ser um rótulo de DNS válido.
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return {
      ok: false, campo: 'slug',
      erro: `"${slug}" não serve como endereço. Use só letras minúsculas, números e hífen.`,
    };
  }

  // O fuso dos horários. Sem ele nada nasce: um padrão calado poria a barbearia de
  // Manaus uma hora adiantada em tudo — o agendamento, a agenda, os e-mails —,
  // sem nenhum aviso na tela (`lib/timezone.ts`).
  if (dados.fuso !== undefined && !ehFusoDoBrasil(dados.fuso)) {
    return { ok: false, campo: 'estado', erro: `"${dados.fuso}" não é um dos fusos do Brasil.` };
  }
  const siglaNaCidade = /(?:\s*\/\s*|\s+-\s+|,\s*)([A-Za-z]{2})\s*$/.exec(cidade)?.[1];
  const fuso = dados.fuso ?? fusoDoEstado(dados.estado) ?? (dados.estado ? null : fusoDoEstado(siglaNaCidade));
  if (!fuso) {
    return {
      ok: false, campo: 'estado',
      erro: dados.estado
        ? `"${dados.estado}" não é a sigla de um estado.`
        : 'Falta informar o estado — é dele que sai o fuso dos horários.',
    };
  }
  // A cidade fica guardada como "Cidade/UF": é o formato que Configurações pede e
  // que o site divide para o Google (`layouts/Layout.astro`). Pela web o estado
  // vem à parte; quem escreveu a sigla na cidade já está no formato.
  const ufDoEstado = fusoDoEstado(dados.estado) ? dados.estado!.trim().toUpperCase() : null;
  const cidadeDoSite = ufDoEstado && !siglaNaCidade ? `${cidade}/${ufDoEstado}` : cidade;

  // `painel`, `www`, o nome do produto… — `lib/enderecosReservados.ts` diz por quê.
  if (enderecoReservado(slug)) {
    return {
      ok: false, campo: 'slug',
      erro: `"${slug}" é um endereço reservado do sistema. Escolha outro.`,
    };
  }

  // A regra do e-mail mora em `lib/email.ts` — a mesma da tela da equipe.
  const email = normalizarEmail(dados.email);
  if (email && !emailValido(email)) {
    return { ok: false, campo: 'email', erro: `"${dados.email}" não parece um e-mail.` };
  }

  const frase = (dados.frase ?? '').trim() || null;
  if (frase && frase.length > 200) {
    return { ok: false, campo: 'frase', erro: 'A frase do topo passa de 200 caracteres.' };
  }

  if (dados.cor && !isHex(dados.cor)) {
    return { ok: false, campo: 'cor', erro: `"${dados.cor}" não é um hex de 6 dígitos (ex: #7c3aed).` };
  }

  const telefoneDigitos = soDigitos(dados.telefone);
  if (telefoneDigitos.length < 10 || telefoneDigitos.length > 11) {
    return {
      ok: false, campo: 'telefone',
      erro: `"${dados.telefone}" não tem 10 ou 11 dígitos depois de limpo.`,
    };
  }

  const telefoneLogin = soDigitos(dados.telefoneDono ?? dados.telefone);
  if (telefoneLogin.length < 10 || telefoneLogin.length > 11) {
    return {
      ok: false, campo: 'telefone-dono',
      erro: `"${dados.telefoneDono}" não tem 10 ou 11 dígitos depois de limpo.`,
    };
  }

  const jaExiste = await sql`SELECT slug FROM tenants WHERE slug = ${slug}`;
  if (jaExiste.length) {
    return { ok: false, campo: 'slug', conflito: true, erro: `Já existe uma barbearia no endereço "${slug}".` };
  }

  // O telefone de login é único NO MUNDO (migration 0002). Conferimos antes para
  // dar uma mensagem útil, em vez de estourar a constraint no meio da transação.
  const telefoneEmUso = await sql`SELECT 1 FROM barbers WHERE phone = ${telefoneLogin}`;
  if (telefoneEmUso.length) {
    return {
      ok: false, campo: 'telefone-dono', conflito: true,
      erro: 'Este WhatsApp já é o login de outro barbeiro.',
    };
  }

  const servicos = (dados.servicos ?? []).filter((x) => x && String(x.nome ?? '').trim());
  for (const sv of servicos) {
    if (!Number.isInteger(sv.precoCentavos) || sv.precoCentavos < 0 || sv.precoCentavos > 10_000_00) {
      return { ok: false, campo: 'servicos', erro: `Preço inválido em "${sv.nome}".` };
    }
    if (!Number.isInteger(sv.minutos) || sv.minutos < 5 || sv.minutos > 480) {
      return { ok: false, campo: 'servicos', erro: `Duração inválida em "${sv.nome}" (5 a 480 minutos).` };
    }
  }
  const nomesVistos = new Set<string>();
  for (const sv of servicos) {
    const chave = slugificar(sv.nome);
    if (nomesVistos.has(chave)) {
      return { ok: false, campo: 'servicos', erro: `"${sv.nome}" aparece duas vezes.` };
    }
    nomesVistos.add(chave);
  }

  const semana = (dados.horarios?.length ? dados.horarios : HORARIO_PADRAO)
    .filter((h) => Number.isInteger(h.weekday) && h.weekday >= 0 && h.weekday <= 6);
  for (const h of semana) {
    if (h.fechado) continue;
    if (!HORA.test(h.abre ?? '') || !HORA.test(h.fecha ?? '')) {
      return { ok: false, campo: 'horarios', erro: `Horário inválido em ${DIAS[h.weekday]} (use 09:00).` };
    }
    if ((h.abre as string) >= (h.fecha as string)) {
      return { ok: false, campo: 'horarios', erro: `Em ${DIAS[h.weekday]}, a abertura tem que vir antes do fechamento.` };
    }
  }
  if (!semana.some((h) => !h.fechado)) {
    return { ok: false, campo: 'horarios', erro: 'Marque pelo menos um dia aberto — sem nenhum, ninguém consegue agendar.' };
  }

  // `@fulano`, `instagram.com/fulano` e a URL inteira chegam aqui. Guardamos as
  // duas formas porque o site usa o arroba no texto e a URL no link.
  const arroba = (dados.instagram ?? '').trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '').replace(/\/.*$/, '').trim();
  const instagramHandle = arroba ? `@${arroba}` : null;
  const instagramUrl = arroba ? `https://instagram.com/${arroba}` : null;
  const sobre = (dados.sobre ?? '').trim() || null;

  const accent = dados.cor ? derivarAccent(dados.cor) : ACCENT_PADRAO;

  // ⚠️ O WhatsApp DA LOJA vai com o 55. O site monta `wa.me/<número>`, e o wa.me lê
  // o começo do número como código do país: sem o 55, "84 99665-8951" virava +84,
  // o Vietnã. Todo botão de WhatsApp de toda barbearia criada por aqui levava a um
  // número que não existe — achado em 27/09/2026, no primeiro teste de ponta a
  // ponta. É também o formato que o campo do painel pede ("DDI + DDD + número").
  // O LOGIN continua sem o 55: é assim que `normalizePhone` compara no login.
  const whatsappDaLoja = `55${telefoneDigitos}`;
  const hash = bcrypt.hashSync(senha, BCRYPT_COST);

  // Slug do dono dentro da barbearia. Único por tenant, então o primeiro nome basta.
  const slugDono =
    dono.trim().split(/\s+/)[0]
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin';

  const testeAte = dados.semTeste ? null : fimDoTeste(agora, fuso);

  // Tudo numa transação: barbearia meio criada — com tenant e sem dono, por
  // exemplo — é pior que criação nenhuma, porque o slug fica ocupado e o
  // provisionamento não pode simplesmente rodar de novo.
  const resultado = await sql.begin(async (tx) => {
    // ⚠️ Toda barbearia nasce NO TESTE, com a data de fim gravada — não `active`,
    // o padrão da coluna, que daria o produto de graça para sempre a quem se
    // cadastrasse. A fase de cada dia sai de `lib/situacao.ts`.
    //
    // A data vai como TEXTO ISO, e não como `Date`: no pool do app o Drizzle troca
    // o conversor de datas pelo que não converte nada, e um `Date` chega ao driver
    // cru — "The string argument must be of type string". O teste só pega isso
    // pela rota, que usa o pool; pelo script, com conexão própria, passava.
    const [tenant] = await tx`
      INSERT INTO tenants (slug, domain, business_name, status, trial_ends_at, timezone)
      VALUES (${slug}, ${dominio}, ${nome}, ${testeAte ? 'trial' : 'active'}, ${testeAte ? testeAte.toISOString() : null}, ${fuso})
      RETURNING id
    `;

    await tx`
      INSERT INTO settings (
        tenant_id, business_name, short_name, whatsapp_number, whatsapp_display,
        address_street, address_city, business_hours,
        instagram_handle, instagram_url, about_text, tagline,
        accent_color, accent_hover, accent_light,
        seo_title, products_section_title
      ) VALUES (
        ${tenant.id}, ${nome}, ${curto}, ${whatsappDaLoja}, ${formatarTelefone(telefoneDigitos)},
        ${endereco}, ${cidadeDoSite}, ${horarioDeVitrine(semana)},
        ${instagramHandle}, ${instagramUrl}, ${sobre}, ${frase},
        ${accent.color}, ${accent.hover}, ${accent.light},
        ${nome}, 'Produtos'
      )
    `;

    // Sem `phone` o dono é criado e NÃO consegue entrar: o login do painel é
    // por telefone. A falha só apareceria no primeiro acesso dele.
    const [barbeiro] = await tx`
      INSERT INTO barbers (tenant_id, name, slug, phone, email, role, password_hash)
      VALUES (${tenant.id}, ${dono}, ${slugDono}, ${telefoneLogin}, ${email}, 'admin', ${hash})
      RETURNING id
    `;

    // ⚠️ Só os dias ABERTOS viram linha. Dia fechado é a AUSÊNCIA de linha —
    // `getAvailableSlots` monta as vagas a partir daqui, e um registro com
    // horário vazio geraria vaga em dia de folga.
    for (const h of semana) {
      if (h.fechado) continue;
      // `as string`: dia aberto tem as duas horas — conferido antes da transação.
      await tx`
        INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
        VALUES (${tenant.id}, ${barbeiro.id}, ${h.weekday}, ${h.abre as string}, ${h.fecha as string})
      `;
    }

    // Os serviços entram na MESMA transação: barbearia criada e catálogo pela
    // metade deixaria o slug ocupado e o cadastro sem como rodar de novo.
    let ativos = 0;
    for (const sv of servicos) {
      const noAr = sv.precoCentavos > 0;
      const [servico] = await tx`
        INSERT INTO services (tenant_id, name, slug, price_cents, active)
        VALUES (${tenant.id}, ${sv.nome.trim()}, ${slugificar(sv.nome)}, ${sv.precoCentavos}, ${noAr})
        RETURNING id
      `;
      await tx`
        INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active)
        VALUES (${tenant.id}, ${barbeiro.id}, ${servico.id}, ${sv.minutos}, true)
      `;
      if (noAr) ativos++;
    }

    return { tenantId: Number(tenant.id), barbeiroId: Number(barbeiro.id), ativos };
  });

  return {
    ok: true,
    tenantId: resultado.tenantId,
    barbeiroId: resultado.barbeiroId,
    slug, nome, curto, telefoneLogin, accent,
    corVeioDoCliente: Boolean(dados.cor),
    servicosCriados: servicos.length,
    servicosAtivos: resultado.ativos,
    testeAte,
    fuso,
  };
}
