# Briefing — página inicial do Barbearia no Ar

> Para entregar ao Claude Design. Atualizado: 2026-08-30 (v2 — paleta clara).
> ⚠️ **Desde 08/10/2026 o produto se chama Fadeline** (provisório —
> `docs/PENDENCIAS-ABERTAS.md` §0.1). Este texto é de 30/08 e usa o nome antigo; na
> página, o nome vem de `NOME_PRODUTO`, em `src/config.ts`.
>
> Este documento descreve **o que a página precisa fazer**, não como codar. Onde
> há número (cor, tempo, tamanho), ele é decisão tomada, não sugestão.
>
> **Mudou da v1:** a página era escura com acento cobre. Agora é **clara com acento
> verde**. Tudo abaixo já reflete a paleta nova.

---

## 1. O que é e para quem

**Barbearia no Ar** vende, para donos de barbearia pequena, um **site próprio com
agendamento online** — montado à mão por uma pessoa, entregue pronto, cobrado como
mensalidade sem taxa de instalação.

**Quem lê a página:** dono de barbearia de 1 a 3 profissionais, no interior do Rio
Grande do Norte. Entre 25 e 50 anos. Não é técnico. Vai abrir **no celular**,
provavelmente em 4G, provavelmente depois de receber o link no WhatsApp de alguém.
Ele não procura "software de gestão" — ele reclama que perde horário no WhatsApp e
que não aparece no Google.

**O que a página tem que conseguir:** que ele chegue no fim entendendo o que é, quanto
custa, e clique no botão do WhatsApp. Não há cadastro, não há checkout. O sucesso da
página é uma conversa começada.

## 2. Estrutura, nesta ordem

1. **Topo** — nome, link "Como fica", botão de WhatsApp
2. **Chamada principal** — título, subtítulo, dois botões, linha de contexto local
3. **O problema** — três dores que ele reconhece
4. **O que ele recebe** — seis blocos
5. **A diferença** — tabela comparando com aplicativo de agendamento, no eixo *quem monta*
6. **Como funciona** — quatro passos
7. **Preço** — mensal e anual lado a lado, "sem taxa de instalação" em destaque
8. **Perguntas** — sete, em acordeão
9. **Fechamento** — chamada final para WhatsApp
10. **Rodapé** — nome, cidade, ano

O conteúdo de texto já existe e está escrito. **Não reescrever a copy** — a
estrutura acima é o que precisa ganhar vida visual.

---

## 3. Conceito visual — e o risco que ele traz

O tom é **claro, limpo e profissional**: fundo gelo, cartões brancos, texto grafite,
verde só na ação. A referência é software de gestão sério — legível no sol, do lado de
fora da barbearia, num celular mediano.

**O risco desta escolha, dito na cara:** fundo `#F8FAFC` + texto grafite + botão verde é
literalmente a mesma receita de centenas de SaaS. Sozinha, ela produz uma página que
poderia estar vendendo software de contabilidade. E isso é fatal aqui, porque o
argumento de venda inteiro é *"não é mais um aplicativo genérico"* — se a página parecer
genérica, ela contradiz o próprio texto antes de ninguém ler o texto.

**Então a identidade de barbearia precisa vir de outro lugar, e são quatro coisas:**

1. **A tipografia serifada nos títulos.** É o carregador principal. Sem ela, a página
   é um CRM. Ver §5.
2. **A peça do celular** (§6.1), que mostra sites de barbearia de verdade — escuros,
   quentes, com foto — dentro de uma moldura escura. O contraste com o fundo claro da
   página faz esse bloco virar o centro visual, e é ele que diz "barbearia".
3. **O rodapé escuro** `#111827`, que fecha a página com peso e evita a sensação de
   folha de papel infinita.
4. **Espaço em branco generoso e layout editorial** — colunas largas, títulos grandes,
   pouca coisa por tela. Densidade alta é o que faz uma página parecer ferramenta
   administrativa.

