import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClientLike } from '../data/types';
import { AdminUserService, type InviteUserInput } from './adminUserService';

const inviteInput: InviteUserInput = {
  email: 'new@example.com',
  displayName: '新员工',
  department: '产品部',
  jobTitle: '工程师',
  role: 'employee',
};

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

describe('AdminUserService.inviteUser', () => {
  it('invites a new user and forwards the outcome', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, outcome: 'invited', userId: 'u1', email: 'new@example.com', invitationSent: true }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: true, outcome: 'invited', userId: 'u1', email: 'new@example.com', invitationSent: true });
    expect(invoke).toHaveBeenCalledWith('admin-invite-user', { body: inviteInput });
  });

  it('reports a recovered account without a fresh invitation', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, outcome: 'recovered', userId: 'u2', email: 'new@example.com', invitationSent: false }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: true, outcome: 'recovered', userId: 'u2', email: 'new@example.com', invitationSent: false });
  });

  it('reports a recovered account that had its invitation re-sent', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, outcome: 'recovered', userId: 'u2', email: 'new@example.com', invitationSent: true }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: true, outcome: 'recovered', userId: 'u2', email: 'new@example.com', invitationSent: true });
  });

  it('maps a recovery_invite_failed code to an error, not a success', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: false, code: 'recovery_invite_failed' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: false, error: { code: 'recovery_invite_failed', message: '请求未完成，请稍后重试' } });
  });

  it('reports an existing member without a userId', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, outcome: 'already_member', email: 'new@example.com' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: true, outcome: 'already_member', email: 'new@example.com', invitationSent: false });
  });

  it('maps forbidden to an unauthorized error', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: false, code: 'forbidden' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } });
  });

  it('preserves the invalid_email code', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: false, code: 'invalid_email' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: false, error: { code: 'invalid_email', message: '请求未完成，请稍后重试' } });
  });

  it('preserves the provisioning_failed code', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: false, code: 'provisioning_failed' }, error: null }));
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: false, error: { code: 'provisioning_failed', message: '请求未完成，请稍后重试' } });
  });

  it('returns a network failure when the invoke rejects', async () => {
    const invoke = vi.fn(async () => { throw new Error('boom'); });
    const service = new AdminUserService(clientWithInvoke(invoke));
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
  });

  it('returns a network failure when functions are unavailable', async () => {
    const service = new AdminUserService({} as SupabaseClientLike);
    expect(await service.inviteUser(inviteInput)).toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
  });
});
