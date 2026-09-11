/**
 * Avisa, na cara, quando a suíte rodou só pela metade.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * Sem `DATABASE_URL`, 84 dos 212 casos são PULADOS: login, agendamento,
 * settings, tenants, RLS, a carga da migração e o backup das fotos. O vitest
 * escreve "84 skipped" no meio de vinte linhas verdes, e ninguém lê.
 *
 * O resultado é o pior tipo de verde: o que autoriza o commit sem ter olhado a
 * parte que mexe com dado de cliente. Este aviso existe para essa linha não
 * passar despercebida.
 */
export function setup() {
  if (process.env.DATABASE_URL) return;

  console.log(`
  ┌────────────────────────────────────────────────────────────────────┐
  │  ⚠️  SEM BANCO: os casos que precisam de Postgres serão PULADOS     │
  ├────────────────────────────────────────────────────────────────────┤
  │  Ficam de fora login, agendamento, settings, tenants, RLS, a carga │
  │  da migração e o backup das fotos — a parte que mexe com dado de   │
  │  cliente.                                                          │
  │                                                                    │
  │  Para rodar a suíte inteira:   npm run test:db                     │
  └────────────────────────────────────────────────────────────────────┘
`);
}
