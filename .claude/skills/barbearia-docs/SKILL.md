---
name: barbearia-docs
description: "Como escrever e revisar os documentos do Barbearia no Ar — estilo da casa, verificação de afirmações e checagem automática de referências cruzadas. Use ao criar ou atualizar qualquer arquivo em docs/, ou ao registrar uma decisão do projeto."
---

# Documentos do Barbearia no Ar

## O princípio

**Documento que mente é pior que documento nenhum**, porque alguém confia nele. Este
projeto já teve três documentos discordando entre si sobre o que estava pronto.

Daí as duas regras que valem para tudo aqui:

1. **Nenhuma afirmação sobre o código sem ter aberto o arquivo.** Referência no formato
   `arquivo:linha` é literal e conferida, não de memória.
2. **Não marcar como pronto o que não foi visto funcionando.** O que não existe vai
   marcado como tal.

## Estilo da casa

- **Cabeçalho com data e status** em blockquote: o que é, quando foi escrito, se está
  implementado ou só desenhado, e quais documentos são companheiros.
- **Decisão vem com a alternativa rejeitada e o porquê.** "Rejeitado: X, porque Y" evita
  que a discussão volte em três meses.
- **⚠️ para armadilha, 🔴🟠🟡 para prioridade, ✅ para resolvido.** Usados com parcimônia.
- **Número sempre com origem**: "verificado em DD/MM", "estimativa, não medido", ou a
  fonte. Número sem origem vira lenda.
- **Português direto.** O leitor é o dono do projeto, não um comitê.

## A armadilha das referências cruzadas

Os documentos se referenciam por `§`. **Dentro de tabela, só a primeira célula costuma
nomear o arquivo** — e aí `§3.2` na linha seguinte fica órfão e ambíguo:

```markdown
| Item | Onde |
| Onde as instâncias rodam | `PENDENCIAS-ABERTAS.md` §3.1 |
| Atualizar N containers | §3.2 |          ← órfão
```

**Nomeie o arquivo em toda célula**, ou divida em linhas. Este erro já foi cometido três
vezes neste projeto.

Mesma regra fora de tabela: o nome do arquivo tem que estar colado ao `§`.

## Verificar antes de entregar

Rodar sempre que criar ou editar documento, com todos os `.md` de `docs/` na mesma pasta:

```python
import io, re, glob
d = {x.split('/')[-1]: io.open(x, encoding='utf-8').read() for x in glob.glob('*.md')}
h = {x: set(re.findall(r'^#{2,4}\s+(\d+(?:\.\d+)*)[.\s]', s, re.M)) for x, s in d.items()}
bad = []
for x, s in d.items():
    for m in re.finditer(r'(`?([A-Z][A-Za-z0-9-]+\.md)`?[^§]{0,16})?§(\d+(?:\.\d+)*)', s):
        t = m.group(2) if m.group(2) in h else x
        if m.group(3) not in h.get(t, set()):
            bad.append(f'{x}: §{m.group(3)} -> {t}')
print('refs quebradas:', bad or 'NENHUMA')
```

Falso positivo acontece quando um documento citado não está na pasta — junte todos antes
de concluir que quebrou.

## Ao mudar uma decisão

- **Não apagar a anterior**: mover para um bloco de histórico com a data e o motivo da
  troca. Serve para não refazer o mesmo debate.
- **Procurar quem ficou desatualizado.** Renumerar seção quebra referência de outro
  arquivo em silêncio — rodar o script acima depois de qualquer renumeração.
- **Listar o que a mudança invalida** numa seção "o que muda nos outros documentos", e
  **não alterar os outros antes de implementar** — documento que descreve sistema
  inexistente é o problema que se quer evitar.

## Onde cada coisa mora

Decisão **tomada** vai para o documento de arquitetura ou de plano.
Decisão **que falta** vai para `PENDENCIAS-ABERTAS.md`.
Quando um item resolve, ele **sai** do PENDENCIAS e vira parágrafo no outro — com uma
linha na tabela `§0` registrando quando e onde foi parar.