/**
 * Troca o fuso de UMA barbearia — o campo "Fuso horário" de Configurações.
 *
 * O fuso mora em `tenants.timezone` (migration 0013), e o papel do app só LÊ
 * `tenants` (0003): é a tabela do roteamento, sem RLS, e um UPDATE por ali
 * alcançaria qualquer barbearia. Por isso esta escrita vai pela conexão do dono
 * do banco — e este arquivo faz SÓ ela, com o `WHERE` na barbearia da sessão,
 * que quem chama tirou do resolvedor, nunca do corpo da requisição.
 *
 * É o mesmo caminho do cancelamento da assinatura, que também grava em `tenants`
 * de dentro de uma requisição do painel (`cancelarAssinatura`, `lib/cobranca.ts`).
 *
 * Está na lista fechada de quem usa a conexão do dono (`tests/rls.test.ts`), com
 * esse motivo. Rejeitado: o fuso em `settings`, que o painel já grava pelo papel
 * do app — mas aí o cache de barbearias, lido dentro de uma requisição, veria só
 * o fuso da própria, e as outras ficariam com o padrão, erradas e caladas
 * (o cabeçalho da 0013).
 */
import { sqlConn } from '../db/index.js';
import { ehFusoDoBrasil } from './timezone.js';
import { invalidarTenants } from './tenant.js';

/** Grava o fuso e descarta o cache: a agenda passa a usar o novo na hora. */
export async function definirFusoDaBarbearia(tenantId: number, fuso: string): Promise<void> {
  // O banco também recusa (o CHECK da 0013); conferir aqui dá a mensagem certa.
  if (!ehFusoDoBrasil(fuso)) throw new Error(`"${fuso}" não é um dos fusos do Brasil.`);
  await sqlConn`UPDATE tenants SET timezone = ${fuso} WHERE id = ${tenantId}`;
  invalidarTenants();
}
