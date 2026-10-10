// O módulo de e-mail (`src/lib/email.ts`): a forma do endereço, para onde o
// e-mail vai em cada ambiente, e o SMTP de verdade — contra um servidor SMTP de
// mentira, aberto aqui mesmo, na porta local.
//
// Não precisa de banco.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

let email: typeof import('../src/lib/email.ts');

beforeAll(async () => {
  email = await import('../src/lib/email.ts');
}, 30_000);

describe('a forma do e-mail', () => {
  it('grava sem espaço nas pontas e em minúsculas; vazio vira null', () => {
    expect(email.normalizarEmail('  Ze@Gmail.COM ')).toBe('ze@gmail.com');
    expect(email.normalizarEmail('   ')).toBeNull();
    expect(email.normalizarEmail(undefined)).toBeNull();
  });

  it('aceita a forma de e-mail e recusa o resto', () => {
    expect(email.emailValido('ze@gmail.com')).toBe(true);
    expect(email.emailValido('ze.da.silva+barbearia@empresa.com.br')).toBe(true);
    expect(email.emailValido('ze@gmail')).toBe(false);
    expect(email.emailValido('ze gmail.com')).toBe(false);
    expect(email.emailValido('ze@gm ail.com')).toBe(false);
    // Quebra de linha no endereço viraria cabeçalho novo no e-mail.
    expect(email.emailValido('ze@gmail.com\r\nBcc: todo-mundo@x.com')).toBe(false);
    expect(email.emailValido(`${'a'.repeat(250)}@x.com`)).toBe(false);
  });

  it('o log mostra o bastante para achar, sem expor o endereço', () => {
    expect(email.mascararEmail('ze@gmail.com')).toBe('z***@gmail.com');
  });
});

describe('para onde o e-mail vai, em cada ambiente', () => {
  const t = (env: Record<string, string>) => email.transporteDeEmail(env);

  it('teste nunca manda e-mail de verdade — nem com SMTP_URL no ambiente', () => {
    expect(t({ VITEST: 'true', SMTP_URL: 'smtps://u:s@smtp.x.com:465' })).toBe('memoria');
    expect(t({ NODE_ENV: 'test', SMTP_URL: 'smtps://u:s@smtp.x.com:465' })).toBe('memoria');
  });

  it('com SMTP_URL, pelo provedor', () => {
    expect(t({ NODE_ENV: 'production', SMTP_URL: 'smtps://u:s@smtp.x.com:465' })).toBe('smtp');
    expect(t({ NODE_ENV: 'development', SMTP_URL: 'smtp://localhost:1025' })).toBe('smtp');
  });

  it('desenvolvimento sem SMTP_URL: arquivo', () => {
    expect(t({ NODE_ENV: 'development' })).toBe('arquivo');
    expect(t({})).toBe('arquivo');
  });

  it('produção sem SMTP_URL: nenhum — e não finge que mandou', () => {
    expect(t({ NODE_ENV: 'production' })).toBe('nenhum');
    expect(t({ NODE_ENV: 'production', SMTP_URL: '   ' })).toBe('nenhum');
    // A pasta é escolha explícita: dá para ver os e-mails de um build de produção local.
    expect(t({ NODE_ENV: 'production', EMAIL_PASTA: '/tmp/emails' })).toBe('arquivo');
  });

  it('o remetente: EMAIL_REMETENTE manda; senão, o nao-responda do domínio, sem a porta', () => {
    expect(email.remetente({ EMAIL_REMETENTE: 'Suporte <oi@fadeline.com.br>' })).toBe('Suporte <oi@fadeline.com.br>');
    expect(email.remetente({ DOMINIO_BASE: 'fadeline.com.br' })).toMatch(/<nao-responda@fadeline\.com\.br>$/);
    expect(email.remetente({ DOMINIO_BASE: 'localhost:4321' })).toMatch(/<nao-responda@localhost>$/);
    expect(email.remetente({})).toMatch(/<nao-responda@localhost>$/);
  });
});