**Não usar como muleta:** ícone de tesoura, poste de barbeiro listrado, navalha, bigode.
Isso é clipart de barbearia, não identidade — e envelhece a página em um ano.

## 4. Paleta — valores definidos e conferidos

Todos os contrastes abaixo foram calculados (WCAG 2.1). Os que **falham** estão
marcados, e existem justamente para você não usar.

### 4.1 Superfícies e texto

| Papel | Hex | Uso | Contraste |
|---|---|---|---|
| Fundo | `#F8FAFC` | fundo da página | — |
| Cartão / seção alternada | `#FFFFFF` | blocos, cartões, seções intercaladas | — |
| Linha | `#E2E8F0` | bordas de cartão sobre branco | decorativa |
| Linha forte | `#CBD5E1` | divisórias sobre o fundo gelo | decorativa |
| **Texto principal** | `#111827` | títulos e corpo | **16,96:1** ✓ |
| Texto secundário | `#475569` | parágrafos de apoio | **7,24:1** ✓ |
| Texto terciário | `#64748B` | legendas, rodapé de seção | **4,55:1** ✓ — é o piso |
| ~~Texto apagado~~ | ~~`#94A3B8`~~ | **não usar em texto** | 2,45:1 ✗ reprova |

`#64748B` é o limite. Abaixo dele, no celular ao sol, some.

### 4.2 Verde — a regra que não pode ser quebrada

`#16A34A` sobre branco dá **3,30:1**. Isso **reprova** o critério de texto (precisa de
4,5:1). Ou seja: **texto branco em cima de um botão `#16A34A` é ilegível pelo padrão.**
É o erro que essa paleta produz por padrão, e o que faz o mesmo verde funcionar em um
site e falhar em outro.

A saída não é trocar o verde. É **inverter o texto do botão**:

| Elemento | Fundo | Texto | Contraste |
|---|---|---|---|
| **Botão principal** | `#16A34A` | `#111827` **grafite** | **5,38:1** ✓ |
| **Botão principal, hover** | `#22C55E` (clareia) | `#111827` grafite | **7,79:1** ✓ |
| ~~Botão com texto branco~~ | ~~`#16A34A`~~ | ~~`#FFFFFF`~~ | 3,30:1 ✗ **proibido** |
| **Verde como texto** sobre claro | — | `#15803D` | **4,79:1** ✓ |
| ~~Verde `#16A34A` como texto~~ | — | ~~`#16A34A`~~ | 3,15:1 ✗ **proibido** |
| Verde sobre o rodapé escuro | `#111827` | `#4ADE80` | **10,18:1** ✓ |

**Resumo em uma frase:** `#16A34A` é cor de **preenchimento e ícone**, nunca cor de
letra; quando o verde precisar virar texto, ele escurece para `#15803D`.

O botão clarear no hover em vez de escurecer é intencional: com texto grafite, clarear
aumenta o contraste e dá a sensação de "acendeu".

### 4.3 Verde de marca vs. verde do WhatsApp

A página tem **seis botões que levam ao WhatsApp**, e agora a cor de ação também é
verde. Isso não é um conflito — praticamente toda ação principal da página *é* falar no
WhatsApp, então verde é coerente. Mas há uma armadilha:

- **O ícone do WhatsApp deve ser sempre monocromático**, herdando a cor do texto do
  botão (`#111827`). **Nunca** usar o logo oficial na cor dele (`#25D366`).
- Motivo: `#16A34A` e `#25D366` são próximos mas diferentes. Lado a lado, parece uma
  tentativa falha de acertar a cor do WhatsApp — lê como erro, não como marca.

**O botão secundário** ("Ver como fica" → `/demo`) **não é verde**: contorno `#CBD5E1`
com texto `#111827`, fundo transparente. Precisa ser obviamente diferente do principal,
senão a página tem dois botões competindo em toda dobra.

## 5. Tipografia — o item mais importante deste documento

