/**
 * Backup do Postgres via `pg_dump`.
 *
 * Uso: node scripts/backup.mjs
 * Env: DATABASE_URL (obrigatória)
 *      BACKUP_DIR (default /data/backups)
 *      BACKUP_RETENTION_DAYS (default 30)
 *      UPLOAD_ROOT (default /data/uploads — as fotos entram no backup)
 *      S3_* (opcional, upload off-site)
 *
 * ── As fotos entram no backup desde 11/09/2026 ──────────────────────────────
 *
 * `pg_dump` salva o banco e **nada do volume**. O logo, a foto de capa, o
 * favicon, a galeria e as fotos de produto viviam só em `/data/uploads`, sem
 * cópia em lugar nenhum (`PENDENCIAS-ABERTAS.md` §3.7).
 *
 * Com SQLite isso passava batido porque o `.db` ficava no mesmo `/data`: quem
 * copiasse o volume levava tudo. Agora o banco está fora do volume e o volume
 * estava fora do backup — então, se o volume morresse, o banco voltava e a
 * barbearia perdia a identidade visual inteira. Restaurar significaria pedir
 * as fotos de novo para um cliente pagante.
 *
 * Cada dia gera DOIS arquivos, independentes de propósito:
 *
 *     barbearia_<stamp>.sql.gz          o banco
 *     barbearia_<stamp>-fotos.tar.gz    o conteúdo de UPLOAD_ROOT
 *
 * Separados porque restaurar um não deveria exigir o outro: banco corrompido
 * com fotos intactas é o caso comum, e nele ninguém quer mexer nas fotos.
 *
 * ── O que mudou no porte para Postgres ──────────────────────────────────────
 * Era `sqlite.backup(dest)`: a API de backup online do SQLite, que copia o
 * arquivo do banco de forma consistente mesmo com escrita acontecendo. No
 * Postgres o análogo é `pg_dump`, que roda como processo separado e devolve
 * SQL comprimido em vez de um arquivo de banco.
 *
 * Três consequências práticas:
 *
 *  1. O arquivo agora é `.sql.gz`, não `.db`. Restaura num banco VAZIO com
 *     `gunzip -c arquivo.sql.gz | psql "$DATABASE_URL"` — e depois
 *     `node scripts/permissoes-do-app.mjs`, que devolve ao papel do app o que a
 *     restauração não trouxer (backup de antes de 11/10/2026, ou um servidor
 *     novo, onde o papel `barbearia_app` ainda não existia). O boot confere e
 *     recusa subir sem isso (`conferirPapelDoApp`, em `scripts/startup.mjs`).
 *  2. **`pg_dump` precisa estar instalado na imagem do app.** Sem ele o backup
 *     falha. Este script confere na primeira execução e diz isso na cara, em
 *     vez de morrer com "command not found".
 *  3. A retenção passou a olhar `.sql.gz`. Backups `.db` antigos, de antes do
 *     porte, são deixados em paz de propósito — são a única cópia daquele
 *     período e apagá-los seria destruir histórico.
 *
 * ⚠️ Este script roda no daemon (`backup-daemon.mjs`), lançado pelo CMD do
 * Dockerfile. Se ele quebrar, o backup diário para **em silêncio**. É o que
 * `PENDENCIAS-ABERTAS.md` §3.3 chama de "backup que não existe".
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createGunzip, createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const BACKUP_DIR     = process.env.BACKUP_DIR ?? '/data/backups';
// Inteiro de 1 para cima (26/10/2026): com 0 ou negativo, a retenção apagava o backup
// recém-feito na mesma rodada; com um valor que não é número, o corte virava NaN e
// nada nunca era apagado, até o disco encher.
// A mesma leitura de `backupNoPainel` (src/lib/operadorSistema.ts), para a tela de Sistema
// mostrar o prazo que de fato vale.
const RETENCAO_LIDA = Number.parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
const RETENTION_DAYS = Number.isFinite(RETENCAO_LIDA) && RETENCAO_LIDA > 0 ? RETENCAO_LIDA : 30;
const SUFIXO         = '.sql.gz';
const SUFIXO_FOTOS   = '-fotos.tar.gz';

/**
 * Onde as fotos moram. **Tem que ser a mesma regra de `src/lib/uploads.ts`.**
 *
 * Este arquivo é `.mjs` e não consegue importar o `.ts`, então a expressão está
 * repetida — e repetição de regra foi exatamente como o fuso horário se
 * espalhou por 20 arquivos. O que segura as duas juntas é um caso em
 * `tests/deploy.test.ts`, que lê os dois arquivos e falha se divergirem.
 *
 * Se a raiz aqui apontar para o lugar errado, o backup salva uma pasta vazia e
 * diz que deu certo — o pior defeito possível num backup.
 */
