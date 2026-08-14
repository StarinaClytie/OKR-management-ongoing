import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsDirectory, '..');
const verifier = resolve(scriptsDirectory, 'verify-supabase-config.mjs');

function verify(environment = {}, args = []) {
  return spawnSync(process.execPath, [verifier, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      VITE_APP_MODE: undefined,
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_DB_PASSWORD: undefined,
      DATABASE_URL: undefined,
      ...environment,
    },
  });
}

describe('verify-supabase-config', () => {
  test('rejects demo mode for production verification', () => {
    const result = verify({ VITE_APP_MODE: 'demo' }, ['--production']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('生产验证要求 VITE_APP_MODE=supabase');
  });

  test('accepts valid public Supabase production configuration without printing its key', () => {
    const publicKey = 'sb_publishable_1234567890abcdefghij';
    const result = verify({
      VITE_APP_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://northstar-test-123.supabase.co',
      VITE_SUPABASE_ANON_KEY: publicKey,
    }, ['--production']);

    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(publicKey);
  });

  test.each([
    ['leading or trailing whitespace', { VITE_SUPABASE_ANON_KEY: ' sb_publishable_1234567890abcdefghij' }],
    ['placeholder key', { VITE_SUPABASE_ANON_KEY: 'replace-with-publishable-key' }],
    ['malformed key', { VITE_SUPABASE_ANON_KEY: 'test-public-key' }],
    ['secret-shaped key', { VITE_SUPABASE_ANON_KEY: 'sb_secret_1234567890abcdefghij' }],
    ['placeholder URL', { VITE_SUPABASE_URL: 'https://example.supabase.co' }],
  ])('rejects %s without echoing the supplied value', (_description, invalidEnvironment) => {
    const secretLikeValue = Object.values(invalidEnvironment)[0];
    const result = verify({
      VITE_APP_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://northstar-test-123.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_1234567890abcdefghij',
      ...invalidEnvironment,
    }, ['--production']);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretLikeValue);
  });

  test('provides one production build command that verifies and builds in the same environment', () => {
    const packageManifest = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
    const productionBuilder = readFileSync(resolve(projectRoot, 'scripts/build-production.mjs'), 'utf8');

    expect(packageManifest.scripts['build:production']).toBe('node scripts/build-production.mjs');
    expect(productionBuilder).toMatch(/verify-supabase-config\.mjs', '--production/);
    expect(productionBuilder).toMatch(/\['run', 'build'\]/);
    expect(productionBuilder).toMatch(/loadProductionEnv/);
    expect(productionBuilder).toMatch(/env: productionEnv/);
  });

  test('provides a network-free Supabase-mode workflow smoke harness', () => {
    const packageManifest = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));

    expect(packageManifest.scripts['test:smoke:real']).toContain('src/pages/pageFrameworks.test.tsx');
    expect(packageManifest.scripts['test:smoke:real']).toContain('src/pages/RiskEditor.test.tsx');
    expect(packageManifest.scripts['test:smoke:real']).toContain('src/app/routes.test.tsx');
    expect(packageManifest.scripts['test:smoke:real']).toContain('src/i18n/LocaleProvider.test.tsx');
  });

  test('both bilingual guides explain the required real-workflow concepts', () => {
    const chinese = readFileSync(resolve(projectRoot, 'docs/user-guide.zh-CN.md'), 'utf8');
    const english = readFileSync(resolve(projectRoot, 'docs/user-guide.en.md'), 'utf8');

    for (const guide of [chinese, english]) {
      expect(guide).toMatch(/probability/i);
      expect(guide).toMatch(/impact/i);
      expect(guide).toContain('riskScore = probability × impact');
      expect(guide).toContain('1×3=3');
      expect(guide).toMatch(/most severe|最严重/iu);
      expect(guide).toMatch(/employee|员工/iu);
      expect(guide).toMatch(/project leader|项目负责人/iu);
      expect(guide).toMatch(/KR progress|KR 进度/iu);
      expect(guide).toMatch(/中文|Chinese/iu);
      expect(guide).toMatch(/English|英文/iu);
      expect(guide).toMatch(/-10/);
      expect(guide).toMatch(/-25/);
      expect(guide).toMatch(/score 6|分数为 6/iu);
      expect(guide).toMatch(/score 9|分数为 9/iu);
      expect(guide).toMatch(/non-persistent|不可持久化/iu);
    }

    expect(chinese).toMatch(/演示模式.*不可持久化/);
    expect(english).toMatch(/demo mode.*non-persistent/i);
  });
});
