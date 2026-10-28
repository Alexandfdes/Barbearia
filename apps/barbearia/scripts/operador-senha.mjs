/**
 * Gera o hash da senha do painel do operador (`/operador`, `src/lib/operador.ts`).
 *
 * Uso — na SUA máquina, nunca no servidor:
 *
 *   npm run operador:senha
 *
 * Ele pede a senha duas vezes, sem mostrar o que você digita, e imprime UMA linha:
 *
 *   OPERADOR_SENHA_HASH=scrypt:15:8:1:...
 *
 * Cole essa linha nas variáveis do serviço no EasyPanel (Environment) e, se quiser
 * o painel no desenvolvimento, no `apps/barbearia/.env`. Depois, reinicie o app.
 *
 * ⚠️ O que vai para o servidor é o HASH, nunca a senha. A senha fica só com você.
 * ⚠️ Sem o segundo fator ligado (`npm run operador:segundo-fator`, desde 13/10/2026),
 *    a senha é a única coisa entre quem a descobrir e o poder de tirar qualquer
 *    barbearia do ar. Com ou sem ele, use uma frase de quatro ou cinco palavras que não
 *    esteja em lugar nenhum — o mínimo aceito é 9 caracteres (era 12 até 26/10/2026,
 *    baixado por decisão do dono), e o mínimo não é o recomendado.
 * ⚠️ Trocar o hash derruba toda sessão de operador aberta. É assim que se tira de
 *    dentro quem soube a senha velha.
 *
 * A conta é a MESMA de `src/lib/operador.ts` (scrypt, N = 2^15, r = 8, p = 1, chave
 * de 32 bytes, senha em NFC) — `tests/operador.test.ts` confere que o hash daqui é
 * aceito lá. Mudou uma, mude a outra.
 *
 * Sem terminal (a senha chegando por pipe), lê a primeira linha da entrada: é como
 * o teste roda este script.
 */
import { scrypt, randomBytes } from 'node:crypto';

const SENHA_MINIMA = 9;
const CUSTO = 15;
const R = 8;
const P = 1;

/** Lê uma linha do terminal sem ecoar o que é digitado. */
function senhaEscondida(pergunta) {
  return new Promise((ok) => {
    const entrada = process.stdin;
    process.stderr.write(pergunta);
    entrada.setRawMode(true);
    entrada.setEncoding('utf8');
    entrada.resume();
    let senha = '';
    const fim = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.off('data', aoDigitar);
      process.stderr.write('\n');
    };
    function aoDigitar(pedaco) {
      // Seta, F1 e companhia chegam como sequência de escape: não são senha.
      if (pedaco.startsWith('\u001b')) return;
      for (const c of pedaco) {
        if (c === '\r' || c === '\n' || c === '\u0004') { fim(); ok(senha); return; }
        if (c === '\u0003') { fim(); process.exit(130); }
        if (c === '\u007f' || c === '\b') { senha = [...senha].slice(0, -1).join(''); continue; }
        if (c >= ' ') senha += c;
      }
    }
    entrada.on('data', aoDigitar);
  });
}

/** Sem terminal: a primeira linha da entrada. */
async function primeiraLinha() {
  let tudo = '';
  for await (const pedaco of process.stdin) tudo += pedaco;
  return tudo.split(/\r?\n/)[0] ?? '';
}

function derivar(senha, sal) {
  return new Promise((ok, falha) => {
    scrypt(senha.normalize('NFC'), sal, 32, { N: 2 ** CUSTO, r: R, p: P, maxmem: 256 * 1024 * 1024 },
      (erro, chave) => (erro ? falha(erro) : ok(chave)));
  });
}

let senha;
if (process.stdin.isTTY) {
  senha = await senhaEscondida('Senha do operador: ');
  const repetida = await senhaEscondida('Repita a senha: ');
  if (senha !== repetida) {
    console.error('As duas não conferem. Nada foi gerado.');
    process.exit(1);
  }
} else {
  process.stdin.setEncoding('utf8');
  senha = await primeiraLinha();
}

if ([...senha].length < SENHA_MINIMA) {
  console.error(`A senha precisa ter ao menos ${SENHA_MINIMA} caracteres — e sem segundo fator, mais é melhor. Nada foi gerado.`);
  process.exit(1);
}

const sal = randomBytes(16);
const chave = await derivar(senha, sal);
// A explicação vai para o stderr; no stdout, só a linha de colar.
process.stderr.write('\nCole esta linha nas variáveis do serviço (EasyPanel → Environment) e reinicie o app:\n\n');
process.stdout.write(`OPERADOR_SENHA_HASH=scrypt:${CUSTO}:${R}:${P}:${sal.toString('base64url')}:${chave.toString('base64url')}\n`);