const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT ??
  (process.env.NODE_ENV === 'production' ? '/data/uploads' : './data/uploads');

/**
 * O arquivo em gravação ganha este fim, e só vira o nome final depois de terminar
 * bem (26/10/2026). Antes, o `pg_dump` e o `tar` gravavam direto no nome final: o
 * backup interrompido no meio — um redeploy, um `docker stop` — ficava no disco
 * truncado e com o nome de bom, e contava como o mais recente: o backup do boot era
 * pulado por 12 horas e a tela de Sistema o mostrava como o último. Com o fim
 * `.parcial`, nada que procura `.sql.gz` ou `-fotos.tar.gz` o vê; a retenção o apaga.
 */
const PARCIAL = '.parcial';
/** Um `.parcial` mais velho que isto é de um backup que morreu no meio. */
const PARCIAL_ABANDONADO_MS = 6 * 60 * 60 * 1000;

/** Idade (ms) do backup mais recente, ou Infinity se não houver nenhum. */
export function newestBackupAgeMs() {
  try {
    const ages = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(SUFIXO))
      .map((f) => Date.now() - statSync(join(BACKUP_DIR, f)).mtimeMs);
    return ages.length ? Math.min(...ages) : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Roda `pg_dump` e escreve o resultado comprimido em `dest`.
 *
 * O stderr é acumulado: `pg_dump` que falha no meio deixaria um `.sql.gz`
 * truncado, e um backup truncado é pior que nenhum — parece que existe. Por
 * isso o arquivo só é considerado válido com código de saída 0, e o chamador
 * apaga o parcial quando não é.
 */
function pgDumpPara(dest, url) {
  return new Promise((resolve, reject) => {
    // `--no-owner`: quem restaura vira dono das tabelas. Os PRIVILÉGIOS vão no
    // arquivo — e até 11/10/2026 não iam (`--no-privileges`): o banco restaurado
    // voltava com os dados e sem nenhum GRANT ao papel `barbearia_app`, e toda tela
    // respondia 500 com o boot verde. Achado restaurando de verdade, no ensaio da
    // troca do usuário do banco. Backup antigo, sem eles: `scripts/permissoes-do-app.mjs`.
    const proc = spawn('pg_dump', ['--no-owner', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let erro = '';
    proc.stderr.on('data', (d) => { erro += d.toString(); });

    // Os dois listeners entram AGORA, antes de qualquer await.
    //
    // ⚠️ Registrar o `close` só depois que a pipeline resolve não funciona: o
    // processo pode já ter terminado, e aí o listener nunca dispara. Foi assim
    // que a primeira versão deste arquivo devolveu "backup criado" para um
    // `pg_dump` que nem tinha conseguido conectar — 20 bytes de gzip vazio
    // apresentados como sucesso. Backup que mente é pior que backup ausente.
    const saida = new Promise((ok, falha) => {
      proc.on('error', (e) => {
        falha(new Error(
          e.code === 'ENOENT'
            ? 'pg_dump não encontrado. Instale o cliente do Postgres na imagem ' +
              '(Debian/Ubuntu: apt-get install -y postgresql-client; Alpine: apk add postgresql-client).'
            : e.message
        ));
      });
      proc.on('close', (codigo) => {
        if (codigo === 0) ok();
        else falha(new Error(`pg_dump saiu com código ${codigo}: ${erro.trim() || '(sem mensagem)'}`));
      });
    });

    const gravou = pipeline(proc.stdout, createGzip(), createWriteStream(dest + PARCIAL));

    // Espera as DUAS: escrever o arquivo inteiro e o processo sair com 0 — e só
    // então o nome final. Falhou: o parcial sai.
    // O `rename` dentro do mesmo encadeamento: se ele falhar, cai no mesmo `catch`
    // em vez de deixar a promessa pendurada para sempre.
    Promise.all([gravou, saida])
      .then(() => renameSync(dest + PARCIAL, dest))
      .then(resolve, (e) => {
        try { unlinkSync(dest + PARCIAL); } catch { /* nunca chegou a existir */ }
        reject(e);
      });
  });
}

/** Há alguma foto para salvar? Barbearia recém-criada ainda não tem. */
function temFotos() {
  try {
    return existsSync(UPLOAD_ROOT) && readdirSync(UPLOAD_ROOT).length > 0;
  } catch {
    return false;
  }
}

/**
 * Empacota `UPLOAD_ROOT` inteiro em `dest`.
 *
 * Os caminhos vão RELATIVOS à raiz (`-C raiz .`), para que restaurar seja
 * `tar -xzf arquivo -C /data/uploads` e funcione mesmo que o volume tenha sido
 * montado em outro lugar. Caminho absoluto dentro do tar amarraria a
 * restauração à máquina de origem.
 *
 * Mesma disciplina do `pg_dump`: os dois listeners entram antes de qualquer
 * await, e arquivo parcial é apagado pelo chamador. Tar truncado é pior que
 * tar nenhum, porque parece backup.
 */
function tarDasFotos(dest) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-czf', dest + PARCIAL, '-C', UPLOAD_ROOT, '.'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let erro = '';
    proc.stderr.on('data', (d) => { erro += d.toString(); });

    proc.on('error', (e) => {
      reject(new Error(
        e.code === 'ENOENT'
          ? 'tar não encontrado na imagem. Sem ele as fotos ficam fora do backup.'
          : e.message
      ));
    });

    proc.on('close', (codigo) => {
      let falha = codigo === 0 ? null : new Error(`tar saiu com código ${codigo}: ${erro.trim() || '(sem mensagem)'}`);
      if (!falha) {
        try { renameSync(dest + PARCIAL, dest); resolve(); return; } catch (e) { falha = e; }
      }
      try { unlinkSync(dest + PARCIAL); } catch { /* nunca chegou a existir */ }
      reject(falha);
    });
  });
}