- **Títulos: Playfair Display (serifada).** Em fundo escuro ela era um detalhe elegante;
  em fundo claro ela é **a coisa que impede a página de virar um CRM**. Usar com
  convicção: títulos de seção grandes (36–48px no desktop), peso alto.
- A assinatura visual é o **contraste romano/itálico** dentro do mesmo título — a
  segunda linha em itálico, na cor `#15803D`. Exemplo, no título principal:
  *"O site da sua barbearia. **Pronto, no ar, sem você montar nada.**"*
- **Texto: Inter.** Base 16px, nunca menor que 14px em parágrafo.
- **Não** usar Playfair em texto corrido, botão, rótulo ou tabela. Só título.
- As duas fontes já estão no projeto.

## 6. Animações e interações

**O princípio:** movimento que ajuda a ler, nunca movimento que chama atenção para si.
Se o usuário percebe a animação como animação, ela falhou.

Uma diferença prática do fundo claro: **sombra agora funciona.** No fundo escuro anterior
a única ferramenta de elevação era a borda; aqui, sombras suaves são o recurso natural e
devem substituir boa parte dos efeitos de borda.

### 6.1 A peça central — o celular que troca de barbearia

Na chamada principal, à direita (embaixo no celular), uma **moldura de celular escura
(`#111827`) mostrando o site de uma barbearia**. A cada 4 segundos ela troca para outra
barbearia: nome diferente, cor diferente, foto diferente. Transição por esmaecimento de
500ms.

**Por que isso importa mais que qualquer outra animação:** o argumento de venda inteiro
é "o site fica com a cara da SUA barbearia". Uma frase dizendo isso convence menos que
ver acontecer. Três variações bastam.

Na página clara essa peça ganha função dupla: além de provar a promessa, é o bloco
escuro e quente que dá personalidade de barbearia à tela. **Ela deve ter presença
visual — sombra ampla e suave, tamanho generoso.** Se ficar pequena e discreta, a página
perde o único elemento que a diferencia.

*As imagens dessa peça ainda não existem. Enquanto não existirem, usar blocos de cor
sólida com o nome fictício por cima — nunca fotos de barbearias reais que não deram
autorização.*

### 6.2 Sinal "no ar"

Ao lado do nome, no topo, **um ponto de 6px em `#16A34A` pulsando** em ciclo de
2 segundos — opacidade de 100% a 40% e volta. É a única animação que roda o tempo todo
na página, e é o que amarra o nome ao comportamento. (No rodapé escuro, se repetido,
usar `#4ADE80`.)

### 6.3 Entrada por rolagem

Blocos entram com **esmaecimento e subida de 12px**, duração 300ms, em cascata de 60ms
entre irmãos. **Uma vez só** — quem rola de volta não vê de novo. Nada de elemento que
aparece e some conforme a rolagem.

### 6.4 Ao passar o mouse

- **Cartões de "o que você recebe":** o cartão sobe 2px e ganha sombra
  (`0 8px 24px rgba(17,24,39,0.08)`), e a borda passa de `#E2E8F0` para `#CBD5E1`.
  200ms. Sem escala, sem sombra colorida, sem borda verde.
- **Linhas da tabela comparativa:** a linha inteira ganha fundo `#F8FAFC` e a célula da
  coluna "Aqui" ganha um ✓ em `#15803D`. Reforça o lado certo sem gritar.
- **Botão principal:** fundo clareia de `#16A34A` para `#22C55E` e o ícone do WhatsApp
  desliza 2px para a direita. 150ms. **O texto continua grafite.**
- **Botão secundário:** a borda escurece para `#94A3B8`. (Aqui `#94A3B8` é permitido —
  é borda, não texto.)
- **Passos do "como funciona":** o círculo com o número ganha fundo `#16A34A` e número
  grafite.

### 6.5 Preço

