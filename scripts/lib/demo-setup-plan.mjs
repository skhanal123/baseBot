/**
 * US-18: derive docker compose + migrate steps from DURABLE_STORE.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function planDemoSetup(env = process.env) {
  const store = (env.DURABLE_STORE ?? 'postgres').trim().toLowerCase();
  if (store !== 'postgres' && store !== 'mongo') {
    throw new Error(`DURABLE_STORE must be "postgres" or "mongo", got "${store}"`);
  }

  if (store === 'mongo') {
    return {
      store,
      composeArgs: ['compose', '--profile', 'mongo', 'up', '-d'],
      steps: ['seed:demo'],
    };
  }

  return {
    store,
    composeArgs: ['compose', 'up', '-d'],
    steps: ['migrate', 'migrate:demo', 'seed:demo'],
  };
}
