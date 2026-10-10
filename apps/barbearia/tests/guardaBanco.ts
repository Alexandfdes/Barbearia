/**
 * Impede que a suíte rode contra um banco que não seja de teste.
 *
 * ⚠️ POR QUE ISTO EXISTE
 *
 * `tenants-schema`, `settings` e `bookAppointment` começam com
 * `DROP SCHEMA public CASCADE`. É o certo para um banco de teste — cada arquivo
 * monta o schema do zero e não depende do estado deixado pelo anterior.
 *
 * Só que `DATABASE_URL` é uma variável de ambiente. Um `$env:DATABASE_URL` que
 * sobrou da sessão anterior, um `.env` apontando para produção, um copiar e colar
 * do endereço errado — e a suíte apaga o banco da barbearia inteiro: agendamentos,
 * clientes, histórico. Sem confirmação, sem pergunta, em 200 milissegundos.
 *
 * Não existe desfazer. O backup de ontem não devolve o agendamento de hoje.
 *
 * Por isso o nome do banco precisa dizer, na cara, que é descartável.
 */

/** Sufixos que marcam um banco como descartável. */
const PERMITIDOS = /(_test|_teste|_tests)$/i;

export function exigirBancoDeTeste(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL não definido.');
  }

  let nome: string;
  try {
    // O nome do banco é o caminho da URL, sem a barra inicial.
    nome = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`DATABASE_URL não é uma URL válida: ${url}`);
  }

  if (!nome) {
    throw new Error('DATABASE_URL não nomeia um banco de dados.');
  }

  if (!PERMITIDOS.test(nome)) {
    throw new Error(
      `\n\n  RECUSANDO RODAR: o banco "${nome}" não parece de teste.\n\n` +
      `  Esta suíte roda DROP SCHEMA public CASCADE. Se "${nome}" for o banco de\n` +
      `  uma barbearia de verdade, tudo dentro dele some — e não volta.\n\n` +
      `  Use um banco cujo nome termine em _test:\n\n` +
      `      createdb barbearia_test\n` +
      `      DATABASE_URL='postgres://.../barbearia_test' npx vitest run\n`
    );
  }

  return nome;
}
