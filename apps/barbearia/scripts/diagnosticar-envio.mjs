/**
 * O diagnóstico do envio do backup para fora do servidor. Rode no Console do EasyPanel:
 *
 *   node scripts/diagnosticar-envio.mjs
 *
 * ── POR QUE EXISTE (11/11/2026) ──────────────────────────────────────────────
 *
 * Desde a tarde de 10/11 o armazenamento de fora recusa o backup com `IncompleteBody` — "chegaram menos
 * bytes que os anunciados" —, até um arquivo de 12 KB, e o pedido sai daqui com o corpo inteiro
 * (conferido contra um servidor que conta os bytes). Sobram as hipóteses da rede: o tamanho de pacote no
 * caminho, ou o IPv6. Este script responde as duas num comando curto — o Console não aceita colar:
 *
 *  - as interfaces do container, com o MTU de cada uma e os endereços;
 *  - os endereços que o DNS dá ao armazenamento, IPv4 e IPv6;
 *  - envios de bytes aleatórios, do menor ao maior, com o tempo de cada um: um limite de tamanho aparece
 *    como "até X sobe, a partir de Y não"; e a recusa que demora é o armazenamento esperando bytes que
 *    não chegaram;
 *  - os que falharem, de novo com IPv4 forçado.
 *
 * Cada envio passa por `enviarParaS3` (`scripts/backup.mjs`), o mesmo do backup: diagnosticar por outro
 * caminho seria diagnosticar outra coisa. Só muda o que deixa o diagnóstico acabar em minutos: um prazo
 * para cada pedido (o backup não tem) e uma tentativa só (o SDK repete sozinho o pedido que estoura o prazo). Os arquivos de teste vão para `backups/diagnostico-<hora>-<bytes>.bin`, e
 * a regra de 30 dias do prefixo `backups/` os apaga. Nada aqui mexe nos registros do envio
 * (`envio-para-fora.ok` e `.falhou`): a tela de Sistema e o aviso por e-mail continuam dizendo o que o
 * backup de verdade fez. Nenhuma credencial sai na tela: do armazenamento, só o nome do endereço.
 */
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Agent as AgenteHttp } from 'node:http';
import { Agent as AgenteHttps } from 'node:https';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { detalheDaFalha, enviarParaS3 } from './backup.mjs';

/** Do menor ao maior: abaixo e acima de um pacote (uns 1.400 bytes de corpo, com os cabeçalhos) e o tamanho do backup. */
export const TAMANHOS = [16, 600, 1200, 1400, 1600, 3000, 12_000];
/** Quanto cada pedido espera sem resposta: o bastante para ver o armazenamento desistir, e o diagnóstico acabar. */
export const PRAZO_DE_CADA_ENVIO_MS = 30_000;
/** Recusa que leva isto ou mais é espera: o armazenamento aguardou bytes que não chegaram. */
export const RECUSA_DEMORADA_MS = 5_000;
/** Quantos dos que falharam vão de novo com IPv4 forçado — os menores. */
const DE_NOVO_COM_IPV4 = 3;

/** As interfaces do container, menos a local: o nome, o MTU (de `/sys/class/net`) e os endereços. */
export function interfacesDeRede(lerMtu = (nome) => readFileSync(`/sys/class/net/${nome}/mtu`, 'utf8')) {
  return Object.entries(networkInterfaces())
    .filter(([, enderecos]) => !(enderecos ?? []).every((e) => e.internal))
    .map(([nome, enderecos]) => {
      let mtu = null;
      try { mtu = Number.parseInt(String(lerMtu(nome)).trim(), 10) || null; } catch { /* fora do Linux, sem /sys */ }
      return { nome, mtu, enderecos: (enderecos ?? []).map((e) => e.address) };
    });
}

