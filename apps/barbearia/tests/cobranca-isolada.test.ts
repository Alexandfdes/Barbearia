// A cobrança fica num canto só do app — `docs/ARQUITETURA-COBRANCA-V1.md` §2.
//
// ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
//
// A cobrança mora dentro do app da barbearia desde 08/10/2026, por decisão do dono,
// com uma condição: se ela quebrar, as barbearias continuam funcionando. No build
// do Astro cada página carrega só o que importa — então isso vale enquanto as telas
// e rotas da barbearia não chegarem ao módulo de cobrança (`lib/cobranca.ts` e o
// cliente da Asaas, `lib/asaas.ts`), nem direto, nem por um arquivo do meio. O
// desenho prometia um teste para isso; até 12/10/2026 ele não existia.
//
// Este segue os imports de cada página e rota, e do middleware — que roda em toda
// requisição —, e reprova quem chega à cobrança sem estar na lista. O painel do
// operador fica de fora: não é tela de barbearia.
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { tmpdir } from 'node:os';

/** O módulo de cobrança. */
const COBRANCA = ['src/lib/cobranca.ts', 'src/lib/asaas.ts'];

/**
 * Quem pode chegar à cobrança, e por quê. A lista fecha nos dois sentidos: entrada
 * nova precisa do motivo, e a que não chega mais à cobrança sai.
 */
const PODEM: Record<string, string> = {
  'src/pages/admin/assinatura.astro': 'a tela de assinatura do dono',
  'src/pages/api/admin/assinatura/cartao.ts': 'leva o dono ao Checkout da Asaas',
  'src/pages/api/admin/assinatura/cancelar.ts': 'cancela a assinatura',
  'src/pages/api/asaas/webhook.ts': 'o aviso da Asaas — não é rota de barbearia',
};

/** O painel do operador: não é tela de barbearia. */
const DO_OPERADOR = (f: string) => f.startsWith('src/pages/operador/') || f.startsWith('src/pages/api/operador/');

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return /\.(astro|ts|mts|js|mjs)$/.test(nome) ? [caminho] : [];
  });
}

/** O arquivo que um import relativo carrega — `.js` no import é `.ts` no disco. */
function resolver(de: string, spec: string): string | null {
  const base = normalize(join(dirname(de), spec));
  const candidatos = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.mjs$/, '.mts'), `${base}.ts`, `${base}.astro`, join(base, 'index.ts')];
  return candidatos.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/** `from './x'` (import e export), `import('./x')` e o import só pelo efeito, `import './x'`. */
const IMPORT_RELATIVO = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

/** O caminho mais curto de `entrada` até um arquivo de `alvos` — ou null. */
function caminhoAte(entrada: string, alvos: string[]): string[] | null {
  const veioDe = new Map<string, string | null>([[entrada, null]]);
  const fila = [entrada];
  while (fila.length) {
    const atual = fila.shift()!;
    if (alvos.includes(atual) && atual !== entrada) {
      const caminho = [atual];
      for (let p = veioDe.get(atual); p; p = veioDe.get(p)) caminho.unshift(p);
      return caminho;
    }
    for (const m of readFileSync(atual, 'utf8').matchAll(IMPORT_RELATIVO)) {
      const proximo = resolver(atual, m[1]);
      if (proximo && !veioDe.has(proximo)) {
        veioDe.set(proximo, atual);
        fila.push(proximo);
      }
    }
  }
  return null;
}

const ENTRADAS = [...arquivosDe('src/pages').filter((f) => !DO_OPERADOR(f)), 'src/middleware.ts'].sort();

describe('a cobrança num canto só', () => {
  it('nenhuma tela, rota ou o middleware da barbearia chega à cobrança — nem por um arquivo do meio', () => {
    expect(ENTRADAS.length).toBeGreaterThan(80); // achou as páginas
    const chegam = ENTRADAS
      .filter((f) => !(f in PODEM))
      .map((f) => caminhoAte(f, COBRANCA))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join(' → '));
    expect(chegam, 'tela de barbearia carregando a cobrança: se ela quebrar, a tela cai junto').toEqual([]);
  });

  it('cada exceção existe e chega mesmo à cobrança — a que não chega mais sai da lista', () => {
    for (const [arquivo, motivo] of Object.entries(PODEM)) {
      expect(existsSync(arquivo), `${arquivo} (${motivo})`).toBe(true);
      expect(caminhoAte(arquivo, ['src/lib/cobranca.ts']), `${arquivo} (${motivo}) não importa mais a cobrança`).not.toBeNull();
    }
  });
});

describe('o seguidor de imports', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'cobranca-isolada-'));
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));
  const escrever = (nome: string, texto: string) => {
    mkdirSync(dirname(join(pasta, nome)), { recursive: true });
    writeFileSync(join(pasta, nome), texto);
  };

  it('acha a cobrança pelo arquivo do meio: `.js` que é `.ts`, componente `.astro`, import dinâmico e re-export', () => {
    escrever('pages/tela.astro', "---\nimport Cartao from '../components/Cartao.astro';\n---\n<Cartao />");
    escrever('components/Cartao.astro', "---\nconst { resumo } = await import('../lib/resumo.js');\n---");
    escrever('lib/resumo.ts', "export { cobrar } from './meio';\n");
    escrever('lib/meio.ts', "import './cobranca.js';\nexport const cobrar = 1;\n");
    escrever('lib/cobranca.ts', 'export const x = 1;\n');
    escrever('pages/limpa.ts', "import { cobrar } from '../lib/outra.js';\n");
    escrever('lib/outra.ts', '// importa da cobranca? não: só fala dela (lib/cobranca.ts)\nexport const cobrar = 2;\n');

    const alvo = [join(pasta, 'lib/cobranca.ts')];
    const caminho = caminhoAte(join(pasta, 'pages/tela.astro'), alvo)?.map((c) => relative(pasta, c));
    expect(caminho).toEqual(['pages/tela.astro', 'components/Cartao.astro', 'lib/resumo.ts', 'lib/meio.ts', 'lib/cobranca.ts']);
    expect(caminhoAte(join(pasta, 'pages/limpa.ts'), alvo)).toBeNull();
  });
});
