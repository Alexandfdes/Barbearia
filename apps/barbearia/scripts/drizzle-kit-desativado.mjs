/**
 * `db:generate` e `db:push` foram desligados de propósito.
 *
 * As migrations deste projeto são arquivos `.sql` escritos à mão, aplicados por
 * `scripts/startup.mjs`, que confere o hash de cada uma. O `drizzle-kit` não
 * participa mais disso e não tem como participar: a 0001 recompõe 16 chaves
 * estrangeiras dentro de um bloco `DO $$`, e gerador de schema não escreve isso.
 *
 * Por que não deixar os comandos quietos no package.json:
 *
 * - `db:push` compara o `schema.ts` com o banco e **aplica o ALTER na hora**,
 *   sem migration, sem revisão e sem registro. Contra o banco de uma barbearia
 *   em produção isso é uma mudança de schema que ninguém escreveu e ninguém
 *   pode reler depois.
 * - `db:generate` escreveria em `drizzle/` uma migration numerada pelo Drizzle,
 *   com o journal que este projeto apagou — misturada com as escritas à mão,
 *   fora da numeração, aplicada em ordem errada.
 *
 * Um comando que ainda existe no `package.json` vai ser rodado um dia, nem que
 * seja por autocompletar. Ele existe, então, para recusar.
 */
console.error(`
  ✋ Este comando está desligado neste projeto.

  As migrations são arquivos .sql escritos à mão em drizzle/, aplicadas por
  scripts/startup.mjs (que confere o hash de cada uma).

  Para aplicar as migrations:      npm run db:migrate
  Para criar uma barbearia nova:   npm run db:provisionar -- --nome "..." --slug ...
  Para escrever uma migration:     crie drizzle/000N_nome.sql à mão

  Motivo: db:push altera o schema do banco na hora, sem migration e sem
  revisão. Num banco de cliente isso é uma mudança que ninguém escreveu.
`);
process.exit(1);
