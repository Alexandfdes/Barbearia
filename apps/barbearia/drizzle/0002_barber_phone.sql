-- Passo 7 de docs/ARQUITETURA-MULTI-TENANT-V1.md §9: login do painel por telefone.
--
-- O PROBLEMA QUE ISTO RESOLVE
--
-- O login buscava o barbeiro por `slug`, que era único no mundo. A migration
-- 0001 tornou o slug único POR BARBEARIA (`barbers_tenant_slug_uq`) — dois donos
-- chamados "bayron" passam a ser legítimos. E o painel é central
-- (painel.barbearianoar.com.br), então não há endereço de onde deduzir de qual
-- barbearia é quem está entrando.
--
-- O telefone resolve porque é único no mundo por natureza. Todo barbeiro tem, e
-- é o mesmo jeito que o cliente já entra no portal dele.
--
-- ⚠️ ÚNICO GLOBAL, NÃO POR TENANT. É o oposto do que a 0001 fez com o slug, e é
-- de propósito: a unicidade global é justamente o que permite descobrir a
-- barbearia A PARTIR do login. Um índice `(tenant_id, phone)` deixaria o mesmo
-- telefone em duas barbearias e a ambiguidade voltaria.
--
-- Consequência aceita: um barbeiro que trabalha em duas barbearias precisa de
-- dois telefones. É raro, e a alternativa — pedir a barbearia junto com o
-- login — obriga o dono a lembrar um identificador que ele nunca escolheu.
--
-- ⚠️ ANULÁVEL, e continua anulável. Os barbeiros que já existem não têm telefone
-- cadastrado, e inventar um seria pior que deixar vazio. Enquanto houver
-- barbeiro sem telefone, ele entra pelo caminho antigo — ver o comentário sobre
-- a transição em `src/pages/api/auth/login.ts`.

BEGIN;

ALTER TABLE barbers ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN barbers.phone IS
  'Telefone de login, só dígitos (10 ou 11), normalizado por lib/phone.ts. Único no mundo, não por tenant: é o que identifica a barbearia no login do painel central.';

-- Índice PARCIAL: só as linhas com telefone entram. Sem o WHERE, todos os NULL
-- colidiriam entre si em alguns bancos e um único barbeiro sem telefone
-- impediria o próximo de existir.
CREATE UNIQUE INDEX IF NOT EXISTS barbers_phone_uq
  ON barbers (phone)
  WHERE phone IS NOT NULL;

-- O login busca por telefone em toda tentativa, inclusive as que falham. Sem
-- índice, cada tentativa vira varredura da tabela inteira — e tentativa que
-- falha é exatamente o que um ataque de força bruta produz em volume.
-- (O índice único acima já serve para a busca; este comentário fica para quem
-- pensar em removê-lo achando que é só uma constraint.)

COMMIT;
