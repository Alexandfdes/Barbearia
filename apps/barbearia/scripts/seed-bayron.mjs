/**
 * Seed dos dados DO BAYRON — barbeiros, catálogo, vínculos e horários.
 *
 * ⚠️ Isto NÃO é o seed de um cliente novo. Os três barbeiros e os 20 serviços
 * abaixo são da Barbearia Bayron, com os preços dela. Rodar isto num banco de
 * outra barbearia planta a equipe e o cardápio de terceiros — a mesma doença que
 * `PENDENCIAS-ABERTAS.md` §4.6 descreve nas migrations.
 *
 * Para criar uma barbearia nova use `scripts/provisionar.mts`.
 *
 * Serve para: recriar ambiente de desenvolvimento e refazer a instância do
 * Bayron do zero.
 *
 * Uso:
 *   DATABASE_URL=... ADMIN_INITIAL_PASSWORD=... BARBER_INITIAL_PASSWORD=... \
 *     node scripts/seed-bayron.mjs
 *
 * Idempotente: não insere se já houver barbeiro no tenant do Bayron.
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;
const BARBER_PASSWORD = process.env.BARBER_INITIAL_PASSWORD;

if (!url) {
  console.error('ERRO: DATABASE_URL não definido.');
  process.exit(1);
}

// Senhas são obrigatórias via env — sem fallback cravado no código.
const PLACEHOLDERS = ['bayron@2025', 'barber@2025', 'changeme', 'password', 'senha'];
for (const [name, value] of [
  ['ADMIN_INITIAL_PASSWORD', ADMIN_PASSWORD],
  ['BARBER_INITIAL_PASSWORD', BARBER_PASSWORD],
]) {
  if (!value) {
    console.error(`ERRO: variável de ambiente ${name} não definida.`);
    process.exit(1);
  }
  if (value.length < 8) {
    console.error(`ERRO: ${name} muito curta (mínimo 8 caracteres).`);
    process.exit(1);
  }
  if (PLACEHOLDERS.includes(value.toLowerCase())) {
    console.error(`ERRO: ${name} usa um valor placeholder conhecido. Escolha uma senha real.`);
    process.exit(1);
  }
}

const barberRows = [
  { name: 'Bayron Patrezio',   slug: 'bayron',   role: 'admin'  },
  { name: 'Emanuel Brilhante', slug: 'emanuel',  role: 'barber' },
  { name: 'Jackson Viana',     slug: 'jackson',  role: 'barber' },
];

const servicesList = [
  // Cortes individuais
  { name: 'Corte Social',            slug: 'corte-social',             priceCents: 4000,  duration: 40  },
  { name: 'Corte Degradê',           slug: 'corte-degrade',            priceCents: 4500,  duration: 40  },
  { name: 'Corte Navalhado',         slug: 'corte-navalhado',          priceCents: 4500,  duration: 40  },
  { name: 'Só Tesoura',              slug: 'so-tesoura',               priceCents: 4000,  duration: 40  },
  { name: '1º Corte Baby',           slug: 'primeiro-corte-baby',      priceCents: 4000,  duration: 40  },
  // Barba
  { name: 'Barba Simples',           slug: 'barba-simples',            priceCents: 3000,  duration: 30  },
  { name: 'Barba e Pezinho',         slug: 'barba-pezinho',            priceCents: 3500,  duration: 30  },
  { name: 'Barba + Pigmentação',     slug: 'barba-pigmentacao',        priceCents: 4500,  duration: 45  },
  // Adicionais
  { name: 'Alisamento',              slug: 'alisamento',               priceCents: 7000,  duration: 60  },
  { name: 'Degradê + Alisamento',    slug: 'degrade-alisamento',       priceCents: 10000, duration: 90  },
  { name: 'Degradê, Barba e Alis.',  slug: 'degrade-barba-alisamento', priceCents: 13000, duration: 120 },
  { name: 'Hidratação',              slug: 'hidratacao',               priceCents: 1500,  duration: 20  },
  { name: 'Limpeza contra caspa',    slug: 'limpeza-caspa',            priceCents: 1000,  duration: 20  },
  { name: 'Depilação Nasal',         slug: 'depilacao-nasal',          priceCents: 1000,  duration: 10  },
  { name: 'Sobrancelha Navalha',     slug: 'sobrancelha-navalha',      priceCents: 1000,  duration: 10  },
  // Combos
  { name: 'Navalhado + Barba',               slug: 'navalhado-barba',           priceCents: 6500, duration: 60 },
  { name: 'Social + Barba',                  slug: 'social-barba',              priceCents: 6000, duration: 60 },
  { name: 'Degradê + Barba',                 slug: 'degrade-barba',             priceCents: 6500, duration: 60 },
  { name: 'Degradê + Barba + Hidratação',    slug: 'degrade-barba-hidratacao',  priceCents: 7500, duration: 75 },
  { name: 'Navalhado + Pigmentação',         slug: 'navalhado-pigmentacao',     priceCents: 6000, duration: 45 },
];

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  // O tenant tem que existir. A migration 0001 só o cria quando encontra dados
  // antigos para backfillar, então num banco novo ele não está lá.
  const [tenant] = await sql`SELECT id FROM tenants WHERE slug = 'bayron'`;
  if (!tenant) {
    console.error("ERRO: não existe o tenant 'bayron' neste banco.");
    console.error('Crie-o antes:');
    console.error("  psql \"$DATABASE_URL\" -c \"INSERT INTO tenants (slug, business_name) VALUES ('bayron','Barbearia Bayron')\"");
    process.exit(1);
  }
  const tid = tenant.id;

  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM barbers WHERE tenant_id = ${tid}`;
  if (c > 0) {
    console.log('Tenant do Bayron já semeado, pulando...');
    process.exit(0);
  }

  console.log('Gerando hashes de senha (bcrypt cost 12)...');
  const hashes = {
    admin:  bcrypt.hashSync(ADMIN_PASSWORD, 12),
    barber: bcrypt.hashSync(BARBER_PASSWORD, 12),
  };

  // Tudo ou nada: seed parcial deixa o tenant num estado que o próprio script
  // considera "já semeado" na próxima execução, e aí ninguém completa o resto.
  const contagem = await sql.begin(async (tx) => {
    const barbeiros = [];
    for (const b of barberRows) {
      const [linha] = await tx`
        INSERT INTO barbers (tenant_id, name, slug, role, password_hash)
        VALUES (${tid}, ${b.name}, ${b.slug}, ${b.role}, ${hashes[b.role]})
        RETURNING id, slug
      `;
      barbeiros.push(linha);
    }

    const idPorSlug = {};
    for (const s of servicesList) {
      const [linha] = await tx`
        INSERT INTO services (tenant_id, name, slug, price_cents)
        VALUES (${tid}, ${s.name}, ${s.slug}, ${s.priceCents})
        RETURNING id
      `;
      idPorSlug[s.slug] = linha.id;
    }

    let bs = 0;
    for (const b of barbeiros) {
      for (const s of servicesList) {
        await tx`
          INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes)
          VALUES (${tid}, ${b.id}, ${idPorSlug[s.slug]}, ${s.duration})
        `;
        bs++;
      }
    }

    // seg (1)–sex (5): 09:00–20:00 | sáb (6): 09:00–18:00 | dom (0): fechado
    let wh = 0;
    for (const b of barbeiros) {
      for (const [dia, ini, fim] of [[1,'09:00','20:00'],[2,'09:00','20:00'],[3,'09:00','20:00'],
                                     [4,'09:00','20:00'],[5,'09:00','20:00'],[6,'09:00','18:00']]) {
        await tx`
          INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
          VALUES (${tid}, ${b.id}, ${dia}, ${ini}, ${fim})
        `;
        wh++;
      }
    }

    return { barbeiros: barbeiros.length, servicos: servicesList.length, bs, wh };
  });

  console.log(`✓ ${contagem.barbeiros} barbeiros, ${contagem.servicos} serviços, ` +
              `${contagem.bs} vínculos e ${contagem.wh} horários inseridos no tenant do Bayron.`);
  console.log('Senhas vieram de ADMIN_INITIAL_PASSWORD e BARBER_INITIAL_PASSWORD (não exibidas).');
  console.log('Altere as senhas após o primeiro login.');
} catch (erro) {
  console.error('✕ Seed falhou (nada foi gravado):', erro.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
