// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './config';

const valid = {
  OSS_ACCESS_KEY_ID: 'test-id', OSS_ACCESS_KEY_SECRET: 'test-secret',
  OSS_BUCKET: 'timetech-okr-files', OSS_REGION: 'oss-cn-shanghai',
  OSS_ENDPOINT: 'https://oss-cn-shanghai.aliyuncs.com',
  SUPABASE_URL: 'https://api.example.test', SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
};

describe('loadServerConfig', () => {
  it('loads server-only runtime variables and binds localhost by default', () => {
    expect(loadServerConfig(valid)).toMatchObject({ host: '127.0.0.1', port: 3001, ossBucket: 'timetech-okr-files' });
  });
  it('fails with variable names but never secret values', () => {
    expect(() => loadServerConfig({ ...valid, OSS_ACCESS_KEY_SECRET: '' })).toThrow('OSS_ACCESS_KEY_SECRET');
    try { loadServerConfig({ ...valid, OSS_ACCESS_KEY_SECRET: '' }); } catch (error) {
      expect(String(error)).not.toContain('test-secret');
    }
  });
});
