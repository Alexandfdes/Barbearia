/**
 * O que está errado no `SMTP_URL` — sem nunca devolver o valor, que tem a chave do provedor.
 *
 * Por que existe (03/11/2026): o boot dizia "✓ e-mail: SMTP configurado" só porque a variável
 * existia. Na primeira configuração de produção, o valor tinha sobra do modelo e, depois, o
 * servidor digitado errado (`brv.com`); o boot disse "configurado" nas duas vezes, e o erro só
 * apareceu no log do primeiro envio, como "Invalid URL" e "ENOTFOUND" — gastando os pedidos de
 * confirmação do dia até achar a causa.
 *
 * As regras saíram de testar o leitor do próprio `nodemailer` (10.1.7): ele recusa `<`, `>` e
 * espaço perto do servidor, e `/`, `#` ou `?` na chave cortam o endereço no lugar errado.
 * Aspas e a falta do `smtp://` ele aceita calado — e o envio vai para lugar nenhum.
 *
 * Devolve `null` quando o formato está certo. Formato certo não prova login certo: quem prova é
 * o `verify` do boot (`scripts/startup.mjs`).
 */
export function problemaNoSmtpUrl(bruto) {
  const valor = (bruto ?? '').trim();
  if (!valor) return 'está vazio.';
  if (/[<>]/.test(valor)) return 'tem "<" ou ">" — sobra do modelo. O valor não leva esses sinais.';
  if (/["']/.test(valor)) return 'tem aspas. O valor vai sem aspas.';
  if (/\s/.test(valor)) return 'tem espaço ou quebra de linha no meio.';
  if (!/^smtps?:\/\//i.test(valor)) return 'não começa com smtps:// (porta 465) ou smtp:// (porta 587).';

  let url;
  try {
    url = new URL(valor);
  } catch {
    return 'não é um endereço que dê para ler. Se a chave tem "/", "#" ou "?", escreva %2F, %23 ou %3F no lugar.';
  }
  if (url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    return 'a chave (ou o login) tem "/", "#" ou "?", que cortam o endereço. Escreva %2F, %23 ou %3F no lugar.';
  }
  if (!url.username || !url.password) {
    return 'falta o login ou a chave. O formato é smtps://LOGIN:CHAVE@SERVIDOR:465, com o "@" do login escrito %40.';
  }
  if (!url.hostname.includes('.')) {
    return `o servidor "${url.hostname}" não parece um endereço (ex.: smtp-relay.brevo.com).`;
  }
  return null;
}

/** O servidor do `SMTP_URL`, para o log — nome público, sem login nem chave. `null` se não der para ler. */
export function servidorDoSmtpUrl(bruto) {
  try {
    const url = new URL((bruto ?? '').trim());
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return null;
  }
}

/** A mensagem de erro do provedor sem o login e a chave, se por acaso vierem nela. */
export function semSegredo(mensagem, bruto) {
  let texto = String(mensagem ?? '');
  try {
    const url = new URL((bruto ?? '').trim());
    for (const pedaco of [url.password, decodeURIComponent(url.password), url.username, decodeURIComponent(url.username)]) {
      if (pedaco && pedaco.length >= 4) texto = texto.split(pedaco).join('***');
    }
  } catch { /* sem URL legível, não há o que tirar */ }
  return texto;
}
