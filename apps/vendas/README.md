# Site do produto

Site de vendas e telas de pós-venda do sistema para barbearias. **Projeto separado
do repositório da barbearia de propósito** — se estas páginas morassem lá, o
container de cada cliente serviria uma página vendendo o sistema, e um cliente da
barbearia poderia cair numa oferta sua. Ver `docs/ARQUITETURA-COBRANCA-V1.md` no
projeto da barbearia, seção 2.

## Rodar

```bash
npm install
npm run dev
npm run check   # o conferidor de tipos: zero erro, e o CI reprova o primeiro que aparecer
```

Páginas públicas: `/` (vendas) · `/demo` · `/obrigado` (pós-pagamento) · `/onboarding` (formulário).
`/acessar` leva à tela de entrar do painel central (`URL_PAINEL`), desde 12/10/2026.

Em produção, três variáveis decidem para onde os botões levam: `CADASTRO_ABERTO=1` (a mesma do
app da barbearia), `URL_CADASTRO` e `URL_PAINEL`. Sem as duas últimas, eles apontam para o
`localhost` — ver `src/config.ts`.

Área fechada: `/entrar` → `/envios` (caixa de entrada das implantações).

## Antes de publicar

1. **Trocar o nome do produto.** Está `NOME PROVISÓRIO` em `src/config.ts`. É o único lugar.
2. **Conferir o WhatsApp e o domínio** no mesmo arquivo.
3. **Conferir os preços** — `PRECO` em `src/config.ts`.
4. **Colocar as imagens da demonstração** em `public/demo/`: `site.png`,
   `agendamento.png`, `agenda.png`, `relatorio.png`. Enquanto não existirem, a
   moldura mostra um aviso no lugar. Basta printar o sistema rodando.

### Sobre as fotos da demonstração

⚠️ **Não use as fotos da Barbearia Bayron aqui.** São a marca dele, e os
depoimentos são de clientes reais com nome e sobrenome. Mostrar isso para
barbearias concorrentes da mesma cidade é indefensável — e você ainda não pediu
autorização para citá-lo como case.

Três saídas, em ordem de esforço:

- **Prints do painel administrativo.** Não têm foto de cliente nenhuma, só a
  interface. Seguro e já convence — é a tela que o dono vai usar todo dia.
- **Pedir autorização ao Bayron** para usar o site dele como portfólio. É prova
  social real e ele provavelmente não tem motivo para negar.
- **Montar uma barbearia fictícia** com fotos de banco de imagem licenciadas
  (Unsplash, Pexels). Mais trabalho, e exige apresentar como exemplo — nunca
  como cliente.

## O que ainda não existe

Cobrança. O botão da página de vendas leva para o WhatsApp, de propósito: a conta
no Asaas exige CPF/CNPJ e a integração de assinaturas são umas 20 a 30 horas.
Vender no WhatsApp primeiro custa zero e responde a pergunta que importa — se
alguém compra.

Quando a cobrança existir, `/obrigado` passa a ser o destino do retorno do
pagamento, e o formulário de onboarding ganha o vínculo com o cliente pagante.

## A caixa de entrada (`/envios`)

É onde você vê o que os donos mandaram: lista com protocolo, barbearia, contato e
data, e uma tela por envio com tudo escrito, as fotos na tela e um botão que copia
tudo em texto para colar no seu fluxo de implantação. Cada envio tem um estado —
novo, em andamento, concluído — para a lista virar fila de trabalho e não pilha.

**Exige senha.** Ela mostra telefone e fotos de clientes seus; não pode ficar
aberta. Crie um `.env` na raiz com:

```
ADMIN_SENHA=uma-senha-sua-de-no-minimo-6-caracteres
```

Sem essa variável a área fica **fechada**, não aberta — o padrão é negar. A sessão
dura 12 horas e o cookie é assinado; trocar a senha derruba as sessões abertas.

⚠️ Nada te avisa quando chega um envio. Hoje você abre `/envios` para saber.
Notificação por e-mail é o próximo passo natural quando isso incomodar.

## Onde ficam os envios do formulário

SQLite em `data/produto.db`, tabela `onboarding`. As fotos vão para
`data/uploads/<protocolo>/`. Nenhum dado de cliente final de barbearia passa por
aqui — só o que o dono envia sobre o próprio negócio.
