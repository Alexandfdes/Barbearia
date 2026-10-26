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

Páginas: `/` (vendas) · `/demo` · `/acessar`, que leva à tela de entrar do painel central
(`URL_PAINEL`). O cadastro e a cobrança moram no app da barbearia (`/cadastrar`).

Em produção, três variáveis decidem para onde os botões levam: `CADASTRO_ABERTO=1` (a mesma do
app da barbearia), `URL_CADASTRO` e `URL_PAINEL`. Sem as duas últimas, eles apontam para o
`localhost` — ver `src/config.ts`.

⚠️ **Saíram em 26/10/2026:** `/onboarding`, `/obrigado`, `/entrar` e `/envios` — o formulário e a
caixa de entrada da montagem assistida, que o autoatendimento substituiu. O formulário aceitava 30
arquivos de 15 MB de qualquer pessoa, sem senha nem limite, e o `/obrigado` público prometia "eu monto
o seu site". Com eles saíram o banco SQLite deste app e o `better-sqlite3`. Continuam no histórico do git.

## Antes de publicar

1. **O nome do produto** é `Fadeline`, provisório desde 08/10 — `NOME_PRODUTO` em `src/config.ts`.
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

## A cobrança

Existe desde 10/10/2026, no app da barbearia (`apps/barbearia/src/lib/cobranca.ts`), pelo Checkout da
Asaas no fim do teste grátis — não aqui.
