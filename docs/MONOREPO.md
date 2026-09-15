# Monorepo — os dois projetos num repositório só

> Decisão de estrutura. Data: 2026-09-06. Status: **implementado.**
> Companheiro de `ARQUITETURA-MULTI-TENANT-V1.md`, que decide quantas
> **aplicações** existem. Este decide em quantos **repositórios** elas moram.
>
> Verificado em 06/09/2026: 32 commits de histórico da barbearia preservados,
> 1 commit do site de vendas preservado via `git subtree`, nenhum arquivo
> perdido (conferido por checksum).

---

## 1. A confusão que este documento desfaz

`ARQUITETURA-MULTI-TENANT-V1.md` §2 decide **três aplicações**: site público,
painel e site de vendas. Isso é sobre o que roda e o que faz deploy separado.

**Não é a mesma pergunta que "quantos repositórios".** Um repositório pode gerar
três aplicações. Separar o deploy não obriga a separar o código — e antes de
06/09/2026 nenhum documento tinha decidido isso.

## 2. A decisão

**Um repositório, dois aplicativos hoje, três depois.**

```
barbearia-no-ar/
  apps/barbearia/     site público + painel (ainda juntos; separam no passo 6)
  apps/vendas/        landing, /onboarding, /envios, cobrança
  docs/               decisões de produto e arquitetura
  migracao-postgres/  o porte para Postgres, pronto e não aplicado
  CLAUDE.md           orientação de trabalho
```

`packages/core/` nasce no passo 6, com o que for compartilhado de verdade.

### Por que, em uma frase

As três aplicações falam com o **mesmo** Postgres — inclusive o site de vendas,
que é quem cria a barbearia no onboarding e quem a marca como suspensa quando
não paga. A definição das tabelas precisa ser idêntica nas três.

Em repositórios separados ela vira três cópias sincronizadas na mão. O dia em que
desencontrarem, o defeito é o pior tipo: o site de vendas marca a barbearia como
suspensa, o painel continua deixando o barbeiro entrar, e a descoberta é pelo
extrato.

Segundo motivo, menor: a regra de que o resolvedor de tenant é **um módulo só**
(`ARQUITETURA-MULTI-TENANT-V1.md` §3) é impossível de cumprir de verdade com o
código em três repositórios.

### Rejeitado: três repositórios, um por aplicação

Custo: schema duplicado três vezes, lógica de agendamento duplicada ou publicada
como pacote npm — versionamento e publicação para um desenvolvedor só.

Contraria a regra que já estava escrita em `PLANO-PRODUTIZACAO.md`: *"Uma única
base de código. Nunca um fork por cliente."* Três repositórios com o schema
copiado é um fork por aplicação.

### Rejeitado: site público isolado dos outros dois

É a pior das opções. O site é justamente o que mais compartilha com o painel —
mesma lógica de horários, mesmo agendamento, mesmas configurações da barbearia.
Isolar o site separa o par que mais anda junto.

### Rejeitado: manter os dois repositórios de antes

Defensável, e era o que menos mexia. Mas não escapa do problema principal: o site
de vendas continua escrevendo no mesmo banco, então a definição das tabelas
continua duplicada — e justamente na tabela de barbearias e status de pagamento,
onde o desencontro custa dinheiro.

### Por que agora

Juntar depois é caro; separar depois é fácil. Em 06/09/2026 os dois repositórios
do GitHub tinham **1 commit cada** — nada de histórico a preservar do lado de lá.

## 3. ⚠️ O que o deploy precisa saber

O `Dockerfile` está em `apps/barbearia/` e **não mudou**. Ele faz `COPY . .` a
partir do contexto de build.

**Antes de subir isto para a `main`, o build precisa apontar para
`apps/barbearia` como contexto, não para a raiz do repositório.** No EasyPanel é
o campo de caminho/contexto do build. Sem esse ajuste o build falha — ele não vai
achar `package.json` na raiz.

O site do Bayron está no ar. Este trabalho foi feito numa branch (`monorepo`),
sem push e sem tocar na `main`, exatamente para que nada disso o alcance antes do
ajuste.

## 4. Por que ainda não tem npm workspaces

Workspaces juntam as dependências num `node_modules` e num `package-lock.json` na
raiz. Isso quebraria o `Dockerfile` atual, que espera `package*.json` ao lado do
código, e o conserto envolve mudar o deploy de um site que está no ar.

Hoje cada app mantém o próprio lock e o próprio `node_modules`, e a raiz só tem
atalhos (`npm run dev`, `npm run dev:vendas`). Funciona, e não mexe no deploy.

**Workspaces entram junto com `packages/core`**, no passo 6, quando houver código
de verdade para compartilhar e o `Dockerfile` for ajustado no mesmo commit. Fazer
antes seria pagar o risco sem receber o benefício.

## 5. ✅ Resolvido de quebra: a colisão da porta 4321

Os dois projetos rodavam em 4321. Um 404 em `/admin` normalmente significava que
o servidor no ar era o outro projeto — o `CLAUDE.md` tinha um aviso permanente
sobre isso.

Com os dois no mesmo lugar, deixou de ser aviso e virou conserto: o site de
vendas agora fixa `--port 4322` no próprio `package.json`. Os dois sobem juntos.

