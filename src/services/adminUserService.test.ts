import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClientLike } from '../data/types';
import { AdminUserService } from './adminUserService';

function clientWithInvoke(invoke: unknown): SupabaseClientLike {
  return { functions: { invoke } } as unknown as SupabaseClientLike;
}

describe('AdminUserService.deleteUser', () => {
  it('deletes an account and reports preserved records', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, outcome: 'deleted', userId: 'u2', recordsPreserved: true }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.deleteUser('u2')).toEqual({ ok: true, outcome: 'deleted', userId: 'u2', recordsPreserved: true });
    expect(invoke).toHaveBeenCalledWith('admin-delete-user', { body: { userId: 'u2' } });
  });

  it('maps a self_delete response to a self_delete error', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: false, code: 'self_delete' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.deleteUser('u2')).toEqual({ ok: false, error: { code: 'self_delete', message: '不能删除当前登录的管理员账号' } });
  });

  it('maps forbidden to an unauthorized error (non-admin)', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: false, code: 'forbidden' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.deleteUser('u2')).toEqual({ ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } });
  });

  it('returns a network failure when the invoke rejects', async () => {
    const invoke = vi.fn(async () => { throw new Error('boom'); });
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.deleteUser('u2')).toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
  });

  it('returns a network failure when functions are unavailable', async () => {
    const service = new AdminUserService({} as SupabaseClientLike);
    expect(await service.deleteUser('u2')).toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
  });
});
