import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClientLike } from '../data/types';
import { AdminUserService } from './adminUserService';

function clientWithInvoke(invoke: unknown): SupabaseClientLike {
  return { functions: { invoke } } as unknown as SupabaseClientLike;
}

describe('AdminUserService', () => {
  it('returns sanitized pending users on success', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, pendingUsers: [{ id: 'u1', email: 'pending@example.com', createdAt: '2026-08-01', lastSignInAt: null }] }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.listPendingUsers()).toEqual({ ok: true, data: [{ id: 'u1', email: 'pending@example.com', createdAt: '2026-08-01', lastSignInAt: null }] });
    expect(invoke).toHaveBeenCalledWith('admin-users');
  });

  it('maps a forbidden response to unauthorized', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: false, code: 'forbidden' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.listPendingUsers()).toEqual({ ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } });
  });

  it('returns a network failure when the invoke rejects', async () => {
    const invoke = vi.fn(async () => { throw new Error('boom'); });
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.listPendingUsers()).toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
  });

  it('returns a network failure when functions are unavailable', async () => {
    const service = new AdminUserService({} as SupabaseClientLike);
    expect(await service.listPendingUsers()).toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
  });
});