⚠️ **Correção de 15/09/2026: fixar uma porta só não bastou.** O site de vendas estava
fixo em 4322 e o app da barbearia não estava fixo em nada — pegava a primeira porta
livre a partir da 4321. Com um servidor velho pendurado, ele pulava para 4322, depois
4323, **e avisava numa linha do log que ninguém lê**:

```
[vite] Port 4321 is in use, trying another one...
```

O estrago: horas perseguindo fantasma, com uma aplicação respondendo no endereço da
outra e cada afirmação sobre "qual app está em qual porta" saindo errada.

Agora as duas são fixas **e recusam subir** se a porta estiver ocupada:

| Porta | Aplicação |
|---|---|
| **4321** | `apps/barbearia` — site das barbearias **e** painel |
| **4322** | `apps/vendas` — landing do produto |

```
astro dev --port 4321 --strictPort
astro dev --port 4322 --strictPort
```

**Servidor que troca de porta em silêncio é pior que servidor que não sobe.** No segundo
caso você descobre em um segundo; no primeiro, depois de meia hora de confusão.

⚠️ E a 4321 deixou de ser só conveniência: `DOMINIO_BASE=localhost:4321` é o que faz o
link "Ver meu site" do painel funcionar em desenvolvimento (ver §5.1). Se a porta escorrega,
o link quebra.

## 5.1 Ver o multi-tenant funcionando em `localhost`

Os navegadores resolvem **qualquer** `*.localhost` para 127.0.0.1, sem mexer no arquivo
`hosts`. Isso permite exercitar o caminho de produção inteiro na máquina de
desenvolvimento:

```powershell
$env:DOMINIO_BASE = "localhost:4321"
npm run dev
```

```
http://barbeariasalaojovem.localhost:4321
http://barbearia-vintage.localhost:4321
```

Duas barbearias, dois endereços, **um processo só**. `resolverHost()` pega o primeiro
rótulo exatamente como faria com `barbeariasalaojovem.barbearianoar.com.br`, e sem
precisar preencher a coluna `domain` à mão.

⚠️ `urlDoSite()` usa `http` para `localhost` e `127.0.0.1`, e `https` para o resto — o
servidor de desenvolvimento não tem TLS.

## 6. ⚠️ A armadilha que a mudança criou

O `.gitignore` protegia o banco e os uploads com padrões **ancorados na raiz**:

```
data/**/*.db
data/uploads/
```

Quando o app foi para `apps/barbearia/`, esses padrões deixaram de casar e o git
passou a querer versionar o banco com **nome, telefone e data de nascimento dos
clientes reais do Bayron**. Foi pego antes do commit.

Agora são `**/data/**/*.db` e `**/data/uploads/`, com o mesmo tratamento para
`node_modules`, `dist`, `.astro` e `.env`.

**Regra do monorepo: padrão de conteúdo sensível nunca é ancorado na raiz.**
Verificado em 06/09/2026: nenhum banco ou upload entrou no histórico, em nenhum
momento.

## 7. O que muda nos outros documentos

| Documento | O que fica desatualizado |
|---|---|
| `CLAUDE.md` | A tabela de duas pastas separadas — já atualizada |
| `PENDENCIAS-ABERTAS.md` | §2.3 dizia que o site de vendas não tinha controle de versão. Agora tem, e está no mesmo histórico |
| `ARQUITETURA-MULTI-TENANT-V1.md` | §9 passo 6 dizia "separar os dois apps" sem dizer em quê. Passa a ser: separar `apps/barbearia` em `apps/site` e `apps/painel`, extraindo `packages/core` |

Nenhum desses documentos foi alterado além do `CLAUDE.md`: o passo 6 ainda não
foi implementado, e documento que descreve sistema inexistente é exatamente o
problema que se quer evitar.

## 8. Separar `apps/barbearia` em site e painel — o gatilho

O §7 registra a ideia. Falta o **quando**, e em 15/09/2026 apareceu a primeira evidência
a favor dela.

**O argumento.** Hoje um processo só precisa responder "de quem é esta requisição" de
**duas formas**: pela sessão (painel) e pelo endereço (site). O resolvedor tem que
escolher uma ordem, e a ordem errada produz defeito silencioso.

Foi o que aconteceu: o dono de uma barbearia recém-criada abriu o painel dele e leu no
topo da tela o nome de **outra** barbearia. Separados, a pergunta ambígua deixaria de
existir — o painel só olharia sessão, o site só olharia host.

**Por que NÃO foi feito agora.** Separar duplica layout, componentes, camada de dados e
deploy, e exige extrair um `packages/core`. É custo alto para consertar um defeito que
saiu com três linhas no `src/middleware.ts` e ficou travado por teste.

⚠️ **O gatilho, então, é este: um SEGUNDO defeito da mesma família** — qualquer coisa em
que sessão e endereço briguem pela mesma requisição. Um defeito é acidente; dois é a
arquitetura avisando.

O candidato mais provável já está mapeado, e ainda não foi decidido: o resolvedor faz a
**sessão ganhar do host em toda requisição**, inclusive nas páginas públicas. Com um dono
logado, abrir o endereço de outra barbearia renderiza o site dele na URL dela.
