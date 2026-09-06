export const prerender = false;
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { autenticado } from '../../../../lib/auth.js';

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? './data/uploads';

// Validação estrita em vez de sanitização: só aceitamos exatamente o formato que
// nós mesmos geramos. Qualquer coisa fora disso é recusada, o que fecha travessia
// de caminho ("../../") sem depender de normalizar string.
const PROTOCOLO = /^[A-Z]{4}-\d{3}$/;
const ARQUIVO = /^\d{2}\.(png|jpe?g|webp|avif)$/i;

const TIPO: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif',
};

export const GET: APIRoute = async ({ request, params }) => {
  if (!autenticado(request)) return new Response('Não autorizado', { status: 401 });

  const { protocolo = '', arquivo = '' } = params;
  if (!PROTOCOLO.test(protocolo) || !ARQUIVO.test(arquivo)) {
    return new Response('Caminho inválido', { status: 400 });
  }

  try {
    const dados = await readFile(join(UPLOAD_ROOT, protocolo, arquivo));
    const ext = arquivo.split('.').pop()!.toLowerCase();
    return new Response(new Uint8Array(dados), {
      status: 200,
      headers: {
        'Content-Type': TIPO[ext] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Arquivo não encontrado', { status: 404 });
  }
};
