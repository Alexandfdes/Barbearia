/**
 * Banco do site do produto. Guarda o que os donos de barbearia enviam no
 * formulário de onboarding — nada de dados dos clientes finais deles.
 *
 * Ainda não tem tenants nem assinaturas: isso entra quando a cobrança existir
 * (ver docs/ARQUITETURA-COBRANCA-V1.md do projeto da barbearia). Por enquanto é
 * só a caixa de entrada da implantação.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DATABASE_PATH ?? './data/produto.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS onboarding (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    protocolo     TEXT NOT NULL UNIQUE,
    nome_negocio  TEXT NOT NULL,
    responsavel   TEXT NOT NULL,
    whatsapp      TEXT NOT NULL,
    endereco      TEXT,
    cidade        TEXT,
    instagram     TEXT,
    sobre         TEXT,
    servicos      TEXT NOT NULL DEFAULT '[]',
    horarios      TEXT NOT NULL DEFAULT '[]',
    observacoes   TEXT,
    arquivos      TEXT NOT NULL DEFAULT '[]',
    criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Coluna de acompanhamento, adicionada depois. Idempotente: só entra se faltar,
// para bancos que já existiam antes dela.
{
  const colunas = db.prepare('PRAGMA table_info(onboarding)').all() as { name: string }[];
  if (!colunas.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE onboarding ADD COLUMN status TEXT NOT NULL DEFAULT 'novo'");
  }
}

/** Protocolo curto e legível ao telefone: 4 letras + 3 números. Sem 0/O e 1/I. */
export function novoProtocolo(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += letras[Math.floor(Math.random() * letras.length)];
  s += '-';
  for (let i = 0; i < 3; i++) s += nums[Math.floor(Math.random() * nums.length)];
  return s;
}
