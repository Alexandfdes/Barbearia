---
name: barbearia-paleta
description: "Paletas e contraste do Barbearia no Ar — as regras de botão do site de vendas e do site da barbearia são INVERTIDAS. Use ao mexer em cor, tema, botão, texto sobre fundo colorido ou na cor de destaque do cliente, em qualquer um dos dois aplicativos do monorepo."
---

# Paleta e contraste — Barbearia no Ar

## A armadilha central

Os dois sites são escuros, usam verde, e têm **regras de botão opostas**. Copiar a regra
de um para o outro produz botão ilegível. Já aconteceu.

| | Site de vendas (`apps/vendas`) | Site da barbearia (`apps/barbearia`) |
|---|---|---|
| Preenchimento do botão | **claro** (verde `#16A34A`) | **escuro** (a cor de destaque do cliente) |
| Texto em cima | **grafite** `#111827` | **branco** |
| Hover | **clareia** (mais contraste com grafite) | **escurece** (mais contraste com branco) |
| Cor de marca que "já serve" | clara | **escura** |

Consequência prática: vinho `#6b1f2a` e marinho `#1b2a5a` passam de cara no site da
barbearia (11,3:1 e 13,8:1 com branco) e reprovariam no site de vendas. Dourado
`#c9a227` e laranja `#e8721c` são o contrário.

## Site de vendas — regras duras

- `#16A34A` é cor de **preenchimento e ícone, nunca de letra**. Como texto sobre claro dá
  3,15:1 e reprova; quando o verde precisa virar texto, escurece para `#15803D`.
- **Texto branco sobre `#16A34A` é proibido** — 3,30:1. O botão leva texto grafite
  `#111827` (5,38:1) e clareia para `#22C55E` no hover (7,79:1).
- `--color-on-brand` existe porque `--color-ink` é claro. **Todo texto em cima de
  preenchimento verde usa `--color-on-brand`, nunca `--color-ink`.**
- Ícone do WhatsApp sempre monocromático, herdando a cor do texto. Nunca o verde oficial
  `#25D366` — ao lado do `#16A34A` lê como erro, não como marca.

## Site da barbearia — a cor é do cliente

`apps/barbearia/src/lib/accent.ts` deriva os três tokens (`--color-teal`, `-hover`, `-light`) de **uma**
cor de marca. **Nunca aplicar a cor da logo crua** — quatro das cores mais comuns em logo
de barbearia (preto, vinho, marinho, vermelho) reprovam como preenchimento.

A função preserva a matiz e ajusta só a luminosidade. Três casos:

1. **Logo em escala de cinza** (preto, branco, cinza) → cai no padrão. **Não inventar
   matiz**: forçar saturação em cinza transforma logo preta em rosa.
2. **Cor que já passa** → mantida sem tocar.
3. **Cor clara demais** → escurece o mínimo necessário.

A derivação acontece **na escrita**: o painel grava os três valores, o Layout só lê e
sanitiza. Derivar a cada render é custo por requisição sem ganho.

## Sanitização — não é opcional

A cor vem de um campo de painel e é interpolada dentro de um `<style>`. **Valor fora do
formato hex tem que ser descartado**, senão o campo vira injeção de CSS. `isHex()` e
`cssDoAccent()` já fazem isso; qualquer caminho novo tem que passar por eles.

## Como o tema chega na tela

O Tailwind v4 compila `bg-teal` para `background-color: var(--color-teal)` e emite a
variável em `:root`. **Sobrescrever a variável em runtime retinge tudo que deriva dela,
sem rebuild** — verificado no build real. É assim que a cor do cliente entra.

Corolário: hex cravado em componente (`bg-[#0f766e]`) **escapa do tema** e não segue a
cor do cliente. Usar sempre o token.

## Pisos de contraste

| Uso | Mínimo |
|---|---|
| Texto de corpo | 4,5:1 |
| Rótulo, legenda, placeholder | 3,0:1 |
| Borda e separador | só precisa ser visível |

Creme a 20% de opacidade sobre fundo escuro dá **1,77:1** — invisível. O piso prático de
texto translucido é `/40`.

## Antes de trocar qualquer hex

**Recalcular.** Não confiar em "parece que dá". Um script de dez linhas resolve:

```python
def lin(c):
    c/=255; return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def L(h):
    h=h.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4))
    return .2126*lin(r)+.7152*lin(g)+.0722*lin(b)
def ratio(a,b):
    la,lb=L(a),L(b); hi,lo=max(la,lb),min(la,lb); return (hi+.05)/(lo+.05)
```

E **renderizar antes de afirmar**: subir a página e ler a cor computada dos elementos.
Grep não pega tudo — uma promessa de "domínio próprio incluso" escapou de três buscas e
só apareceu no texto renderizado.