O cartão do plano anual — o que você quer que ele escolha — tem **borda `#16A34A` de 2px
fixa** (para se destacar do outro cartão em qualquer situação) e um **brilho externo
verde muito sutil que respira** em ciclo de 4 segundos. Sutil de verdade: se ficar
notável, está errado.

### 6.6 Restrições duras

- **`prefers-reduced-motion` deve desligar tudo**, inclusive o ponto pulsando e a troca
  do celular. Sem exceção.
- Nenhuma animação passa de **500ms**.
- **Nada se mexe enquanto o usuário lê.** Nada de texto que muda sozinho, contador que
  sobe, ou carrossel automático de conteúdo — a única exceção é o celular do item 6.1,
  que é imagem, não texto.
- **Sem biblioteca de animação.** CSS e `IntersectionObserver` dão conta de tudo acima.
  O alvo abre em celular mediano no 4G; cada quilobyte de JavaScript custa.
- Sem vídeo de fundo. Sem partículas. Sem cursor customizado. Sem rolagem sequestrada.

## 7. O que NÃO fazer

- **Nenhum depoimento, avaliação ou logo de cliente.** O produto tem zero clientes;
  qualquer prova social hoje seria invenção, e quebra na primeira conversa.
- **Nenhum número inventado** — nada de "mais de 200 barbearias", "98% de satisfação".
- **Nenhuma foto de banco de imagem com pessoa posando de cliente.**
- **Nenhuma afirmação sobre o que os concorrentes não fazem.** Verificado em 30/08/2026:
  o AppBarber tem a funcionalidade "Site do Estabelecimento". A comparação da página é
  sobre **quem monta**, não sobre quem tem site.
- Nada de "revolucionário", "inovador", "plataforma completa". O leitor é um barbeiro,
  não um investidor.
- **Nenhum degradê colorido de fundo, nenhuma malha/blob abstrato, nenhuma ilustração
  de personagem 3D.** É o vocabulário visual padrão de SaaS e é exatamente o que a §3
  manda evitar.
- **Nenhum print de dashboard falso com gráficos inventados.** Se aparecer interface, é
  a interface real; se ela ainda não está pronta para foto, não aparece.

## 8. Estados que precisam existir

- **Celular** é o layout principal, não a adaptação. Desenhar primeiro em 390px.
- Todos os botões precisam de área de toque de no mínimo 44px de altura.
- O acordeão das perguntas abre e fecha com transição de altura de 200ms.
- **Foco visível em tudo que é clicável:** contorno de 2px em `#15803D` com 2px de
  afastamento. (Em fundo claro o verde escuro é a única versão que se enxerga.)
- Estado de rolagem no topo: o cabeçalho ganha fundo `#FFFFFF` e sombra sutil quando a
  página sai do topo. Sem isso, um cabeçalho claro sobre fundo claro some.

## 9. O que já está pronto e deve ser reaproveitado

Existe uma versão funcional desta página em Astro + Tailwind, com toda a copy escrita e
a estrutura das dez seções. **Ela está com a paleta antiga (escura, acento cobre)** —
os tokens vivem em `src/styles/global.css`, dentro de um bloco `@theme` do Tailwind v4,
e a troca de paleta começa por ali.

O que falta é: a conversão para a paleta clara acima, o movimento, a peça do celular, e
o acabamento.

Não recomeçar do zero — partir do que existe.

## 10. Coerência com o resto do produto

O barbeiro vai ver **três telas** e elas precisam parecer a mesma empresa:

| Tela | Quem vê | Paleta |
|---|---|---|
| Esta página de vendas | o dono, antes de comprar | clara, acento verde `#16A34A` |
| Painel administrativo | o dono, todo dia | clara (`#F8FAFC` + cartões brancos), acento verde `#16A34A` |
| Site público da barbearia dele | os clientes dele | escura e quente, cor de destaque **dele** |

As duas primeiras são a marca do Barbearia no Ar e compartilham a paleta. A terceira é a
marca do cliente, e é **proposital** que seja diferente — é o produto, não a embalagem.