/**
 * Cria um backup consistente e apaga os antigos. Retorna o caminho criado.
 * opts.skipIfFresherThanMs: não faz nada se já existe backup mais novo que isso
 * (evita enxurrada de backups num restart-loop do container).
 */
export async function runBackup(opts = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definido.');

  mkdirSync(BACKUP_DIR, { recursive: true });

  if (opts.skipIfFresherThanMs && newestBackupAgeMs() < opts.skipIfFresherThanMs) {
    return { dest: null, removed: 0, skipped: true };
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dest = join(BACKUP_DIR, `barbearia_${stamp}${SUFIXO}`);

  try {
    await pgDumpPara(dest, url);
  } catch (erro) {
    // Arquivo parcial é pior que arquivo nenhum: parece backup e não é.
    try { unlinkSync(dest); } catch { /* nunca chegou a existir */ }
    throw erro;
  }

  // ── As fotos ────────────────────────────────────────────────────────────────
  //
  // Falha aqui NÃO invalida o backup do banco: o dump já está no disco e é a
  // parte insubstituível. Perder as fotos de um dia é ruim; jogar fora um dump
  // bom porque o tar falhou seria pior. O erro fica registrado no retorno, para
  // quem chama poder gritar.
  let fotos = null;
  let erroFotos = null;

  if (temFotos()) {
    const destFotos = join(BACKUP_DIR, `barbearia_${stamp}${SUFIXO_FOTOS}`);
    try {
      await tarDasFotos(destFotos);
      fotos = destFotos;
    } catch (erro) {
      try { unlinkSync(destFotos); } catch { /* nunca chegou a existir */ }
      erroFotos = erro.message;
      console.error('✕ Backup das fotos falhou (o banco foi salvo):', erro.message);
    }
  }

  // Retenção: os dois formatos do backup novo. Os .db de antes do porte ficam —
  // são a única cópia daquele período e apagá-los seria destruir histórico.
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  const abandonado = Date.now() - PARCIAL_ABANDONADO_MS;
  for (const f of readdirSync(BACKUP_DIR)) {
    const p = join(BACKUP_DIR, f);
    if (f.endsWith(PARCIAL)) {
      // O resto de um backup que morreu no meio — nunca é o desta rodada, que já
      // ganhou o nome final.
      if (statSync(p).mtimeMs < abandonado) { unlinkSync(p); removed++; }
      continue;
    }
    if (!f.endsWith(SUFIXO) && !f.endsWith(SUFIXO_FOTOS)) continue;
    if (p === dest || p === fotos) continue; // o desta rodada nunca sai, qualquer que seja a retenção
    if (statSync(p).mtimeMs < cutoff) { unlinkSync(p); removed++; }
  }

  const uploaded = await maybeUploadToS3(dest);
  if (fotos) await maybeUploadToS3(fotos);

  return { dest, fotos, erroFotos, removed, skipped: false, uploaded };
}

/**
 * Um dump só do banco — sem as fotos, sem a retenção e sem o envio para fora.
 *
 * É o backup de ANTES das migrations (`backupAntesDasMigrations`, em
 * `scripts/startup.mjs`, desde 17/10/2026). O boot roda as migrations e só depois
 * lança o daemon, cujo backup de boot vem portanto DEPOIS delas — e é pulado se
 * houver um com menos de 12 horas. Uma migration que estragasse dado tinha como
 * último ponto de volta o backup das 03:00. As fotos ficam de fora porque migration
 * não mexe nelas; o envio para fora, porque ele atrasaria o boot, que é o site fora
 * do ar — o diário manda.
 *
 * O arquivo é um backup como os outros: mesma pasta, mesmo formato, restaura igual,
 * e a retenção do diário o apaga no mesmo prazo. Por isso, ⚠️ o daemon vê um backup
 * recente e pula o do boot: o estado depois das migrations entra no das 03:00.
 *
 * `rotulo` vai no nome — `barbearia_<stamp>-antes-da-0017.sql.gz` —, só com letra
 * minúscula, número e hífen.
 */
export async function backupDoBanco(rotulo) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definido.');
  const limpo = String(rotulo).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dest = join(BACKUP_DIR, `barbearia_${stamp}${limpo ? `-${limpo}` : ''}${SUFIXO}`);

  try {
    await pgDumpPara(dest, url);
  } catch (erro) {
    try { unlinkSync(dest); } catch { /* nunca chegou a existir */ }
    throw erro;
  }
  return { dest, bytes: statSync(dest).size };
}

