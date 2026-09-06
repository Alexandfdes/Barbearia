export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { db, novoProtocolo } from '../../lib/db.js';

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? './data/uploads';
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const TAMANHO_MAX = 15 * 1024 * 1024; // 15 MB — foto de celular moderno cabe
const MAX_ARQUIVOS = 30;

const servicoSchema = z.object({
  nome: z.string().min(1).max(80),
  preco: z.string().max(20),
  duracao: z.string().max(20),
});
const horarioSchema = z.object({
  dia: z.string().min(1).max(40),
  horario: z.string().max(40),
});

const schema = z.object({
  nomeNegocio: z.string().min(2, 'Informe o nome da barbearia').max(100),
  responsavel: z.string().min(2, 'Informe seu nome').max(100),
  whatsapp:    z.string().min(10, 'Informe um WhatsApp válido').max(20),
  endereco:    z.string().max(150).optional().default(''),
  cidade:      z.string().max(80).optional().default(''),
  instagram:   z.string().max(120).optional().default(''),
  sobre:       z.string().max(800).optional().default(''),
  observacoes: z.string().max(800).optional().default(''),
  servicos:    z.array(servicoSchema).max(60).optional().default([]),
  horarios:    z.array(horarioSchema).max(10).optional().default([]),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Não consegui ler o formulário. Tente de novo.' }, 400); }

  const bruto = {
    nomeNegocio: String(form.get('nomeNegocio') ?? '').trim(),
    responsavel: String(form.get('responsavel') ?? '').trim(),
    whatsapp:    String(form.get('whatsapp') ?? '').trim(),
    endereco:    String(form.get('endereco') ?? '').trim(),
    cidade:      String(form.get('cidade') ?? '').trim(),
    instagram:   String(form.get('instagram') ?? '').trim(),
    sobre:       String(form.get('sobre') ?? '').trim(),
    observacoes: String(form.get('observacoes') ?? '').trim(),
    servicos:    JSON.parse(String(form.get('servicos') ?? '[]')),
    horarios:    JSON.parse(String(form.get('horarios') ?? '[]')),
  };

  const parsed = schema.safeParse(bruto);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return json({ error: i.message }, 400);
  }
  const d = parsed.data;

  const arquivos = form.getAll('arquivos').filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length > MAX_ARQUIVOS) {
    return json({ error: `Envie no máximo ${MAX_ARQUIVOS} arquivos por vez.` }, 400);
  }
  for (const f of arquivos) {
    if (!TIPOS_OK.includes(f.type)) {
      return json({ error: `"${f.name}" não é uma imagem (aceito JPG, PNG, WEBP ou AVIF).` }, 400);
    }
    if (f.size > TAMANHO_MAX) {
      return json({ error: `"${f.name}" passa de 15 MB. Mande uma versão menor.` }, 400);
    }
  }

  const protocolo = novoProtocolo();
  const salvos: { nome: string; arquivo: string; bytes: number }[] = [];

  try {
    if (arquivos.length > 0) {
      const pasta = join(UPLOAD_ROOT, protocolo);
      await mkdir(pasta, { recursive: true });
      let n = 1;
      for (const f of arquivos) {
        // Nome de arquivo previsível: nada do nome original vai para o disco,
        // que é como se evita path traversal e nome esquisito de celular.
        const ext = (extname(f.name) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
        const arquivo = `${String(n).padStart(2, '0')}${ext}`;
        await writeFile(join(pasta, arquivo), Buffer.from(await f.arrayBuffer()));
        salvos.push({ nome: f.name, arquivo, bytes: f.size });
        n++;
      }
    }

    db.prepare(`
      INSERT INTO onboarding
        (protocolo, nome_negocio, responsavel, whatsapp, endereco, cidade, instagram, sobre, servicos, horarios, observacoes, arquivos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      protocolo, d.nomeNegocio, d.responsavel, d.whatsapp, d.endereco, d.cidade,
      d.instagram, d.sobre, JSON.stringify(d.servicos), JSON.stringify(d.horarios),
      d.observacoes, JSON.stringify(salvos),
    );
  } catch (err) {
    console.error('[api/onboarding]', err);
    return json({ error: 'Não consegui salvar. Tente de novo em alguns minutos.' }, 500);
  }

  return json({ ok: true, protocolo, arquivos: salvos.length });
};
