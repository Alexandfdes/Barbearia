/**
 * O que o boot de produção diz do operador: o painel dele e o aviso de cadastro novo
 * (10/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.70). Funções puras — quem imprime é o
 * `scripts/startup.mjs`.
 *
 * ── POR QUE NO BOOT ──────────────────────────────────────────────────────────
 *
 * As duas faltas não dão erro em lugar nenhum. Sem o `OPERADOR_EMAIL`, o cadastro aberto cria
 * barbearia que espera a aprovação e ninguém fica sabendo — e o dono ouviu um prazo. Sem o
 * `OPERADOR_SEGUNDO_FATOR`, o painel que aprova site, suspende barbearia e mexe na cobrança abre
 * só com a senha. A tela de Sistema do operador mostra as duas; o log do deploy é onde se olha
 * quando ele termina.
 *
 * ⚠️ Nunca devolve o valor de uma variável: nem o e-mail, nem o hash, nem o segredo.
 *
 * ── AS FORMAS REPETEM AS DO APP ─────────────────────────────────────────────
 *
 * O app é TypeScript e não roda com `node` puro, então este arquivo tem as suas: a do e-mail é a de
 * `emailDoOperador` (`src/lib/avisoAoOperador.ts`), a da senha a de `lerHash` (`src/lib/operador.ts`)
 * e a do código a de `lerSegundoFator` (`src/lib/segundoFator.ts`). O `tests/operador-no-boot.test.ts`
 * passa os mesmos valores pelas duas pontas e reprova quando elas discordam — o boot dizendo
 * "✓ senha e código" com o painel fechado seria pior que não dizer nada. Mudou uma, mude a outra.
 */

/** A `FORMA_DE_EMAIL` de `src/lib/email.ts`, com o mesmo teto de 254. */
const FORMA_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** O `FORMATO` de `src/lib/operador.ts`. */
const FORMA_DA_SENHA = /^scrypt:(\d{1,2}):(\d{1,2}):(\d{1,2}):([A-Za-z0-9_-]{16,}):([A-Za-z0-9_-]{32,})$/;
/** O `FORMATO` de `src/lib/segundoFator.ts`: 26 letras de base32 já são os 16 bytes que ele pede. */
const FORMA_DO_CODIGO = /^totp:([A-Z2-7]{26,})$/;

/** O `OPERADOR_EMAIL` tem forma de e-mail? */
export function emailDoOperadorValido(env = process.env) {
  const e = (env.OPERADOR_EMAIL ?? '').trim().toLowerCase();
  return e.length > 0 && e.length <= 254 && FORMA_DE_EMAIL.test(e);
}

/** O `OPERADOR_SENHA_HASH` abre o painel? Os mesmos limites de `lerHash`. */
export function senhaDoOperadorValida(env = process.env) {
  const m = FORMA_DA_SENHA.exec(env.OPERADOR_SENHA_HASH?.trim() ?? '');
  if (!m) return false;
  const [custo, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return custo >= 14 && custo <= 20 && r >= 1 && r <= 32 && p >= 1 && p <= 4
    && Buffer.from(m[4], 'base64url').length >= 16 && Buffer.from(m[5], 'base64url').length >= 32;
}

/** O `OPERADOR_SEGUNDO_FATOR`: `'ausente'`, `'ligado'` ou `'invalido'` — este fecha o painel. */
export function estadoDoCodigo(env = process.env) {
  const limpo = env.OPERADOR_SEGUNDO_FATOR?.trim();
  if (!limpo) return 'ausente';
  return FORMA_DO_CODIGO.test(limpo) ? 'ligado' : 'invalido';
}

/**
 * O que o boot diz. `avisos`: o que falta, com título e detalhe para a caixa do log. `certos`: as
 * linhas de ✓. O painel desligado e o cadastro fechado não geram linha: são escolhas, não faltas.
 */
export function conferenciaDoOperador(env = process.env) {
  const avisos = [];
  const certos = [];

  if (env.CADASTRO_ABERTO === '1') {
    if (emailDoOperadorValido(env)) {
      certos.push('cadastro aberto: cada cadastro novo avisa o OPERADOR_EMAIL');
    } else {
      const espera = env.SITE_SEM_APROVACAO?.trim() !== '1';
      avisos.push({
        titulo: 'O CADASTRO ESTÁ ABERTO E O AVISO DE CADASTRO NOVO NÃO VAI PARA NINGUÉM',
        detalhe: (env.OPERADOR_EMAIL?.trim() ? 'O OPERADOR_EMAIL está fora da forma de e-mail.' : 'Falta o OPERADOR_EMAIL.')
          + (espera
            ? '\n  O site de quem se cadastra espera a sua aprovação, e o dono ouviu um prazo: sem o aviso,\n  você só fica sabendo abrindo o Início do operador.'
            : '\n  Sem o aviso, você só fica sabendo da barbearia nova abrindo o Início do operador.'),
      });
    }
  }

  // Sem a senha, o painel está desligado de propósito, e o código não tem o que proteger. Com ela
  // torta, ele também está — sem ninguém ter querido.
  const temSenha = Boolean(env.OPERADOR_SENHA_HASH?.trim());
  if (temSenha && !senhaDoOperadorValida(env)) {
    avisos.push({
      titulo: 'O OPERADOR_SENHA_HASH ESTÁ FORA DO FORMATO — O PAINEL DO OPERADOR NÃO ABRE',
      detalhe: 'Ele tem de ser a linha inteira de "npm run operador:senha", sem aspas.\n'
        + '  Até corrigir, /operador responde 404.',
    });
  } else if (temSenha) {
    const codigo = estadoDoCodigo(env);
    if (codigo === 'ausente') {
      avisos.push({
        titulo: 'O PAINEL DO OPERADOR ENTRA SÓ COM A SENHA',
        detalhe: 'Falta o OPERADOR_SEGUNDO_FATOR. Para pedir também o código do celular, rode\n'
          + '  npm run operador:segundo-fator e cole no Environment a linha que ele imprime.',
      });
    } else if (codigo === 'invalido') {
      avisos.push({
        titulo: 'O OPERADOR_SEGUNDO_FATOR ESTÁ FORA DO FORMATO — O PAINEL DO OPERADOR NÃO ABRE',
        detalhe: 'Ele tem de ser a linha inteira de "npm run operador:segundo-fator", sem aspas.\n'
          + '  Até corrigir, /operador responde 404.',
      });
    } else {
      certos.push('painel do operador: pede a senha e o código do celular');
    }
  }
  return { avisos, certos };
}