/**
 * Um backup `-<rotulo>.sql.gz` feito há menos de `maxIdadeMs` — ou `null`.
 *
 * Para o backup de antes das migrations (27/10/2026): migration que falha derruba o
 * boot, o orquestrador reinicia o container sem parar, e cada volta tirava mais um
 * dump do banco inteiro — a retenção só roda no daemon, que nesse ciclo nunca sobe.
 * Com dado de verdade, enchia o disco da VPS, o mesmo do Postgres. Entre uma volta e
 * outra o banco não mudou (o servidor nem chegou a subir), então o dump de minutos
 * atrás vale. Só o `.sql.gz` final conta: o `.parcial` é de um que morreu no meio.
 */
export async function backupRecente(rotulo, maxIdadeMs) {
  const limpo = String(rotulo).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const fim = `-${limpo}${SUFIXO}`;
  let achados;
  try {
    achados = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('barbearia_') && f.endsWith(fim))
      .map((f) => ({ f, s: statSync(join(BACKUP_DIR, f)) }))
      .filter(({ s }) => s.isFile() && s.size > 0 && Date.now() - s.mtimeMs < maxIdadeMs)
      .sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
  } catch {
    return null;
  }
  // Só vale um dump INTEIRO (30/10/2026): até então qualquer arquivo com o nome certo servia — um
  // de 26 bytes de lixo foi aceito. O `pg_dump` termina o arquivo com esta linha; sem ela, o dump
  // está cortado ou não é um dump.
  for (const { f, s } of achados) {
    if (await terminaComoDump(join(BACKUP_DIR, f))) return { dest: join(BACKUP_DIR, f), bytes: s.size };
  }
  return null;
}

