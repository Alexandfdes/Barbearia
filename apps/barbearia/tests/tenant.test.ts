import { describe, it, expect } from 'vitest';
import {
  tenantDoHost, tenantDaSessao, tenantDaSessaoOuNulo, resolverHost,
  tenantAtual, TENANT_UNICO, type Tenant,
} from '../src/lib/tenant.js';
import { pastaDeMidia, urlDeMidia } from '../src/lib/uploads.js';

/** Como um tenant de verdade vai ser depois do passo 3. */
const OUTRO: Tenant = { id: 7, slug: 'vintage', status: 'active', domain: null };

describe('resolvedor de tenant — sessão', () => {
  it('recusa sessão sem tenantId em vez de cair num padrão', () => {
    // Sessão de antes do passo 7. Cair em TENANT_UNICO aqui serviria os dados
    // da barbearia errada — o modo de falha mais caro que este sistema tem.
    expect(tenantDaSessaoOuNulo(null)).toBeNull();
    expect(tenantDaSessaoOuNulo({})).toBeNull();
  });

  it('recusa tenant que não está no cache', () => {
    expect(tenantDaSessaoOuNulo({ tenantId: 99999 })).toBeNull();
  });

  it('a versão que estoura estoura mesmo — não devolve um tenant qualquer', () => {
    // `tenantDaSessao()` é chamada em 53 rotas DEPOIS de `getSession()` já ter
    // validado. Se alguém pular essa ordem, o erro precisa ser barulhento: um
    // tenant improvisado aqui vira vazamento silencioso entre barbearias.
    expect(() => tenantDaSessao(null)).toThrow(/barbearia válida/i);
    expect(() => tenantDaSessao({ tenantId: 99999 })).toThrow();
  });

  it('resolverHost recusa host desconhecido em vez de chutar', () => {
    // Servir o site da barbearia errada é pior que não servir nada: quem chama
    // responde 404.
    expect(resolverHost(null)).toBeNull();
    expect(resolverHost('naoexiste.barbearianoar.com.br')).toBeNull();
    expect(resolverHost('')).toBeNull();
  });

  it('o tenant único tem a forma definitiva, não um objeto improvisado', () => {
    expect(TENANT_UNICO).toHaveProperty('id');
    expect(TENANT_UNICO).toHaveProperty('slug');
    expect(TENANT_UNICO).toHaveProperty('status');
    expect(TENANT_UNICO.status).toBe('active');
  });

  it('tenantDoHost deixou de devolver o tenant único — passo 6, feito em 11/09/2026', () => {
    // ⚠️ Este caso era o alarme do passo 6: ele afirmava que `tenantDoHost()`
    // devolvia `TENANT_UNICO` e mandava falhar no dia em que isso mudasse.
    // Mudou em 11/09/2026, ele falhou como prometido, e virou o oposto.
    //
    // Com o cache VAZIO — que é o estado deste arquivo, que não abre banco —
    // qualquer endereço devolve null. Não é limitação do teste: é o
    // comportamento, e é por isso que `src/middleware.ts` aquece o cache uma vez
    // por requisição, antes de qualquer rota. Sem aquecer, a primeira visita
    // depois de cada boot cairia em 404.
    expect(tenantDoHost(new Request('https://vintage.barbearianoar.com.br/'))).toBeNull();

    // Fora de requisição, `tenantAtual()` segue sendo a barbearia única: é o que
    // scripts, seeds e testes querem dizer. Dentro de requisição ela entrega a
    // barbearia do contexto — coberto em `tests/host-tenant.test.ts`.
    expect(tenantAtual()).toEqual(TENANT_UNICO);
  });
});

describe('caminho de mídia — escopo por tenant', () => {
  it('mantém o caminho legado para a barbearia única', () => {
    // Os arquivos já estão no disco assim e os caminhos estão gravados no banco.
    // Mudar isso agora quebraria a instância que está em produção.
    expect(pastaDeMidia('logo')).toMatch(/uploads[/\\]logo$/);
    expect(urlDeMidia('logo', 'abc.png')).toBe('/api/media/logo/abc.png');
  });

  it('escopa por slug assim que existe um tenant de verdade', () => {
    expect(pastaDeMidia('logo', OUTRO)).toMatch(/uploads[/\\]vintage[/\\]logo$/);
    expect(urlDeMidia('logo', 'abc.png', OUTRO)).toBe('/api/media/vintage/logo/abc.png');
  });

  it('nenhum tipo de mídia escapa do escopo', () => {
    for (const tipo of ['logo', 'hero', 'og', 'favicon', 'galeria'] as const) {
      expect(pastaDeMidia(tipo, OUTRO)).toContain('vintage');
      expect(urlDeMidia(tipo, 'x.png', OUTRO)).toContain('/vintage/');
    }
  });

  it('barbearias diferentes nunca compartilham pasta', () => {
    const a = pastaDeMidia('galeria', { id: 2, slug: 'a', status: 'active', domain: null });
    const b = pastaDeMidia('galeria', { id: 3, slug: 'b', status: 'active', domain: null });
    expect(a).not.toBe(b);
  });
});
