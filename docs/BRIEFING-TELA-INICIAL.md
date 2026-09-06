# Tela inicial do Barbearia no Ar — estado e histórico

> **O que é:** o registro do que a página inicial de vendas é hoje, e do caminho
> até aqui. Atualizado: 06/09/2026.
>
> **Status: implementado.** O que está descrito abaixo foi verificado rodando em
> 06/09, não de memória. O código vive em `apps/vendas/`, na branch `monorepo`.
>
> **Companheiros:** `PRECIFICACAO.md` (preço e o que é incluso),
> `ESTADO-ATUAL.md` (onde o código está), `MONOREPO.md` (por que um repositório só).
>
> ⚠️ **A copy não está mais neste documento.** Existia aqui um
> COPY-TELA-INICIAL.md (sem crase de propósito: o arquivo não existe mais) com o
> texto das dez seções; ele foi apagado em 06/09
> porque virou uma cópia desatualizada do código — dizia R$ 180 quando o preço
> já era R$ 100, e prometia domínio próprio incluso depois que isso deixou de
> ser verdade. **A copy verdadeira é `apps/vendas/src/pages/index.astro`**, nos
> arrays do frontmatter (`dores`, `entregas`, `passos`, `faq`) e no markup.

---

## 1. O que a página é

Página única de vendas, sem cadastro e sem checkout. O sucesso dela é **uma
conversa começada no WhatsApp**. Dez seções, na ordem: topo · chamada principal ·
o problema · o que você recebe · a diferença (eixo *quem monta*) · como funciona ·
preço · perguntas · fechamento · rodapé.

**Quem lê:** dono de barbearia de 1 a 3 profissionais, interior do RN, 25 a 50
anos, no celular, provavelmente em 4G, provavelmente com o link vindo do WhatsApp
de alguém.

## 2. Paleta — escura, e os números

Decidida em 31/08/2026. Todo valor foi calculado (WCAG 2.1 AA) contra a
superfície onde é usado. **Auditado na página renderizada em 06/09: 125
elementos de texto, 0 reprovações.**

| Papel | Token | Hex |
|---|---|---|
| Fundo | `--color-ground` | `#12161f` |
| Cartão | `--color-card` | `#1b2330` |
| Elevação no hover | `--color-card-hover` | `#232d3d` |
| Borda | `--color-line` | `#2b3750` |
| Divisória | `--color-line-strong` | `#3c4a63` |
| Texto | `--color-ink` | `#f5efe6` — 15,83 / 13,82 / 17,42 |
| Texto secundário | `--color-ink-soft` | `#c3ccd9` — 11,17 / 9,75 / 12,29 |
| Texto terciário | `--color-ink-mute` | `#a8b3c2` — 8,53 / 7,44 / 9,38 (piso) |
| Verde de preenchimento | `--color-brand` | `#16a34a` |
| Verde no hover | `--color-brand-hover` | `#22c55e` |
| Verde como letra | `--color-brand-text` | `#4ade80` |
| **Texto sobre o verde** | `--color-on-brand` | `#111827` — 5,38:1 |
| Faixa funda (véu, rodapé) | `--color-dark` | `#07090e` |

*(as três razões do texto são contra ground / card / dark)*

### ⚠️ A armadilha, e ela é dupla

**`--color-on-brand` existe porque `--color-ink` é claro.** Texto creme sobre o
verde dá **2,9:1** e reprova. Todo texto em cima de preenchimento verde usa
`--color-on-brand`, nunca `--color-ink`. Verificado: as 6 ocorrências na página
usam o token certo.

**A regra do botão sobreviveu à inversão da paleta:** fundo verde + texto
grafite (5,38:1), e no hover o fundo **clareia** para `#22c55e` (7,79:1). Com
letra grafite, clarear aumenta o contraste.

O que mudou com o escuro: em fundo claro o verde **escurecia** para virar texto
(`#15803d`); em fundo escuro ele **clareia** (`#4ade80`).

Detalhe completo e as regras do site do cliente — que são **invertidas** — na
skill `barbearia-paleta`.

## 3. Tipografia

Playfair Display nos títulos, Inter no texto. A assinatura é o contraste
romano/itálico dentro do mesmo título, com a segunda linha em itálico na cor de
destaque. Playfair **não** vai em texto corrido, botão, rótulo ou tabela.

## 4. Movimento — o que existe

| Peça | Comportamento |
|---|---|
| Vídeo do hero | barbearia real, autoplay, mudo, em laço, atrás de um véu escuro |
| Ponto "no ar" | 6px, pulsa de 100% a 40% em ciclo de 2s. Única animação contínua |
| Entrada por rolagem | esmaecimento + subida de 12px, 300ms, cascata de 60ms, uma vez só |
| Cartão anual | brilho verde que respira em 4s, `rgba(74,222,128,.14)` |
| Hover dos cartões | sobe 2px e a superfície clareia — em fundo escuro a elevação vem de superfície mais clara, não de sombra |

