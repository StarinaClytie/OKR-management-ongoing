import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { loadProductionEnv } from './production-env.mjs';

const touchedKeys = ['VITE_APP_MODE', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const savedEnvironment = Object.fromEntries(touchedKeys.map((key) => [key, process.env[key]]));
const temporaryDirectories = [];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  for (const key of touchedKeys) {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  }
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe('loadProductionEnv', () => {
  test('follows Vite production env-file precedence while process env remains highest priority', async () => {
    const envDirectory = mkdtempSync(join(tmpdir(), 'northstar-production-env-'));
    temporaryDirectories.push(envDirectory);
    writeFileSync(join(envDirectory, '.env'), 'VITE_APP_MODE=demo\nVITE_SUPABASE_URL=https://base.supabase.co\n');
    writeFileSync(join(envDirectory, '.env.local'), 'VITE_SUPABASE_URL=https://local.supabase.co\n');
    writeFileSync(join(envDirectory, '.env.production'), 'VITE_APP_MODE=supabase\nVITE_SUPABASE_ANON_KEY=sb_publishable_from_production\n');
    writeFileSync(join(envDirectory, '.env.production.local'), 'VITE_SUPABASE_ANON_KEY=sb_publishable_from_production_local\n');

    for (const key of touchedKeys) delete process.env[key];
    expect(await loadProductionEnv(envDirectory)).toMatchObject({
      VITE_APP_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://local.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_from_production_local',
    });

    process.env.VITE_SUPABASE_URL = 'https://injected.supabase.co';
    expect((await loadProductionEnv(envDirectory)).VITE_SUPABASE_URL).toBe('https://injected.supabase.co');
  });

  test('does not expose resolved values when Vite environment debug is enabled', () => {
    const unrelatedSecret = 'unrelated-secret-sentinel-do-not-print';
    const publicKey = 'sb_publishable_sentinel_do_not_print';
    const moduleUrl = pathToFileURL(resolve(scriptDirectory, 'production-env.mjs')).href;
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `import { loadProductionEnv } from ${JSON.stringify(moduleUrl)}; loadProductionEnv();`,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DEBUG: 'vite:env',
        UNRELATED_SECRET_SENTINEL: unrelatedSecret,
        VITE_SUPABASE_ANON_KEY: publicKey,
      },
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(unrelatedSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(publicKey);
  });
});
