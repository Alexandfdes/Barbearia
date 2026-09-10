import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * ⚠️ Os arquivos de teste rodam UM DE CADA VEZ, de propósito.
     *
     * `tenants-schema`, `settings` e `bookAppointment` começam com
     * `DROP SCHEMA public CASCADE` e remontam o schema do zero — cada um precisa
     * de um banco previsível, sem depender do estado deixado pelo anterior.
     *
     * Em paralelo, contra o MESMO banco, um derruba o schema enquanto o outro
     * está usando: `relation "barbers" does not exist`, no meio de um teste que
     * não tem nada a ver com isso.
     *
     * ⚠️ E o pior: isso depende do número de núcleos da máquina. O Vitest
     * paraleliza conforme a CPU disponível, então a suíte passava numa máquina
     * de 2 núcleos e falhava numa de 8 — o mesmo commit, resultados diferentes.
     * Foi assim que a corrida chegou até aqui sem ser vista.
     *
     * O custo de serializar é de poucos segundos. O de um teste que falha
     * conforme a máquina é muito maior: ninguém confia no vermelho, e aí ninguém
     * olha o vermelho de verdade.
     *
     * Para paralelizar de novo seria preciso um banco por arquivo — não basta um
     * schema por arquivo, porque a migration 0001 crava `'public'::regnamespace`
     * ao recompor as chaves estrangeiras.
     */
    fileParallelism: false,
  },
});