**Restrições que valem sem exceção:**

- `prefers-reduced-motion` desliga **tudo**, inclusive o ponto e o vídeo
  (`video { display: none }`). Verificado: 43 blocos visíveis, 3 animações
  infinitas zeradas.
- **Sem JavaScript a página funciona inteira** — os blocos só nascem invisíveis
  quando o JS assume (classe `.js` no `<html>`). Verificado: 43 blocos, 0
  invisíveis.
- Sem biblioteca de animação. CSS e `IntersectionObserver`.
- `color-scheme: dark` no `<html>` — sem isso um `<select>` nativo estoura branco
  no meio da página.

**Peso:** o vídeo do hero foi re-codificado de 3,53 MB para **1,15 MB no desktop
e 358 KB no celular**. Ele fica atrás de um véu de 85–95%, então a perda de
qualidade não é percebida.

## 5. O que NÃO fazer

- **Nenhum depoimento, avaliação, logo de cliente ou número inventado.** O
  produto tem zero clientes; qualquer prova social hoje seria invenção.
- **Nenhuma afirmação sobre o que o concorrente não faz sem verificar e datar.**
  A tabela comparativa é sobre **quem monta**. A linha sobre o endereço do site
  existe porque a pesquisa de 01/09 confirmou que os três concorrentes só
  oferecem subdomínio próprio — registrado em `PRECIFICACAO.md` §3.
- **Nenhuma promessa de domínio próprio incluso.** Desde 01/09 o subdomínio é
  incluso e o domínio próprio é opção paga pelo cliente (`PRECIFICACAO.md` §6).
- Nada de degradê colorido, blob abstrato, ilustração 3D, tesoura, poste
  listrado ou navalha. Vocabulário de SaaS genérico e clipart de barbearia
  envelhecem a página em um ano.
- Nada de "revolucionário", "inovador", "plataforma completa".

## 6. O que foi desenhado e nunca construído

**A moldura de celular trocando de barbearia.** O briefing de 30/08 pedia, como
peça central, um celular na chamada principal que trocasse de barbearia a cada 4
segundos — nome, cor e foto diferentes. Era o que **provava** a frase "fica com a
cara da sua barbearia".

O que existe no lugar é vídeo de barbearia genérica: ambienta, mas não prova.
**A promessa central da página segue sem demonstração.**

## 7. Histórico das decisões

Registrado para o debate não voltar em três meses.

### 7.1 A paleta clara — 30/08, revertida em 31/08

O briefing original era escuro com acento cobre. Em 30/08 a paleta foi trocada
para **clara** (`#F8FAFC` + grafite + verde), a pedido, com base numa referência
que recomendava fundo claro para **painel administrativo, checkout e
relatórios** — e não para página de vendas.

**Revertida no dia seguinte.** O motivo, registrado no `global.css`: a paleta
clara caiu exatamente na armadilha que o §3 do próprio briefing previu — fundo
gelo + texto grafite + botão verde é a receita padrão de SaaS, e uma página que
parece software de contabilidade contradiz o argumento de venda antes de alguém
ler o texto. Confirmado pelo dono em 06/09.

**Rejeitado, e por quê:** manter o claro. Perdia a personalidade de barbearia,
que é o argumento inteiro, e destoava do site escuro que o cliente recebe.

⚠️ **Custo real do desvio:** em 06/09 a paleta clara foi reaplicada por engano na
pasta `C:\DEV\produto` — que já estava aposentada. Trabalho jogado fora e uma
hora de confusão. A causa foi não ter lido o `ESTADO-ATUAL.md` antes de começar.

### 7.2 O título — 30/08

Era *"Não um perfil dentro do aplicativo dos outros"*. **Falso:** o AppBarber tem
"Site do Estabelecimento". Trocado por *"Pronto, no ar, sem você montar nada"*,
que afirma o que fazemos em vez de negar o que o outro faz.

**O que se perdeu:** o título novo é verdadeiro e mais fraco. "Sem você montar
nada" só faz efeito em quem já sabe que a alternativa envolve montar — e isso só
aparece na tabela comparativa, bem abaixo da dobra.

### 7.3 O preço — R$ 180 → R$ 100 em 01/09

Ver `PRECIFICACAO.md` §2. Consequência para esta página: com Trinks a R$ 76,
AppBarber a R$ 79,90 e Booksy a R$ 99,99, o produto passou de "outra categoria"
para **paridade de preço** — é o mais caro dos quatro, por um centavo. O eixo
"quem monta" agora carrega o argumento sozinho, sem ajuda do posicionamento de
preço. Vale reler a página com esse olho.

## 8. Origem das imagens — pendente

O vídeo do hero **não tem credencial de origem nenhuma**. Outro vídeo do mesmo
pacote (`fecho.mp4`, não usado) traz assinatura C2PA do Google, ou seja, foi
gerado por IA.

**Antes de publicar comercialmente, confirmar de onde veio o vídeo do hero.** Se
for de banco de imagens, exige licença.
