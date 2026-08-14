import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { loadProductionEnv } from './production-env.mjs';

const touchedKeys = ['VITE_APP_MODE', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const savedEnvironment = Object.fromEntries(touchedKeys.map((key) => [key, process.env[key]]));
const temporaryDirectories = [];

afterEach(() => {
  for (const key of touchedKeys) {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  }
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe('loadProductionEnv', () => {
  test('follows Vite production env-file precedence while process env remains highest priority', () => {
    const envDirectory = mkdtempSync(join(tmpdir(), 'northstar-production-env-'));
    temporaryDirectories.push(envDirectory);
    writeFileSync(join(envDirectory, '.env'), 'VITE_APP_MODE=demo\nVITE_SUPABASE_URL=https://base.supabase.co\n');
    writeFileSync(join(envDirectory, '.env.local'), 'VITE_SUPABASE_URL=https://local.supabase.co\n');
    writeFileSync(join(envDirectory, '.env.production'), 'VITE_APP_MODE=supabase\nVITE_SUPABASE_ANON_KEY=sb_publishable_from_production\n');
    writeFileSync(join(envDirectory, '.env.production.local'), 'VITE_SUPABASE_ANON_KEY=sb_publishable_from_production_local\n');

    for (const key of touchedKeys) delete process.env[key];
    expect(loadProductionEnv(envDirectory)).toMatchObject({
      VITE_APP_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://local.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_from_production_local',
    });

    process.env.VITE_SUPABASE_URL = 'https://injected.supabase.co';
    expect(loadProductionEnv(envDirectory).VITE_SUPABASE_URL).toBe('https://injected.supabase.co');
  });
});
