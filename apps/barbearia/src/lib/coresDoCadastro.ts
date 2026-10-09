/**
 * As cores que o `/cadastrar` oferece prontas, além da "outra", livre. Um layout
 * só no lançamento, e a cor é do dono (decisão de 08/10/2026,
 * `docs/PLANO-PRODUTIZACAO.md` §13).
 *
 * Duas regras, conferidas em `tests/cores-do-cadastro.test.ts`:
 *
 * ⚠️ **Nenhuma pode ser a cor padrão do site** (`ACCENT_PADRAO`, `lib/accent.ts`).
 * O medidor do painel só conta a cor que não é a padrão (`lib/completude.ts`), e
 * quem escolhesse essa ouviria do painel, logo depois do cadastro, que falta
 * escolher a cor. Foi o que fazia o "Petróleo" #0f766e da primeira versão desta
 * lista — achado em 08/10/2026, antes de sair da nuvem.
 *
 * **Todas passam no contraste com o texto branco do botão sem ajuste.** A prévia
 * avisa quando a derivação escurece a cor; aviso numa cor que a própria tela
 * ofereceu seria a tela discordando de si mesma.
 */
export const CORES_DO_CADASTRO: ReadonlyArray<{ nome: string; hex: string }> = [
  { nome: 'Vermelho', hex: '#b91c1c' },
  { nome: 'Vinho',    hex: '#9f1239' },
  { nome: 'Laranja',  hex: '#c2410c' },
  { nome: 'Dourado',  hex: '#b45309' },
  { nome: 'Verde',    hex: '#15803d' },
  { nome: 'Petróleo', hex: '#115e59' },
  { nome: 'Azul',     hex: '#1d4ed8' },
  { nome: 'Roxo',     hex: '#7c3aed' },
];
