/** Retorna uma Response JSON com o status informado */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * A gravação caiu numa restrição UNIQUE específica do banco?
 *
 * O Drizzle embrulha o erro do Postgres: o código e o nome da restrição ficam na
 * causa, não no erro de fora. Olha os dois níveis.
 */
export function violouUnico(err: unknown, restricao: string): boolean {
  type ErroPg = { code?: string; constraint_name?: string; cause?: ErroPg };
  const e = err as ErroPg | undefined;
  return [e, e?.cause].some((x) => x?.code === '23505' && x?.constraint_name === restricao);
}
