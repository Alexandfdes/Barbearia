# Documentação do Fadeline

> Índice de tudo que existe em `docs/`. Atualizado: 26/10/2026.
>
> **Se você está chegando agora ou voltando depois de um tempo, leia
> `ESTADO-ATUAL.md` primeiro.** Ele diz onde o código está e qual é o próximo
> passo. Este índice existe porque em 06/09 alguém trabalhou uma hora na pasta
> errada por não saber que ele existia.

---

## Comece por aqui

| Documento | O que responde |
|---|---|
| **`ESTADO-ATUAL.md`** | Onde o código está hoje e o que está pela metade. A fila do que fazer é a do `PENDENCIAS-ABERTAS.md` §6 — o `ESTADO-ATUAL.md` §9 é registro de 06/09 |
| **`PENDENCIAS-ABERTAS.md`** | O que ainda **não** foi decidido, por prioridade |
| **`COMO-FUNCIONA.md`** | O produto inteiro em português claro, sem termo técnico |
| **`ROTEIRO-MIGRACAO-PRODUCAO.md`** | 🔴 **Ainda não executado.** A ordem, comando por comando, para pôr o Postgres no ar para o Bayron — com as conferências e o caminho de volta |

## Negócio

| Documento | Status | O que responde |
|---|---|---|
| `PRECIFICACAO.md` | ✅ vigente | Preço, margem por cliente, concorrentes verificados |
| `PLANO-PRODUTIZACAO.md` | ⚠️ parcialmente substituído | Posicionamento e público-alvo. **A escolha de arquitetura foi revertida** — ver `ARQUITETURA-MULTI-TENANT-V1.md` |
| `FLUXO-COMPLETO.md` | ⚠️ vai ser aposentado | O caminho antigo, com montagem, da venda até o site no ar — vale enquanto o `/onboarding` existir. O que o substitui é o `JORNADA-DO-BARBEIRO.md` |
| `JORNADA-DO-BARBEIRO.md` | ⚠️ desenho, implementado em parte | O caminho do barbeiro no autoatendimento, da landing ao site no ar: o que ele vê, o que existe no código, o que falta e em que ordem construir |

## Arquitetura

| Documento | Status | O que responde |
|---|---|---|
| `ARQUITETURA-MULTI-TENANT-V1.md` | ✅ **vigente** | Como o sistema é montado: um banco, `tenant_id`, RLS, três aplicações. **Manda em tudo que for código novo.** `ARQUITETURA-MULTI-TENANT-V1.md` §12 registra as quatro coisas que o desenho não previa |
| `ARQUITETURA-COBRANCA-V1.md` | ⚠️ premissas vencidas | Asaas, estados do tenant, os dois aplicativos. Números recalculados em 06/09; o raciocínio de `ARQUITETURA-COBRANCA-V1.md` §1.1 dependia do setup abolido |
| `ARQUITETURA-PRODUCAO.md` | ✅ reescrito em 12/10/2026 | O que roda onde com N barbearias: o app, o banco, o volume, o roteamento, o deploy e o raio de dano. Até 12/10 descrevia uma instância por barbearia |
| `ARQUITETURA-PRODUTO-V1.md` | ⚠️ D1 revertida | D3 a D7 continuam valendo (SSR, mídia, cor de destaque); a D2 só nas colunas tipadas — `settings` é uma linha por barbearia. **A D1 foi substituída** |
| `MONOREPO.md` | ✅ implementado | Por que os dois projetos viraram um repositório, e as três alternativas rejeitadas |

## Página de vendas

| Documento | Status | O que responde |
|---|---|---|
| `BRIEFING-TELA-INICIAL.md` | ✅ implementado | Paleta, tipografia, animações e o histórico da tela inicial |

> A **copy** da página não tem documento. Ela vive em
> `apps/vendas/src/pages/index.astro`, nos arrays do frontmatter. Existia um
> COPY-TELA-INICIAL.md (sem crase de propósito: o arquivo não existe mais) e ele foi
> apagado em 06/09: virou uma cópia
> desatualizada, com preço e promessas que já tinham mudado.

## Histórico — o sistema sob medida do Bayron

Documentos de antes da produtização. **Nenhum deles descreve o estado atual.**
Servem para entender por que o código é como é.

| Documento | Status |
|---|---|
| `CONTEXTO-AGENDAMENTO.md` | 📦 histórico — apesar do nome, **não** é o estado atual |
| `AGENDAR-V1.md` | 📦 implantado e em produção |
| `PLANO-A-TOKEN-V2.md` | 📦 implantado |
| `PLANO-HORARIOS-TRABALHO.md` | 📦 implantado |
| `PLANO-PORTAL-CLIENTE-V3.md` | 📦 implantado |

## Entregas antigas — saíram em 12/10/2026

`migracao-postgres/` (o passo 2, o porte para Postgres) e `migracao-tenants/` (os passos 3,
3.5 e 4) eram pastas fora de `docs/`, com patches e LEIA-ME próprios. Foram aplicadas em
06/09/2026 e saíram do repositório em 12/10/2026, com o `WIPE-APPOINTMENTS.md` — o
procedimento de um script da época do SQLite, apagado junto. Continuam no histórico do git.

---

## As quatro skills

Vivem em `.claude/skills/` e chegam junto com o clone. São regras que já custaram
erro neste projeto — leia antes de mexer na área de cada uma.

| Skill | Quando vale |
|---|---|
| `barbearia-multi-tenant` | qualquer código: migration, rota, consulta ao banco, tela |
| `barbearia-paleta` | cor, tema, botão, texto sobre fundo colorido |
| `barbearia-docs` | criar ou editar arquivo em `docs/` |
| `barbearia-cobranca` | a cobrança pela Asaas: o webhook, os eventos, o cancelar — desde 17/10/2026 |

---

## Regras deste diretório

1. **Documento que mente é pior que documento nenhum.** Nenhuma afirmação sobre o
   código sem ter aberto o arquivo; referência `arquivo:linha` é literal e
   conferida.
2. **Decisão mudou?** O texto antigo não se apaga — vira bloco de histórico com a
   data e o motivo, e o documento ganha um aviso no topo. Serve para o mesmo debate
   não voltar em três meses.
3. **Item resolvido sai do `PENDENCIAS-ABERTAS.md`** e vira parágrafo no documento
   que manda, com uma linha na tabela `PENDENCIAS-ABERTAS.md` §0 registrando quando e para onde foi.
4. **Mexeu em `docs/`?** Rode a checagem de referências cruzadas — o script está na
   skill `barbearia-docs`. Renumerar uma seção quebra referência de outro arquivo em
   silêncio.
5. **Atualize este índice** quando criar, apagar ou mudar o status de um documento.

## Legenda

✅ vigente · ⚠️ vale em parte, leia o aviso no topo · 📦 histórico, não descreve o presente