/** O `.sql.gz` descomprime inteiro e termina com a linha de fim do `pg_dump`? */
function terminaComoDump(caminho) {
  return new Promise((resolve) => {
    let fim = '';
    const leitor = createReadStream(caminho).pipe(createGunzip());
    leitor.on('data', (d) => { fim = (fim + d.toString('utf8')).slice(-400); });
    leitor.on('end', () => resolve(/PostgreSQL database dump complete/.test(fim)));
    leitor.on('error', () => resolve(false));
  });
}

/**
 * O tamanho de cada parte no envio para fora da VPS. O mínimo do S3 — e do
 * Backblaze — é 5 MiB por parte (menos a última); 16 MiB faz um arquivo de 1 GB
 * subir em 64 partes, com no máximo 16 MiB na memória por vez.
 */
export const PARTE_DO_ENVIO = 16 * 1024 * 1024;

/**
 * Upload off-site opcional (S3-compatível, ex: Backblaze B2).
 * Ativa somente se S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY existirem.
 * Falha de upload NÃO derruba o backup local — loga e segue.
 */
async function maybeUploadToS3(filePath) {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return false;

  try {
    await enviarParaS3(filePath);
    console.log(`✓ Upload off-site: s3://${S3_BUCKET}/backups/${basename(filePath)}`);
    return true;
  } catch (err) {
    console.error('✕ Upload off-site falhou (backup local preservado):', err.message);
    return false;
  }
}

/**
 * Manda `caminho` para `backups/<nome>` no bucket — EM PARTES, lidas do disco uma
 * de cada vez.
 *
 * ── POR QUE EM PARTES (12/10/2026) ───────────────────────────────────────────
 *
 * Até aqui o arquivo inteiro ia para a memória (`Body: readFileSync(...)`) antes
 * de sair. O das fotos junta a galeria de todas as barbearias e cresce com cada
 * uma, e o daemon do backup roda no mesmo container que atende os sites, numa
 * VPS que divide a memória com o banco (`PENDENCIAS-ABERTAS.md` §3.3). Agora:
 * arquivo de até uma parte vai num pedido só; maior, no envio em partes do S3
 * (`CreateMultipartUpload` → `UploadPart` → `CompleteMultipartUpload`), com uma
 * parte na memória por vez. Parte que falha, depois das novas tentativas do
 * próprio SDK, cancela o envio inteiro (`AbortMultipartUpload`): parte órfã fica
 * no bucket ocupando espaço — e sendo cobrada — sem virar arquivo nenhum.
 *
 * ⚠️ `requestChecksumCalculation: 'WHEN_REQUIRED'`: desde o começo de 2025 o SDK
 * manda, por padrão, um checksum novo (CRC32) em todo envio — e serviços
 * compatíveis com S3 que não o conhecem recusam o pedido. Com `WHEN_REQUIRED`, só
 * vai quando a operação exige, como antes. A integridade continua garantida: o
 * pedido é assinado com o SHA-256 do corpo. *Não conferido contra o Backblaze de
 * verdade — conferido contra um S3 local (`tests/backup-envio.test.ts`).*
 *
 * `opcoes.parte` existe para o teste; em produção é sempre `PARTE_DO_ENVIO`.
 */
