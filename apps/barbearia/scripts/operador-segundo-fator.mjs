/**
 * Liga o segundo fator do painel do operador — o código de 6 dígitos de um aplicativo
 * no celular (`src/lib/segundoFator.ts`).
 *
 * Uso — na SUA máquina, nunca no servidor:
 *
 *   npm run operador:segundo-fator
 *
 *   1. Gera um segredo novo.
 *   2. Mostra o QR code para o aplicativo (Google Authenticator, Microsoft
 *      Authenticator, 1Password…) — e a chave, para digitar à mão se o celular não ler.
 *   3. Pede o código que o aplicativo passou a mostrar, e só segue se ele conferir: QR
 *      lido errado não vira variável no servidor.
 *   4. Imprime UMA linha:  OPERADOR_SEGUNDO_FATOR=totp:...
 *
 * Cole essa linha nas variáveis do serviço no EasyPanel (Environment), salve e reinicie
 * o app. Daí em diante, a tela do operador pede a senha E o código. Trocar a variável,
 * ou tirá-la, derruba toda sessão de operador aberta.
 *
 * ⚠️ O segredo é o que o aplicativo guarda: quem o tiver gera os códigos. Ele aparece
 *    aqui uma vez — não mande por WhatsApp, não salve em arquivo. A variável no
 *    EasyPanel é o único outro lugar onde ele mora.
 * ⚠️ Perdeu o celular? Rode de novo e troque a variável: o segredo antigo para de valer.
 *    É o EasyPanel que devolve a entrada — sem ele, o painel do operador fica fechado.
 * ⚠️ Variável fora do formato desliga o painel do operador (404), em vez de deixá-lo
 *    só com a senha: cole a linha inteira, como sai daqui.
 *
 * A conta do código é a de `scripts/totp.mjs`, a mesma de `src/lib/segundoFator.ts`;
 * o QR, a de `scripts/qr.mjs`. `tests/segundo-fator.test.ts` roda este script.
 *
 * Sem terminal (o código chegando por pipe), lê as linhas da entrada: é como o teste roda.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { matrizQr, qrNoTerminal } from './qr.mjs';
import { codigoConfere, paraBase32, segredoNovo } from './totp.mjs';

/** O nome que o aplicativo mostra: o do produto, da constante de sempre. */
function nomeDoProduto() {
  try {
    const texto = readFileSync(new URL('../src/lib/produto.ts', import.meta.url), 'utf8');
    return texto.match(/export const NOME_PRODUTO = '([^']+)'/)?.[1] ?? 'Operador';
  } catch {
    return 'Operador';
  }
}

const err = process.stderr;
const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const nome = nomeDoProduto();
const segredo = segredoNovo();
const chave = paraBase32(segredo);
const endereco = `otpauth://totp/${encodeURIComponent(nome)}:operador?secret=${chave}&issuer=${encodeURIComponent(nome)}`;

err.write(`\nSegundo fator do painel do operador — ${nome}\n\n`);
err.write('1. No celular, abra o aplicativo de código (Google Authenticator, Microsoft\n');
err.write('   Authenticator, 1Password…), toque em adicionar e leia este QR code:\n\n');
err.write(`${qrNoTerminal(matrizQr(endereco), terminal)}\n\n`);
err.write('   O celular não leu? No aplicativo, escolha "inserir chave" e digite:\n');
err.write(`     nome: ${nome} — operador\n`);
err.write(`     chave: ${chave.match(/.{1,4}/g).join(' ')}   (sem os espaços, se o aplicativo reclamar)\n`);
err.write('     tipo: baseada em horário\n\n');

const leitor = createInterface({ input: process.stdin, output: err, terminal: false });
const linhas = leitor[Symbol.asyncIterator]();

async function perguntar(pergunta) {
  err.write(pergunta);
  const { value, done } = await linhas.next();
  return done ? null : value;
}

for (let tentativa = 1; tentativa <= 3; tentativa++) {
  const codigo = await perguntar('2. Digite o código de 6 dígitos que o aplicativo mostra agora: ');
  if (codigo === null) break;
  if (codigoConfere(codigo, segredo)) {
    leitor.close();
    err.write('\n✓ O código confere: o aplicativo ficou certo.\n\n');
    err.write('3. Cole a linha abaixo nas variáveis do app no EasyPanel, salve e reinicie.\n');
    err.write('   A partir daí, a tela do operador pede a senha e o código.\n\n');
    process.stdout.write(`OPERADOR_SEGUNDO_FATOR=totp:${chave}\n`);
    process.exit(0);
  }
  err.write(tentativa < 3
    ? '   Não confere. Espere o próximo código aparecer no aplicativo e tente de novo.\n'
    : '');
}
leitor.close();
err.write('\n✗ O código não conferiu. Nada foi gerado para o servidor — rode de novo e leia o QR outra vez.\n');
err.write('  Se o código continuar errado, confira se a hora do celular está automática.\n');
process.exit(1);
