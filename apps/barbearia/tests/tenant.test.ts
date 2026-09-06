import { describe, it, expect } from 'vitest';
import {
  tenantDoHost, tenantDaSessao, tenantAtual, TENANT_UNICO, type Tenant,
} from '../src/lib/tenant.js';
import { pastaDeMidia, urlDeMidia } from '../src/lib/uploads.js';

/** Como um tenant de verdade vai ser depois do passo 3. */
const OUTRO: Tenant = { id: 7, slug: 'vintage', status: 'active' };

describe('resolvedor de tenant — a costura', () => {
  it('nunca devolve nulo, seja qual for a entrada', () => {
    const lixo = [
      new Request('https://qualquer.coisa/'),
      new Request('https://vintage.barbearianoar.com.br/agendar'),
    ];
    for (const req of lixo) {
      expect(tenantDoHost(req).id).toBeTypeOf('number');
      expect(tenantDoHost(req).slug).toBeTruthy();
    }
    for (const sessao of [null, {}, { tenantId: 99 }]) {
      expect(tenantDaSessao(sessao as any).id).toBeTypeOf('number');
    }
  });

  it('devolve o tenant único enquanto a tabela `tenants` não existe', () => {
    // ⚠️ Este teste DEVE falhar quando o passo 3 for implementado. É de propósito:
    // é o alarme de que os chamadores precisam passar a mandar host e sessão de verdade.
    expect(tenantDoHost(new Request('https://vintage.barbearianoar.com.br/'))).toEqual(TENANT_UNICO);
    expect(tenantDaSessao({ tenantId: 7 })).toEqual(TENANT_UNICO);
    expect(tenantAtual()).toEqual(TENANT_UNICO);
  });

  it('o tenant único tem a forma definitiva, não um objeto improvisado', () => {
    expect(TENANT_UNICO).toHaveProperty('id');
    expect(TENANT_UNICO).toHaveProperty('slug');
    expect(TENANT_UNICO).toHaveProperty('status');
    expect(TENANT_UNICO.status).toBe('active');
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
    const a = pastaDeMidia('galeria', { id: 2, slug: 'a', status: 'active' });
    const b = pastaDeMidia('galeria', { id: 3, slug: 'b', status: 'active' });
    expect(a).not.toBe(b);
  });
});
