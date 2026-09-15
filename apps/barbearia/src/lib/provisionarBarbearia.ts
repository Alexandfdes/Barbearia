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

const BCRYPT_COST = 12;

export interface DadosDaBarbearia {
  slug: string;
  nome: string;
  dono: string;
  telefone: string;
  endereco: string;
  cidade: string;
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
}

export interface RecusaDeProvisionamento {
  ok: false;
  /** Qual campo recusou, para a tela poder apontar o erro no lugar certo. */
  campo: 'slug' | 'nome' | 'dono' | 'telefone' | 'telefone-dono' | 'endereco' | 'cidade' | 'senha' | 'cor' | 'servicos';
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

/** Horário comercial inicial: padrão neutro, não conteúdo de outra barbearia. */
const HORARIO_INICIAL = [
  ...[1, 2, 3, 4, 5].map((d) => ({ weekday: d, startTime: '09:00', endTime: '19:00' })),
  { weekday: 6, startTime: '09:00', endTime: '18:00' },
];
const HORARIO_TEXTO = JSON.stringify([
  { label: 'Segunda — Sexta', hours: '09:00 — 19:00', closed: false },
  { label: 'Sábado', hours: '09:00 — 18:00', closed: false },
  { label: 'Domingo', hours: 'Fechado', closed: true },
]);

export async function provisionarBarbearia(
  sql: postgres.Sql,
  dados: DadosDaBarbearia
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

  const accent = dados.cor ? derivarAccent(dados.cor) : ACCENT_PADRAO;
  const hash = bcrypt.hashSync(senha, BCRYPT_COST);

  // Slug do dono dentro da barbearia. Único por tenant, então o primeiro nome basta.
  const slugDono =
    dono.trim().split(/\s+/)[0]
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin';

  // Tudo numa transação: barbearia meio criada — com tenant e sem dono, por
  // exemplo — é pior que criação nenhuma, porque o slug fica ocupado e o
  // provisionamento não pode simplesmente rodar de novo.
  const resultado = await sql.begin(async (tx) => {
    const [tenant] = await tx`
      INSERT INTO tenants (slug, domain, business_name)
      VALUES (${slug}, ${dominio}, ${nome})
      RETURNING id
    `;

    await tx`
      INSERT INTO settings (
        tenant_id, business_name, short_name, whatsapp_number, whatsapp_display,
        address_street, address_city, business_hours,
        accent_color, accent_hover, accent_light,
        seo_title, products_section_title
      ) VALUES (
        ${tenant.id}, ${nome}, ${curto}, ${telefoneDigitos}, ${dados.telefone},
        ${endereco}, ${cidade}, ${HORARIO_TEXTO},
        ${accent.color}, ${accent.hover}, ${accent.light},
        ${nome}, 'Produtos'
      )
    `;

    // Sem `phone` o dono é criado e NÃO consegue entrar: o login do painel é
    // por telefone. A falha só apareceria no primeiro acesso dele.
    const [barbeiro] = await tx`
      INSERT INTO barbers (tenant_id, name, slug, phone, role, password_hash)
      VALUES (${tenant.id}, ${dono}, ${slugDono}, ${telefoneLogin}, 'admin', ${hash})
      RETURNING id
    `;

    for (const h of HORARIO_INICIAL) {
      await tx`
        INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
        VALUES (${tenant.id}, ${barbeiro.id}, ${h.weekday}, ${h.startTime}, ${h.endTime})
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
  };
}