describe('enviarEmail, nos testes', () => {
  beforeEach(() => { email.caixaDeSaida.length = 0; });

  it('vai para a caixa de saída da memória, com o remetente', async () => {
    await email.enviarEmail({ para: 'Dono@Barbearia.com', assunto: 'Oi', texto: 'corpo' });
    expect(email.caixaDeSaida).toHaveLength(1);
    expect(email.caixaDeSaida[0]).toMatchObject({ para: 'dono@barbearia.com', assunto: 'Oi', texto: 'corpo' });
    expect(email.caixaDeSaida[0].de).toMatch(/nao-responda@/);
  });

  it('quebra de linha no assunto não vira cabeçalho', async () => {
    // O nome da barbearia entra no assunto, e ele vem de um formulário público.
    await email.enviarEmail({ para: 'ze@x.com', assunto: 'Barbearia\r\nBcc: todos@x.com', texto: '.' });
    expect(email.caixaDeSaida[0].assunto).toBe('Barbearia Bcc: todos@x.com');
  });

  it('destinatário sem forma de e-mail é recusado, com o motivo', async () => {
    await expect(email.enviarEmail({ para: 'ze@gmail', assunto: 'x', texto: 'x' }))
      .rejects.toBeInstanceOf(email.EmailNaoEnviado);
    expect(email.caixaDeSaida).toHaveLength(0);
  });
});

describe('o transporte de arquivo — o do desenvolvimento', () => {
  let pasta: string;
  beforeAll(() => { pasta = mkdtempSync(join(tmpdir(), 'emails-')); });
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));

  it('grava um .txt legível, com cabeçalho e corpo', () => {
    const caminho = email.gravarEmArquivo({
      para: 'ze@gmail.com', assunto: 'Senha nova', texto: 'Abra: http://x/y?token=abc',
      de: 'Produto <nao-responda@localhost>', respostaPara: null, enviadoEm: new Date('2026-10-09T15:00:00Z'),
    }, pasta);
    expect(readdirSync(pasta)).toHaveLength(1);
    const conteudo = readFileSync(caminho, 'utf8');
    expect(conteudo).toContain('Para: ze@gmail.com');
    expect(conteudo).toContain('Assunto: Senha nova');
    expect(conteudo).toContain('Abra: http://x/y?token=abc');
  });
});

// ── O SMTP de verdade, contra um servidor de mentira ─────────────────────────
//
// Um servidor SMTP mínimo: responde ao EHLO sem oferecer TLS, aceita remetente e
// destinatário — ou recusa o destinatário, para o caso de erro — e guarda a
// mensagem. É o bastante para provar que o `nodemailer` monta e entrega o e-mail
// pela rede, sem depender de provedor nenhum.
interface Recebido { de: string; para: string; dados: string }

function servidorSmtp(recusarDestinatario = false): Promise<{ porta: number; recebidos: Recebido[]; fechar: () => Promise<void> }> {
  const recebidos: Recebido[] = [];
  const conexoes = new Set<Socket>();
  const servidor: Server = createServer((socket: Socket) => {
    conexoes.add(socket);
    socket.on('close', () => conexoes.delete(socket));
    let atual: Recebido = { de: '', para: '', dados: '' };
    let lendoDados = false;
    let resto = '';
    socket.write('220 teste ESMTP\r\n');
    socket.on('data', (pedaco: Buffer) => {
      resto += pedaco.toString('utf8');
      if (lendoDados) {
        const fim = resto.indexOf('\r\n.\r\n');
        if (fim === -1) return;
        atual.dados = resto.slice(0, fim);
        resto = resto.slice(fim + 5);
        lendoDados = false;
        recebidos.push(atual);
        atual = { de: '', para: '', dados: '' };
        socket.write('250 OK guardado\r\n');
      }
      let quebra: number;
      while (!lendoDados && (quebra = resto.indexOf('\r\n')) !== -1) {
        const linha = resto.slice(0, quebra);
        resto = resto.slice(quebra + 2);
        const comando = linha.slice(0, 4).toUpperCase();
        if (comando === 'EHLO' || comando === 'HELO') socket.write('250-teste\r\n250 8BITMIME\r\n');
        else if (comando === 'MAIL') { atual.de = linha; socket.write('250 OK\r\n'); }
        else if (comando === 'RCPT') {
          if (recusarDestinatario) socket.write('550 caixa inexistente\r\n');
          else { atual.para = linha; socket.write('250 OK\r\n'); }
        }
        else if (comando === 'DATA') { lendoDados = true; socket.write('354 pode mandar\r\n'); }
        else if (comando === 'RSET') { atual = { de: '', para: '', dados: '' }; socket.write('250 OK\r\n'); }
        else if (comando === 'QUIT') { socket.write('221 tchau\r\n'); socket.end(); }
        else socket.write('250 OK\r\n');
      }
    });
  });
  return new Promise((ok) => {
    servidor.listen(0, '127.0.0.1', () => {
      const porta = (servidor.address() as AddressInfo).port;
      ok({
        porta,
        recebidos,
        fechar: () => new Promise<void>((pronto) => {
          for (const c of conexoes) c.destroy();
          servidor.close(() => pronto());
        }),
      });
    });
  });
}