/** O nome do endereço do armazenamento — sem esquema, porta ou caminho. */
export function nomeDoArmazenamento(endpoint) {
  try {
    return new URL(/^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`).hostname;
  } catch {
    return '';
  }
}

const segundos = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/** Uma linha por envio: o tamanho, se subiu, o motivo e o tempo. */
export function linhaDoEnvio(e) {
  const tamanho = `${e.bytes} bytes`.padEnd(13, ' ');
  return e.ok ? `  ${tamanho} ✓ ${segundos(e.ms)}` : `  ${tamanho} ✕ ${segundos(e.ms)} — ${e.motivo}`;
}

/**
 * O que os envios dizem, em frases. `envios`: a primeira rodada, com o que o Node escolher; `comIpv4`: os
 * que falharam, de novo com IPv4 forçado. É leitura, não prova — cada frase diz de onde vem.
 */
export function leituraDoDiagnostico(envios, comIpv4 = []) {
  const subiram = envios.filter((e) => e.ok);
  const falharam = envios.filter((e) => !e.ok);
  if (falharam.length === 0) {
    return ['Todos subiram: o envio funciona agora. Rode `node scripts/backup.mjs` para o backup de verdade subir.'];
  }
  const linhas = [];
  if (subiram.length === 0) {
    linhas.push(`Nenhum subiu, nem o de ${Math.min(...envios.map((e) => e.bytes))} bytes: não é o tamanho do pacote. `
      + 'Mande ao suporte do armazenamento os números dos pedidos acima, com a hora deste diagnóstico.');
  } else {
    const maiorQueSubiu = Math.max(...subiram.map((e) => e.bytes));
    const menorQueFalhou = Math.min(...falharam.map((e) => e.bytes));
    linhas.push(maiorQueSubiu < menorQueFalhou
      ? `Até ${maiorQueSubiu} bytes sobe; a partir de ${menorQueFalhou}, não: aponta para o tamanho do pacote no caminho `
        + '(MTU) — o conserto seria na rede do servidor, não no código.'
      : 'Uns sobem e outros não, sem um limite de tamanho: a recusa vai e volta. Rode de novo para ver se o padrão se repete.');
  }
  const demoradas = falharam.filter((e) => e.ms >= RECUSA_DEMORADA_MS);
  if (demoradas.length === falharam.length) {
    linhas.push(`As recusas demoraram (${segundos(Math.min(...falharam.map((e) => e.ms)))} ou mais): o armazenamento `
      + 'esperou bytes que não chegaram — aponta para pacotes perdidos no caminho.');
  } else if (demoradas.length === 0) {
    linhas.push('As recusas vieram na hora: o armazenamento recusou o que recebeu, sem esperar.');
  }
  if (comIpv4.length > 0) {
    const subiramComIpv4 = comIpv4.filter((e) => e.ok).length;
    linhas.push(subiramComIpv4 === comIpv4.length
      ? 'Com IPv4 forçado, os que tinham falhado subiram: aponta para o caminho do IPv6 — o conserto é `S3_SO_IPV4=1` '
        + 'no Environment do app, e depois `node scripts/backup.mjs` para conferir.'
      : subiramComIpv4 === 0
        ? 'Com IPv4 forçado, falharam igual: não é o IPv6.'
        : 'Com IPv4 forçado, uns subiram e outros não: rode de novo para ver se o padrão se repete.');
  }
  return linhas;
}

/**
 * As opções do cliente do diagnóstico, passadas ao `clienteDoS3` do backup: um prazo para cada pedido e uma
 * tentativa só — as novas tentativas do SDK, num pedido que espera, esconderiam o tempo de cada um. Com `ipv4`,
 * as conexões só por IPv4.
 *
 * ⚠️ No SDK desta versão, `requestTimeout` sozinho só escreve um aviso no log quando estoura: é o
 * `throwOnRequestTimeout` que o faz desistir do pedido. O `socketTimeout` é o prazo sem nada chegar.
 */
export function clienteDoDiagnostico(prazoMs, { ipv4 = false } = {}) {
  const requestHandler = {
    requestTimeout: prazoMs, throwOnRequestTimeout: true, socketTimeout: prazoMs, connectionTimeout: Math.min(prazoMs, 10_000),
  };
  if (ipv4) {
    requestHandler.httpAgent = new AgenteHttp({ family: 4, keepAlive: false });
    requestHandler.httpsAgent = new AgenteHttps({ family: 4, keepAlive: false });
  }
  return { requestHandler, maxAttempts: 1 };
}

/** Um envio de teste: `bytes` aleatórios num arquivo de `pasta`, pelo `enviarParaS3` do backup. */
async function enviarDeTeste(bytes, { env, pasta, rotulo, cliente }) {
  const caminho = join(pasta, `diagnostico-${rotulo}-${bytes}.bin`);
  writeFileSync(caminho, randomBytes(bytes));
  const inicio = performance.now();
  try {
    await enviarParaS3(caminho, { env, cliente });
    return { bytes, ok: true, ms: Math.round(performance.now() - inicio) };
  } catch (erro) {
    const detalhe = detalheDaFalha(erro);
    return {
      bytes, ok: false, ms: Math.round(performance.now() - inicio),
      motivo: `${erro?.message || String(erro)}${detalhe ? ` [${detalhe}]` : ''}`,
    };
  }
}

/**
 * Roda o diagnóstico e escreve, linha a linha, em `escrever`. Devolve o que mediu, ou `null` sem as `S3_*`.
 * `tamanhos`, `prazoMs` e `agora` existem para o teste.
 */
export async function diagnosticarEnvio({
  env = process.env, escrever = (linha) => console.log(linha), tamanhos = TAMANHOS,
  prazoMs = PRAZO_DE_CADA_ENVIO_MS, agora = new Date(),
} = {}) {
  if (!env.S3_ENDPOINT?.trim() || !env.S3_BUCKET?.trim() || !env.S3_ACCESS_KEY_ID?.trim() || !env.S3_SECRET_ACCESS_KEY?.trim()) {
    escrever('Sem as quatro S3_* no ambiente: não há envio para fora para diagnosticar.');
    return null;
  }
  const host = nomeDoArmazenamento(env.S3_ENDPOINT);
  const rotulo = agora.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  escrever(`Diagnóstico do envio para fora — ${agora.toISOString()} (UTC) — Node ${process.version}`);
  escrever(`O backup de verdade conecta ${env.S3_SO_IPV4?.trim() === '1' ? 'só por IPv4 (S3_SO_IPV4=1)' : 'pelo caminho que o Node escolher (sem S3_SO_IPV4)'}; `
    + 'o diagnóstico mede os dois caminhos.');
  escrever('Leva de segundos a uns 5 minutos: cada envio que falhar pode esperar até '
    + `${segundos(prazoMs)}. Deixe o Console aberto até a "Leitura".`);

  escrever('');
  escrever('A rede deste container:');
  const interfaces = interfacesDeRede();
  for (const i of interfaces) escrever(`  ${i.nome}: MTU ${i.mtu ?? '?'} — ${i.enderecos.join(', ') || 'sem endereço'}`);
  if (interfaces.length === 0) escrever('  (nenhuma interface além da local)');

  escrever('');
  escrever(`O armazenamento, ${host || '(endereço ilegível)'}:`);
  let ips = [];
  try {
    ips = await lookup(host, { all: true });
    for (const ip of ips) escrever(`  IPv${ip.family}: ${ip.address}`);
  } catch (erro) {
    escrever(`  o DNS não respondeu: ${erro?.message || erro}`);
  }

  const pasta = mkdtempSync(join(tmpdir(), 'diagnostico-do-envio-'));
  const envios = [];
  const comIpv4 = [];
  try {
    escrever('');
    escrever(`Envios de bytes aleatórios, para backups/diagnostico-${rotulo}-<bytes>.bin:`);
    for (const bytes of tamanhos) {
      const e = await enviarDeTeste(bytes, { env, pasta, rotulo, cliente: clienteDoDiagnostico(prazoMs) });
      envios.push(e);
      escrever(linhaDoEnvio(e));
    }
    const deNovo = envios.filter((e) => !e.ok).slice(0, DE_NOVO_COM_IPV4);
    if (deNovo.length > 0) {
      escrever('');
      escrever('Os que falharam, de novo com IPv4 forçado:');
      for (const { bytes } of deNovo) {
        const cliente = clienteDoDiagnostico(prazoMs, { ipv4: true });
        const e = await enviarDeTeste(bytes, { env, pasta, rotulo: `${rotulo}-ipv4`, cliente });
        comIpv4.push(e);
        escrever(linhaDoEnvio(e));
      }
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }

  escrever('');
  escrever('Leitura:');
  for (const linha of leituraDoDiagnostico(envios, comIpv4)) escrever(`  ${linha}`);
  return { interfaces, ips, envios, comIpv4 };
}

// Execução direta via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  diagnosticarEnvio().then(
    () => process.exit(0),
    (erro) => { console.error('✕ O diagnóstico não terminou:', erro?.message || erro); process.exit(1); },
  );
}
