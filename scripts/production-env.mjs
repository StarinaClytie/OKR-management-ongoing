/**
 * Match Vite's production-mode file order: .env, .env.local,
 * .env.production, and .env.production.local. Existing process variables
 * remain highest priority, just as they do for Vite itself. Vite's
 * value-bearing environment debugger is disabled before importing Vite and
 * DEBUG is not forwarded to child production commands.
 */
export async function loadProductionEnv(envDirectory = process.cwd()) {
  const inheritedEnv = { ...process.env };
  const originalDebug = process.env.DEBUG;
  delete process.env.DEBUG;

  try {
    const { loadEnv } = await import('vite');
    const viteEnv = loadEnv('production', envDirectory, 'VITE_');
    const resolvedEnv = { ...viteEnv, ...inheritedEnv };
    delete resolvedEnv.DEBUG;
    return resolvedEnv;
  } finally {
    if (originalDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = originalDebug;
  }
}
