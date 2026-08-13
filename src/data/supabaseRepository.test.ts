import { describe, expect, it, vi } from 'vitest';
import { SupabaseOkrRepository } from './supabaseRepository';
import type { SupabaseClientLike } from './types';

function createClient(options?: {
  profile?: Record<string, unknown> | null;
  profileError?: { code?: string; message: string } | null;
  rpcData?: unknown;
  rpcError?: { code?: string; message: string } | null;
  signedUrl?: string;
}) {
  const response = { data: options?.profile ?? null, error: options?.profileError ?? null };
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => response),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  const rpc = vi.fn(async () => ({ data: options?.rpcData ?? null, error: options?.rpcError ?? null }));
  const createSignedUrl = vi.fn(async () => ({ data: options?.signedUrl ? { signedUrl: options.signedUrl } : null, error: options?.signedUrl ? null : { message: 'not configured' } }));
  const storageFrom = vi.fn(() => ({ upload: vi.fn(), createSignedUrl, remove: vi.fn() }));
  const client: SupabaseClientLike = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' } } }, error: null })),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    } as never,
    from: vi.fn(() => builder),
    rpc,
    storage: { from: storageFrom },
  };
  return { client, rpc, storageFrom, createSignedUrl };
}

describe('SupabaseOkrRepository', () => {
  it('maps only recognized profile roles without widening strings', async () => {
    const { client } = createClient({ profile: {
      id: 'profile-1',
      display_name: '员工一',
      user_roles: [{ role: 'employee' }],
      project_members: [{ project_id: 'project-1' }],
    } });
    const result = await new SupabaseOkrRepository(client).getCurrentProfile();
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ id: 'profile-1', role: 'employee', projectIds: ['project-1'] }) });
  });

  it('rejects an unknown role instead of widening it into the domain', async () => {
    const { client } = createClient({ profile: { id: 'profile-1', display_name: '未知', user_roles: [{ role: 'owner' }] } });
    expect(await new SupabaseOkrRepository(client).getCurrentProfile()).toEqual({ ok: true, data: null });
  });

  it('returns a generic unauthorized error without protected resource labels', async () => {
    const { client } = createClient({ profileError: { code: '42501', message: 'secret report Quarterly Acquisition' } });
    const result = await new SupabaseOkrRepository(client).getCurrentProfile();
    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } });
    expect(JSON.stringify(result)).not.toContain('Quarterly Acquisition');
  });

  it('sends create input only through the restricted report RPC', async () => {
    const { client, rpc } = createClient({ rpcData: 'report-1' });
    const result = await new SupabaseOkrRepository(client).createDailyReport({
      projectId: 'project-1', objectiveId: 'objective-1', reportDate: '2026-08-13',
      status: 'submitted', classification: 'internal', totalHours: 2,
      dailyObjective: '完成目标', objectiveProgress: 0, keyResults: [], evidenceLinks: [],
    });
    expect(result).toEqual({ ok: true, data: { id: 'report-1', revision: 1 } });
    expect(rpc).toHaveBeenCalledWith('create_daily_report', expect.objectContaining({
      p_project_id: 'project-1', p_objective_progress: 0,
    }));
  });

  it('maps PostgreSQL serialization errors to revision conflicts', async () => {
    const { client } = createClient({ rpcError: { code: '40001', message: 'Daily report revision conflict' } });
    const result = await new SupabaseOkrRepository(client).updateDailyReport('report-1', 3, {
      projectId: 'project-1', objectiveId: 'objective-1', reportDate: '2026-08-13',
      status: 'submitted', classification: 'internal', totalHours: 2,
      dailyObjective: '更新', objectiveProgress: 10, keyResults: [], evidenceLinks: [],
    });
    expect(result).toEqual({ ok: false, error: { code: 'conflict', message: '请求未完成，请稍后重试' } });
  });

  it('saves progress plans and milestones only through restricted RPCs', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const repository = new SupabaseOkrRepository(client);

    expect(await repository.saveProgressPlan('kr-1', [{ date: '2026-08-31', value: 100 }])).toEqual({ ok: true, data: undefined });
    expect(await repository.saveMilestones('project-1', [{ title: '发布', plannedDate: '2026-08-31' }])).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenNthCalledWith(1, 'save_progress_plan', {
      p_key_result_id: 'kr-1', p_points: [{ date: '2026-08-31', value: 100 }],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'save_milestones', {
      p_project_id: 'project-1', p_milestones: [{ title: '发布', plannedDate: '2026-08-31' }],
    });
  });

  it('saves explained risks through the restricted risk RPC', async () => {
    const { client, rpc } = createClient({ rpcData: 'risk-1' });
    const repository = new SupabaseOkrRepository(client);
    const result = await repository.saveRisk({
      projectId: 'project-1', title: '交付风险', probability: 2, impact: 3,
      reason: '依赖延期', mitigation: '替代方案', lastReviewedAt: '2026-08-13', classification: 'internal',
    });
    expect(result).toEqual({ ok: true, data: { id: 'risk-1' } });
    expect(rpc).toHaveBeenCalledWith('save_risk', expect.objectContaining({ p_probability: 2, p_impact: 3, p_reason: '依赖延期' }));
  });

  it('authorizes then creates a short-lived signed attachment URL', async () => {
    const { client, storageFrom, createSignedUrl } = createClient({
      rpcData: { bucket: 'report-attachments', path: 'organization/o/reports/r/a.pdf', expiresIn: 60 },
      signedUrl: 'https://storage.example/signed',
    });
    const result = await new SupabaseOkrRepository(client).createAttachmentDownload('attachment-1');
    expect(result).toEqual({ ok: true, data: { url: 'https://storage.example/signed' } });
    expect(storageFrom).toHaveBeenCalledWith('report-attachments');
    expect(createSignedUrl).toHaveBeenCalledWith('organization/o/reports/r/a.pdf', 60);
  });
});
