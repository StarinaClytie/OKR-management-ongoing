import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { SupabaseOkrRepository } from './supabaseRepository';
import type { SupabaseClientLike } from './types';

vi.mock('../mocks/repository', () => {
  throw new Error('Supabase repository must not import mock data at runtime');
});

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

function createDashboardClient(rowsByTable: Record<string, Record<string, unknown>[]>) {
  const { client, rpc } = createClient();
  const from = vi.fn((table: string) => {
    const response = { data: rowsByTable[table] ?? [], error: null };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: response.data[0] ?? null, error: response.error })),
      then: (resolve: (value: typeof response) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject),
    };
    return builder;
  });
  client.from = from;
  return { client, from, rpc };
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

  it('persists an owned KR progress snapshot through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: 'snapshot-1' });
    const result = await new SupabaseOkrRepository(client).saveKrProgress({
      keyResultId: 'kr-1', progress: 0, effectiveDate: '2026-08-14', note: '尚未开始',
    });

    expect(result).toEqual({ ok: true, data: { snapshotId: 'snapshot-1' } });
    expect(rpc).toHaveBeenCalledWith('save_kr_progress', {
      p_key_result_id: 'kr-1', p_progress: 0, p_effective_date: '2026-08-14', p_note: '尚未开始',
    });
  });

  it('persists the risk subject and resolved state through the owned-risk RPC', async () => {
    const { client, rpc } = createClient({ rpcData: 'risk-1' });
    const result = await new SupabaseOkrRepository(client).saveOwnedRisk({
      id: 'risk-1', projectId: 'project-1', keyResultId: 'kr-1', title: '交付风险',
      probability: 3, impact: 3, reason: '依赖延期', mitigation: '替代方案',
      lastReviewedAt: '2026-08-14', classification: 'internal', resolved: true,
    });

    expect(result).toEqual({ ok: true, data: { id: 'risk-1' } });
    expect(rpc).toHaveBeenCalledWith('save_owned_risk', {
      p_risk_id: 'risk-1', p_project_id: 'project-1', p_key_result_id: 'kr-1', p_objective_id: null,
      p_title: '交付风险', p_probability: 3, p_impact: 3, p_reason: '依赖延期',
      p_mitigation: '替代方案', p_last_reviewed_at: '2026-08-14', p_classification: 'internal', p_resolved: true,
    });
  });

  it('persists the signed-in user locale only through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    expect(await new SupabaseOkrRepository(client).setMyLocale('en')).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('set_my_locale', { p_locale: 'en' });
  });

  it('sanitizes protected owned-risk RPC errors', async () => {
    const { client } = createClient({ rpcError: { code: '42501', message: 'Risk for Project Aurora is restricted' } });
    const result = await new SupabaseOkrRepository(client).saveOwnedRisk({
      projectId: 'project-1', objectiveId: 'objective-1', title: '风险', probability: 2, impact: 3,
      reason: '原因', mitigation: '措施', lastReviewedAt: '2026-08-14', classification: 'internal', resolved: false,
    });

    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } });
    expect(JSON.stringify(result)).not.toContain('Project Aurora');
  });

  it('maps only rows returned under RLS into dashboard domain data without mock fallback', async () => {
    const { client, from } = createDashboardClient({
      profiles: [{ id: 'profile-1', display_name: '员工一', user_roles: [{ role: 'employee' }], project_members: [{ project_id: 'project-1' }] }],
      projects: [{ id: 'project-1', name: '项目一', description: '描述', leader_id: 'leader-1', classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31', project_members: [{ profile_id: 'profile-1' }] }],
      objectives: [{ id: 'objective-1', project_id: 'project-1', owner_id: 'profile-1', title: '目标', description: '目标描述', progress: 40, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      key_results: [{ id: 'kr-1', objective_id: 'objective-1', project_id: 'project-1', owner_id: 'profile-1', title: '关键结果', progress: 0, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      progress_baselines: [{ id: 'baseline-1', key_result_id: 'kr-1', planned_for: '2026-08-14', planned_value: 25 }],
      milestones: [{ id: 'milestone-1', project_id: 'project-1', key_result_id: 'kr-1', title: '里程碑', planned_date: '2026-08-20', is_complete: false }],
      risks: [{ id: 'risk-1', project_id: 'project-1', key_result_id: 'kr-1', objective_id: null, owner_id: 'profile-1', title: '风险', reason: '原因', mitigation: '措施', probability: 3, impact: 3, classification: 'internal', last_reviewed_at: '2026-08-14T00:00:00Z', resolved_at: '2026-08-14T01:00:00Z' }],
      progress_snapshots: [{ id: 'snapshot-1', key_result_id: 'kr-1', progress: 0, effective_date: '2026-08-14' }],
    });

    const result = await new SupabaseOkrRepository(client).getDashboardData('profile-1');

    expect(result).toEqual({ ok: true, data: expect.objectContaining({
      currentUser: expect.objectContaining({ id: 'profile-1', name: '员工一' }),
      projects: [expect.objectContaining({ id: 'project-1', memberIds: ['profile-1'] })],
      objectives: [expect.objectContaining({ id: 'objective-1', projectId: 'project-1', progress: 40 })],
      keyResults: [expect.objectContaining({ id: 'kr-1', ownerId: 'profile-1', progress: 0 })],
      milestones: [expect.objectContaining({ id: 'milestone-1', objectiveId: 'objective-1', dependencyIds: ['kr-1'] })],
      risks: [expect.objectContaining({ id: 'risk-1', keyResultId: 'kr-1', objectiveId: undefined, resolved: true })],
      progressSnapshots: [expect.objectContaining({ id: 'snapshot-1', keyResultId: 'kr-1', actual: 0, planned: 25, weekOf: '2026-08-14' })],
    }) });
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'profiles', 'projects', 'objectives', 'key_results', 'progress_baselines', 'milestones', 'risks', 'progress_snapshots',
    ]);
    if (!result.ok) throw new Error('Expected dashboard data');
    expectTypeOf(result.data.risks[0]).toMatchTypeOf<{ keyResultId?: string; objectiveId?: string; resolved: boolean } | undefined>();
  });

  it('retains future baseline-only plan points without inventing actual progress', async () => {
    const { client } = createDashboardClient({
      profiles: [{ id: 'profile-1', display_name: '员工一', user_roles: [{ role: 'employee' }], project_members: [{ project_id: 'project-1' }] }],
      projects: [{ id: 'project-1', name: '项目一', description: '描述', leader_id: 'leader-1', classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31', project_members: [{ profile_id: 'profile-1' }] }],
      objectives: [{ id: 'objective-1', project_id: 'project-1', owner_id: 'profile-1', title: '目标', description: '目标描述', progress: 40, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      key_results: [{ id: 'kr-1', objective_id: 'objective-1', project_id: 'project-1', owner_id: 'profile-1', title: '关键结果', progress: 40, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      progress_baselines: [{ id: 'baseline-future', key_result_id: 'kr-1', planned_for: '2026-08-31', planned_value: 80 }],
      milestones: [], risks: [], progress_snapshots: [],
    });

    const result = await new SupabaseOkrRepository(client).getDashboardData();

    expect(result).toEqual({ ok: true, data: expect.objectContaining({
      progressSnapshots: [{ id: 'baseline-future', projectId: 'project-1', keyResultId: 'kr-1', weekOf: '2026-08-31', actual: undefined, planned: 80 }],
    }) });
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

  it('does not write a report revision until every selected attachment is uploaded and finalized', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: 'report-shell', error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-1', path: 'organization/o/reports/r/a.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-1' }, error: null })
      .mockResolvedValueOnce({ data: 1, error: null });
    const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const { client } = createClient();
    client.rpc = rpc;
    client.storage.from = vi.fn(() => ({ upload, createSignedUrl: vi.fn(), remove: vi.fn() }));
    const input = { projectId: 'project-1', objectiveId: 'objective-1', reportDate: '2026-08-13', status: 'submitted' as const, classification: 'internal' as const, totalHours: 2, dailyObjective: '目标', objectiveProgress: 10, keyResults: [], evidenceLinks: [] };
    const result = await new SupabaseOkrRepository(client).createDailyReportWithAttachments(input, [{ file: new File(['x'], 'a.pdf', { type: 'application/pdf' }), classification: 'confidential' }]);
    expect(result).toEqual({ ok: true, data: { id: 'report-shell', revision: 1 } });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(['begin_daily_report_with_attachments', 'begin_attachment_upload', 'finalize_attachment_upload', 'update_daily_report_with_attachments']);
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[3]!);
  });
});