describe('o SMTP, pela rede', () => {
  const mensagem = () => ({
    para: 'dono@barbearia.com',
    assunto: 'Senha nova do painel — teste',
    texto: 'Olá, Zé.\n\nAbra o link: https://painel.exemplo.com.br/admin/nova-senha?token=abc123\n',
    de: 'Produto <nao-responda@exemplo.com.br>',
    respostaPara: 'suporte@exemplo.com.br',
    enviadoEm: new Date(),
  });

  it('entrega: remetente, destinatário, assunto e corpo chegam ao servidor', async () => {
    const smtp = await servidorSmtp();
    try {
      await email.enviarPorSmtp(mensagem(), `smtp://127.0.0.1:${smtp.porta}`);
      expect(smtp.recebidos).toHaveLength(1);
      const r = smtp.recebidos[0];
      expect(r.de).toContain('nao-responda@exemplo.com.br');
      expect(r.para).toContain('dono@barbearia.com');
      expect(r.dados).toMatch(/^Reply-To: suporte@exemplo\.com\.br/m);
      // O assunto tem acento: sai codificado, como manda o protocolo.
      expect(r.dados).toMatch(/^Subject: =\?UTF-8\?/m);
      // O link precisa chegar inteiro e clicável — um token quebrado não abre nada.
      const corpo = r.dados.replace(/=\r\n/g, '').replace(/=3D/g, '=');
      expect(corpo).toContain('https://painel.exemplo.com.br/admin/nova-senha?token=abc123');
    } finally {
      await smtp.fechar();
    }
  }, 20_000);

  it('o provedor recusa: EmailNaoEnviado, com o motivo dele', async () => {
    const smtp = await servidorSmtp(true);
    try {
      const falha = await email.enviarPorSmtp(mensagem(), `smtp://127.0.0.1:${smtp.porta}`).catch((e) => e);
      expect(falha).toBeInstanceOf(email.EmailNaoEnviado);
      expect(String(falha.message)).toMatch(/550|caixa inexistente/);
      expect(smtp.recebidos).toHaveLength(0);
    } finally {
      await smtp.fechar();
    }
  }, 20_000);

  it('provedor fora do ar: EmailNaoEnviado', async () => {
    const smtp = await servidorSmtp();
    const porta = smtp.porta;
    await smtp.fechar(); // a porta agora recusa conexão
    await expect(email.enviarPorSmtp(mensagem(), `smtp://127.0.0.1:${porta}`)).rejects.toBeInstanceOf(email.EmailNaoEnviado);
  }, 20_000);

  it('provedor que aceita a conexão e não responde: desiste em segundos, não nos minutos do padrão', async () => {
    // O padrão do nodemailer espera 30 s pela saudação e 10 min de silêncio. Com
    // ele, um provedor travado seguraria a tarefa de avisos por horas.
    const conexoes = new Set<Socket>();
    const mudo = createServer((s: Socket) => { conexoes.add(s); });
    await new Promise<void>((ok) => mudo.listen(0, '127.0.0.1', () => ok()));
    const porta = (mudo.address() as AddressInfo).port;
    const inicio = Date.now();
    try {
      await expect(email.enviarPorSmtp(mensagem(), `smtp://127.0.0.1:${porta}`)).rejects.toBeInstanceOf(email.EmailNaoEnviado);
      expect(Date.now() - inicio).toBeLessThan(15_000);
    } finally {
      for (const c of conexoes) c.destroy();
      await new Promise<void>((ok) => mudo.close(() => ok()));
    }
  }, 30_000);
});