export async function enviarParaS3(caminho, opcoes = {}) {
  const env = opcoes.env ?? process.env;
  const parte = opcoes.parte ?? PARTE_DO_ENVIO;
  const {
    S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand,
    CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
  } = await import('@aws-sdk/client-s3');
  // Backblaze mostra o endpoint sem esquema; o SDK exige URL completa.
  const endpoint = /^https?:\/\//.test(env.S3_ENDPOINT) ? env.S3_ENDPOINT : `https://${env.S3_ENDPOINT}`;
  const client = new S3Client({
    endpoint,
    region: env.S3_REGION ?? 'us-east-1',
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const Bucket = env.S3_BUCKET;
  const Key = `backups/${basename(caminho)}`;
  const ContentType = 'application/gzip';

  try {
    const arquivo = await open(caminho, 'r');
    try {
      const { size: tamanho } = await arquivo.stat();

      // Até uma parte: um pedido só, como antes — o arquivo cabe na parte.
      if (tamanho <= parte) {
        const corpo = Buffer.alloc(tamanho);
        await lerTudo(arquivo, corpo, 0);
        await client.send(new PutObjectCommand({ Bucket, Key, Body: corpo, ContentLength: tamanho, ContentType }));
        return { partes: 1, bytes: tamanho };
      }

      const { UploadId } = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType }));
      if (!UploadId) throw new Error('o armazenamento não devolveu o identificador do envio em partes');
      try {
        const buffer = Buffer.alloc(parte);
        const Parts = [];
        for (let posicao = 0, PartNumber = 1; posicao < tamanho; PartNumber++) {
          const lidos = await lerTudo(arquivo, buffer, posicao);
          if (lidos === 0) throw new Error(`o arquivo encolheu durante o envio (${posicao} de ${tamanho} bytes)`);
          // O mesmo buffer serve todas as partes: o `await` termina o envio desta
          // — com as novas tentativas do SDK — antes de a próxima leitura escrever nele.
          const { ETag } = await client.send(new UploadPartCommand({
            Bucket, Key, UploadId, PartNumber, Body: buffer.subarray(0, lidos), ContentLength: lidos,
          }));
          if (!ETag) throw new Error(`a parte ${PartNumber} voltou sem ETag`);
          Parts.push({ ETag, PartNumber });
          posicao += lidos;
        }
        await client.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts } }));
        return { partes: Parts.length, bytes: tamanho };
      } catch (erro) {
        await client.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })).catch((e) => {
          console.error(`✕ Não deu para cancelar o envio em partes ${UploadId} — apague as partes no painel do armazenamento:`, e.message);
        });
        throw erro;
      }
    } finally {
      await arquivo.close();
    }
  } finally {
    client.destroy();
  }
}

/** Lê do arquivo até encher `buffer` ou o arquivo acabar; devolve quantos bytes leu. */
async function lerTudo(arquivo, buffer, posicao) {
  let total = 0;
  while (total < buffer.length) {
    const { bytesRead } = await arquivo.read(buffer, total, buffer.length - total, posicao + total);
    if (bytesRead === 0) break;
    total += bytesRead;
  }
  return total;
}

// Execução direta via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup()
    .then(({ dest, fotos, erroFotos, removed }) => {
      console.log(`✓ Backup criado: ${dest}${removed ? ` (${removed} antigos removidos)` : ''}`);
      if (fotos) console.log(`✓ Fotos: ${fotos}`);
      else if (erroFotos) console.log(`✕ Fotos NÃO salvas: ${erroFotos}`);
      else console.log(`  Fotos: nenhuma em ${UPLOAD_ROOT} — nada a salvar`);
    })
    .catch((err) => {
      console.error('✕ Backup falhou:', err.message);
      process.exit(1);
    });
}
