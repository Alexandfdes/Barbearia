// Os metadados de uma imagem gravada em disco — lidos pelo CONTEÚDO, nunca pelo caminho.
//
// ⚠️ `sharp(caminho)` deixa o arquivo aberto: o cache do libvips segura até 20
// arquivos (`options.files`, em `node_modules/sharp/lib/utility.js`). No Linux,
// apagar arquivo aberto é permitido; no Windows, não — e a limpeza da pasta
// temporária estourava `EPERM` no `rmSync`, derrubando um caso que já tinha passado.
// Visto em 28/09/2026, na primeira vez que os testes das fotos rodaram no Windows.
//
// Lendo para um buffer antes, o libvips nunca abre o arquivo. O código do app já
// faz assim: `lib/uploads.ts` e o importador sempre entregam buffer ao sharp.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

export function metadadosDoArquivo(caminho: string) {
  return sharp(readFileSync(caminho)).metadata();
}
