import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { SupabaseOkrRepository } from './supabaseRepository';
import { dailyReportToDraft } from './dailyReportMapper';
import type { SupabaseClientLike } from './types';
import { uploadStorageObject } from '../services/supabaseStorageUpload';

vi.mock('../mocks/repository', () => {
  throw new Error('Supabase repository must not import mock data at runtime');
});

vi.mock('../services/supabaseStorageUpload', () => ({
  uploadStorageObject: vi.fn(),
}));

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
  const storageFrom = vi.fn(() => ({ upload: vi.fn(), createSignedUrl, remove: vi.fn(async () => ({ data: {}, error: null })) }));
  const client: SupabaseClientLike = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' } } }, error: null })),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    } as never,
    from: vi.fn(() => builder),
    rpc,
    storage: { from: storageFrom },
  };
  return { client, rpc, storageFrom, createSignedUrl };
}

function createDashboardClient(
  rowsByTable: Record<string, Record<string, unknown>[]>,
  profileSource: { organizationUsers?: Record<string, unknown>[]; clearances?: Record<string, unknown>[] } = {},
) {
  const { client, rpc } = createClient();
  const from = vi.fn((table: string) => {
    const response = { data: table === 'profiles' && profileSource.clearances ? profileSource.clearances : rowsByTable[table] ?? [], error: null };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: response.data[0] ?? null, error: response.error })),
      then: (resolve: (value: typeof response) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject),
    };
    return builder;
  });
  client.from = from;
  rpc.mockImplementation(async (name?: string) => {
    if (name === 'list_organization_users') return { data: profileSource.organizationUsers ?? rowsByTable.profiles ?? [], error: null };
    return { data: null, error: null };
  });
  return { client, from, rpc };
}

describe('SupabaseOkrRepository', () => {
  it.each([
    ['first.pdf', 1],
    ['second.pdf', 2],
  ])('uploads %s through session metadata, real progress, finalization, and uploaded state', async (fileName, entryPosition) => {
    const events: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      if (name === 'begin_daily_report_upload_session') {
        events.push('begin session');
        return { data: { reportId: 'report-1', sessionId: 'session-1' }, error: null };
      }
      if (name === 'begin_entry_attachment_upload') {
        events.push('begin attachment metadata');
        return { data: { id: `attachment-${entryPosition}`, path: `organization/o/reports/r/${fileName}`, bucket: 'report-attachments' }, error: null };
      }
      if (name === 'finalize_attachment_upload') {
        events.push('finalize attachment');
        return { data: { id: `attachment-${entryPosition}` }, error: null };
      }
      return { data: null, error: null };
    });
    const { client } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    vi.mocked(uploadStorageObject).mockImplementationOnce(async ({ onProgress }) => {
      for (const progress of [1, 50, 100]) {
        events.push(`upload progress ${progress}`);
        onProgress(progress);
      }
    });
    const repository = new SupabaseOkrRepository(client);

    const session = await repository.beginDailyReportUploadSession({ reportDate: '2026-08-23', status: 'submitted', classification: 'internal' });
    if (!session.ok) throw new Error(session.error.message);
    const updates: Array<{ state: string; progress?: number; attachmentId?: string }> = [];
    const result = await repository.uploadDailyReportAttachment({
      session: session.data,
      file: new File(['proof'], fileName, { type: 'application/pdf' }),
      entryPosition,
      label: `Display ${fileName}`,
      classification: 'internal',
      onChange: (update) => {
        updates.push(update);
        if (update.state === 'uploaded') events.push('uploaded');
      },
    });

    expect(result).toEqual({ ok: true, data: { attachmentId: `attachment-${entryPosition}` } });
    expect(events).toEqual([
      'begin session',
      'begin attachment metadata',
      'upload progress 1',
      'upload progress 50',
      'upload progress 100',
      'finalize attachment',
      'uploaded',
    ]);
    expect(updates).toEqual([
      { state: 'pending', progress: 0 },
      { state: 'uploading', progress: 0, attachmentId: `attachment-${entryPosition}` },
      { state: 'uploading', progress: 1, attachmentId: `attachment-${entryPosition}` },
      { state: 'uploading', progress: 50, attachmentId: `attachment-${entryPosition}` },
      { state: 'uploading', progress: 100, attachmentId: `attachment-${entryPosition}` },
      { state: 'verifying', progress: 100, attachmentId: `attachment-${entryPosition}` },
      { state: 'uploaded', progress: 100, attachmentId: `attachment-${entryPosition}` },
    ]);
    expect(rpc).toHaveBeenCalledWith('begin_entry_attachment_upload', expect.objectContaining({ p_display_name: `Display ${fileName}` }));
  });

  it.each([
    ['Daily report is locked', 'locked'],
    ['Attachment classification exceeds user clearance', 'clearance'],
  ])('preserves the upload failure category for %s', async (message, expectedCode) => {
    const { client } = createClient({ rpcError: { code: '42501', message } });
    const updates: Array<{ state: string; error?: string }> = [];

    const result = await new SupabaseOkrRepository(client).uploadDailyReportAttachment({
      session: { reportId: 'report-1', sessionId: 'session-1' },
      file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      entryPosition: 1,
      label: 'proof.pdf',
      classification: 'internal',
      onChange: (update) => updates.push(update),
    });

    expect(result).toEqual({ ok: false, error: { code: expectedCode, message: '请求未完成，请稍后重试' } });
    expect(updates.at(-1)).toEqual({ state: 'failed', progress: 0, error: '请求未完成，请稍后重试' });
  });

  it('submits a session with finalized attachment identities and no file transfer', async () => {
    vi.mocked(uploadStorageObject).mockClear();
    const { client, rpc } = createClient({ rpcData: [{ report_id: 'report-1', revision: 3 }] });
    const repository = new SupabaseOkrRepository(client);
    const input = {
      reportDate: '2026-08-23', status: 'submitted' as const, classification: 'internal' as const,
      blocks: [{ dailyObjective: '目标', linkedKeyResultId: 'kr-1', workDescription: '工作', hours: 2, result: '完成', evidenceLinks: [], attachments: [{ attachmentId: 'attachment-final', displayName: '成果', classification: 'internal' as const }] }],
      evidenceLinks: [],
    };

    const result = await repository.submitDailyReportSession(input, 'session-1');

    expect(result).toEqual({ ok: true, data: { id: 'report-1', revision: 3 } });
    expect(rpc).toHaveBeenCalledWith('save_daily_report', {
      p_report_date: '2026-08-23',
      p_status: 'submitted',
      p_classification: 'internal',
      p_blocks: input.blocks,
      p_upload_session_id: 'session-1',
      p_evidence_links: [],
    });
    expect(uploadStorageObject).not.toHaveBeenCalled();
  });

  it('explicitly adopts retained revision attachments into the active edit session', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const repository = new SupabaseOkrRepository(client);

    await expect(repository.adoptDailyReportAttachments(
      { reportId: 'report-1', sessionId: 'session-edit' },
      ['attachment-retained'],
    )).resolves.toEqual({ ok: true, data: undefined });

    expect(rpc).toHaveBeenCalledWith('adopt_daily_report_revision_attachments', {
      p_report_id: 'report-1',
      p_upload_session_id: 'session-edit',
      p_attachment_ids: ['attachment-retained'],
    });
  });

  it('cleans only the failed session attachment so retry can create one replacement row', async () => {
    const failedUpdates: Array<{ state: string; attachmentId?: string }> = [];
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'attachment-failed', path: 'organization/o/reports/r/failed.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-failed', path: 'organization/o/reports/r/failed.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-retry', path: 'organization/o/reports/r/retry.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-retry' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: {}, error: null });
    const { client } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    client.storage.from = vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove }));
    vi.mocked(uploadStorageObject)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const repository = new SupabaseOkrRepository(client);
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });
    const base = { session: { reportId: 'report-1', sessionId: 'session-1' }, file, entryPosition: 1, label: 'proof.pdf', classification: 'internal' as const, onChange: (update: { state: string; attachmentId?: string }) => failedUpdates.push(update) };

    await expect(repository.uploadDailyReportAttachment(base)).resolves.toEqual({ ok: false, error: expect.objectContaining({ code: 'network' }) });
    await expect(repository.uploadDailyReportAttachment(base)).resolves.toEqual({ ok: true, data: { attachmentId: 'attachment-retry' } });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'begin_entry_attachment_upload',
      'delete_daily_report_upload_attachment',
      'begin_entry_attachment_upload',
      'finalize_attachment_upload',
    ]);
    expect(remove).toHaveBeenCalledWith(['organization/o/reports/r/failed.pdf']);
    expect([...failedUpdates].reverse().find((update) => update.state === 'failed')).toEqual({ state: 'failed', progress: 0, attachmentId: undefined, error: '请求未完成，请稍后重试' });
  });

  it('classifies a non-network storage transfer failure for actionable upload copy', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'attachment-storage', path: 'organization/o/reports/r/storage.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-storage', path: 'organization/o/reports/r/storage.pdf', bucket: 'report-attachments' }, error: null });
    const { client } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    vi.mocked(uploadStorageObject).mockRejectedValueOnce(new Error('storage service unavailable'));

    await expect(new SupabaseOkrRepository(client).uploadDailyReportAttachment({
      session: { reportId: 'report-1', sessionId: 'session-1' },
      file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      entryPosition: 1,
      label: 'proof.pdf',
      classification: 'internal',
      onChange: vi.fn(),
    })).resolves.toEqual({ ok: false, error: { code: 'storage', message: '请求未完成，请稍后重试' } });
  });

  it('propagates metadata cleanup failure instead of hiding an orphaned upload row', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'attachment-failed', path: 'organization/o/reports/r/failed.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'cleanup denied' } });
    const { client, storageFrom } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    vi.mocked(uploadStorageObject).mockRejectedValueOnce(new Error('upload failed'));
    const updates: Array<{ state: string; attachmentId?: string; error?: string }> = [];

    const result = await new SupabaseOkrRepository(client).uploadDailyReportAttachment({
      session: { reportId: 'report-1', sessionId: 'session-1' },
      file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      entryPosition: 1,
      label: 'proof.pdf',
      classification: 'internal',
      onChange: (update) => updates.push(update),
    });

    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } });
    expect(updates.at(-1)).toEqual({ state: 'failed', progress: 0, attachmentId: undefined, error: '无权访问请求的资源' });
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('propagates Storage cleanup failure after metadata deletion', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'attachment-failed', path: 'organization/o/reports/r/failed.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-failed', path: 'organization/o/reports/r/failed.pdf', bucket: 'report-attachments' }, error: null });
    const remove = vi.fn(async () => ({ data: null, error: { message: 'storage cleanup failed' } }));
    const { client } = createClient();
    client.rpc = rpc;
    client.storage.from = vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove }));
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    vi.mocked(uploadStorageObject).mockRejectedValueOnce(new Error('upload failed'));

    const result = await new SupabaseOkrRepository(client).uploadDailyReportAttachment({
      session: { reportId: 'report-1', sessionId: 'session-1' },
      file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      entryPosition: 1,
      label: 'proof.pdf',
      classification: 'internal',
      onChange: vi.fn(),
    });

    expect(result).toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
  });

  it('retries deleted metadata cleanup and never abandons before Storage deletion succeeds', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_daily_report_upload_session_cleanup') return { data: [{ attachment_id: 'attachment-deleted' }], error: null };
      if (name === 'delete_daily_report_upload_attachment') return { data: { id: 'attachment-deleted', bucket: 'report-attachments', path: 'organization/o/reports/r/deleted.pdf' }, error: null };
      return { data: null, error: null };
    });
    const remove = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'storage unavailable' } })
      .mockResolvedValueOnce({ data: {}, error: null });
    const { client } = createClient();
    client.rpc = rpc;
    client.storage.from = vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove }));
    const repository = new SupabaseOkrRepository(client);

    await expect(repository.abandonDailyReportUploadSession('session-current')).resolves.toEqual({
      ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' },
    });
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('abandon_daily_report_upload_session');

    await expect(repository.abandonDailyReportUploadSession('session-current')).resolves.toEqual({ ok: true, data: undefined });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'list_daily_report_upload_session_cleanup',
      'delete_daily_report_upload_attachment',
      'list_daily_report_upload_session_cleanup',
      'delete_daily_report_upload_attachment',
      'abandon_daily_report_upload_session',
    ]);
  });

  it('continues cleanup through the upload session recovered by begin after refresh', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'begin_daily_report_upload_session') {
        return { data: { reportId: 'report-1', sessionId: 'session-recovered' }, error: null };
      }
      if (name === 'list_daily_report_upload_session_cleanup') {
        return { data: [{ attachment_id: 'attachment-deleted' }], error: null };
      }
      if (name === 'delete_daily_report_upload_attachment') {
        return { data: { id: 'attachment-deleted', bucket: 'report-attachments', path: 'organization/o/reports/r/deleted.pdf' }, error: null };
      }
      return { data: null, error: null };
    });
    const remove = vi.fn(async () => ({ data: {}, error: null }));
    const { client } = createClient();
    client.rpc = rpc;
    client.storage.from = vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove }));
    const repository = new SupabaseOkrRepository(client);

    const session = await repository.beginDailyReportUploadSession({
      reportDate: '2026-08-23', status: 'submitted', classification: 'internal',
    });
    expect(session).toEqual({ ok: true, data: { reportId: 'report-1', sessionId: 'session-recovered' } });
    await expect(repository.abandonDailyReportUploadSession('session-recovered')).resolves.toEqual({ ok: true, data: undefined });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'begin_daily_report_upload_session',
      'list_daily_report_upload_session_cleanup',
      'delete_daily_report_upload_attachment',
      'abandon_daily_report_upload_session',
    ]);
    expect(remove).toHaveBeenCalledWith(['organization/o/reports/r/deleted.pdf']);
  });

  it('cleans recovered unassociated uploads before abandoning exactly the selected session', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_daily_report_upload_session_cleanup') return { data: [{ attachment_id: 'attachment-recovered' }], error: null };
      if (name === 'delete_daily_report_upload_attachment') return { data: { id: 'attachment-recovered', bucket: 'report-attachments', path: 'organization/o/reports/r/recovered.pdf' }, error: null };
      return { data: null, error: null };
    });
    const remove = vi.fn(async () => ({ data: {}, error: null }));
    const { client } = createClient();
    client.rpc = rpc;
    client.storage.from = vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove }));
    await expect(new SupabaseOkrRepository(client).abandonDailyReportUploadSession('session-current')).resolves.toEqual({ ok: true, data: undefined });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'list_daily_report_upload_session_cleanup',
      'delete_daily_report_upload_attachment',
      'abandon_daily_report_upload_session',
    ]);
    expect(remove).toHaveBeenCalledWith(['organization/o/reports/r/recovered.pdf']);
  });

  it('maps only recognized profile roles without widening strings', async () => {
    const { client } = createClient({ rpcData: { state: 'active' }, profile: {
      id: 'profile-1',
      display_name: '员工一',
      preferred_locale: 'en',
      job_title: '工程师',
      department: '产品部',
      clearance: 'restricted',
      organizations: { name: 'Acme' },
      user_roles: [{ role: 'employee' }],
      project_members: [{ project_id: 'project-1' }],
    } });
    const result = await new SupabaseOkrRepository(client).getCurrentProfile();
    expect(result).toEqual({ ok: true, data: { kind: 'active', user: expect.objectContaining({ id: 'profile-1', role: 'employee', clearance: 'restricted', title: '工程师', department: '产品部', organization: 'Acme', projectIds: ['project-1'], preferredLocale: 'en' }) } });
  });

  it('rejects an unknown role instead of widening it into the domain', async () => {
    const { client } = createClient({ rpcData: { state: 'active' }, profile: { id: 'profile-1', display_name: '未知', user_roles: [{ role: 'owner' }] } });
    expect(await new SupabaseOkrRepository(client).getCurrentProfile()).toEqual({ ok: true, data: { kind: 'error' } });
  });

  it('distinguishes an inactive profile from a pending one', async () => {
    const { client } = createClient({ rpcData: { state: 'inactive' } });
    expect(await new SupabaseOkrRepository(client).getCurrentProfile()).toEqual({ ok: true, data: { kind: 'inactive' } });
  });

  it('recovers a missing profile by creating the caller pending profile', async () => {
    const { client } = createClient();
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { state: 'missing' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { state: 'pending' }, error: null });
    client.rpc = rpc as never;
    const result = await new SupabaseOkrRepository(client).getCurrentProfile();
    expect(result).toEqual({ ok: true, data: { kind: 'pending' } });
    expect(rpc).toHaveBeenNthCalledWith(1, 'get_my_profile_state', {});
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_pending_profile', { p_display_name: '' });
    expect(rpc).toHaveBeenNthCalledWith(3, 'get_my_profile_state', {});
  });

  it('treats an approved profile with no role as an account error', async () => {
    const { client } = createClient({ rpcData: { state: 'error' } });
    expect(await new SupabaseOkrRepository(client).getCurrentProfile()).toEqual({ ok: true, data: { kind: 'error' } });
  });

  it('treats a pending profile as pending approval', async () => {
    const { client } = createClient({ rpcData: { state: 'pending' } });
    expect(await new SupabaseOkrRepository(client).getCurrentProfile()).toEqual({ ok: true, data: { kind: 'pending' } });
  });

  it('returns a generic unauthorized error without protected resource labels', async () => {
    const { client } = createClient({ rpcData: { state: 'active' }, profileError: { code: '42501', message: 'secret report Quarterly Acquisition' } });
    const result = await new SupabaseOkrRepository(client).getCurrentProfile();
    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } });
    expect(JSON.stringify(result)).not.toContain('Quarterly Acquisition');
  });

  it('sends create input only through the restricted report RPC', async () => {
    const { client, rpc } = createClient({ rpcData: 'report-1' });
    const result = await new SupabaseOkrRepository(client).createDailyReport({
      reportDate: '2026-08-13', status: 'submitted', classification: 'internal',
      blocks: [{ dailyObjective: '完成目标', linkedKeyResultId: 'kr-1', workDescription: '执行 KR', hours: 2, result: '完成', evidenceLinks: [] }],
      evidenceLinks: [],
    });
    expect(result).toEqual({ ok: true, data: { id: 'report-1', revision: 1 } });
    expect(rpc).toHaveBeenCalledWith('create_daily_report', expect.objectContaining({
      p_report_date: '2026-08-13', p_blocks: expect.any(Array),
    }));
  });

  it('saves both first and repeated same-day submissions through one atomic RPC', async () => {
    const { client, rpc } = createClient({ rpcData: [{ report_id: 'report-1', revision: 2 }] });
    const result = await new SupabaseOkrRepository(client).saveDailyReport({
      reportDate: '2026-08-13', status: 'submitted', classification: 'internal',
      blocks: [{ dailyObjective: '完成目标', linkedKeyResultId: 'kr-1', workDescription: '执行 KR', hours: 2, result: '完成', evidenceLinks: [] }],
      evidenceLinks: [],
    });

    expect(result).toEqual({ ok: true, data: { id: 'report-1', revision: 2 } });
    expect(rpc).toHaveBeenCalledWith('save_daily_report', expect.objectContaining({
      p_report_date: '2026-08-13', p_blocks: expect.any(Array),
    }));
  });

  it('maps PostgreSQL serialization errors to revision conflicts', async () => {
    const { client } = createClient({ rpcError: { code: '40001', message: 'Daily report revision conflict' } });
    const result = await new SupabaseOkrRepository(client).updateDailyReport('report-1', 3, {
      reportDate: '2026-08-13', status: 'submitted', classification: 'internal',
      blocks: [{ dailyObjective: '更新', linkedKeyResultId: 'kr-1', workDescription: '执行 KR', hours: 2, result: '完成', evidenceLinks: [] }],
      evidenceLinks: [],
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

  it('lists organization users with role, status, and profile fields', async () => {
    const { client } = createDashboardClient({
      profiles: [{
        id: 'profile-1',
        display_name: '员工一',
        email: 'one@example.com',
        department: '产品部',
        job_title: '工程师',
        is_active: true,
        user_roles: [{ role: 'employee' }],
        project_members: [{ project_id: 'project-1' }],
      }],
    });
    const result = await new SupabaseOkrRepository(client).listOrganizationUsers();
    expect(result).toEqual({ ok: true, data: [expect.objectContaining({ id: 'profile-1', displayName: '员工一', email: 'one@example.com', department: '产品部', jobTitle: '工程师', role: 'employee', isActive: true, projectIds: ['project-1'] })] });
  });

  it('lists eligible KR owners for the requested objective through the focused RPC', async () => {
    const { client, rpc } = createClient({ rpcData: [{
      id: 'profile-1',
      display_name: '未分配员工',
      email: 'unassigned@example.com',
      department: '产品部',
      job_title: '工程师',
      is_active: true,
      approval_status: 'approved',
      created_at: '2026-08-22T00:00:00Z',
      user_roles: [{ role: 'employee' }],
      project_members: [],
    }] });
    const repository = new SupabaseOkrRepository(client);

    await expect(repository.listEligibleKrOwners('objective-1')).resolves.toEqual({
      ok: true,
      data: [expect.objectContaining({
        id: 'profile-1', displayName: '未分配员工', email: 'unassigned@example.com', department: '产品部', jobTitle: '工程师',
        role: 'employee', isActive: true, approvalStatus: 'approved', projectIds: [],
      })],
    });
    expect(rpc).toHaveBeenCalledWith('list_eligible_kr_owners', { p_objective_id: 'objective-1' });
  });

  it('approves a pending user through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const result = await new SupabaseOkrRepository(client).approvePendingUser({ userId: 'u1', role: 'employee', department: '产品', jobTitle: '工程师' });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('approve_pending_user', { p_target_user_id: 'u1', p_role: 'employee', p_department: '产品', p_job_title: '工程师' });
  });

  it('rejects a pending user through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const result = await new SupabaseOkrRepository(client).rejectPendingUser('u1');
    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('reject_pending_user', { p_target_user_id: 'u1' });
  });

  it('creates a pending profile through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const result = await new SupabaseOkrRepository(client).createPendingProfile('新员工');
    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('create_pending_profile', { p_display_name: '新员工' });
  });

  it('updates a user profile and role through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const result = await new SupabaseOkrRepository(client).updateUserProfile({ userId: 'u1', displayName: '新名字', email: 'new@example.com', department: '产品', jobTitle: '负责人', role: 'management' });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('update_user_profile', expect.objectContaining({ p_target_user_id: 'u1', p_role: 'management' }));
  });

  it('sets a user active flag through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const result = await new SupabaseOkrRepository(client).setUserActive('u1', false);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('set_user_active', { p_target_user_id: 'u1', p_is_active: false });
  });

  it('lists project summaries with leader names through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: [{ id: 'project-1', name: '项目一', leader_id: 'leader-1', leader_name: '项目负责人' }] });
    const result = await new SupabaseOkrRepository(client).listProjects();
    expect(result).toEqual({ ok: true, data: [{ id: 'project-1', name: '项目一', leaderId: 'leader-1', leaderName: '项目负责人' }] });
    expect(rpc).toHaveBeenCalledWith('list_projects', {});
  });

  it('replaces a user project membership set through the restricted RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const result = await new SupabaseOkrRepository(client).setUserProjectMemberships('u1', ['project-1', 'project-2']);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('set_user_project_memberships', { p_target_user_id: 'u1', p_project_ids: ['project-1', 'project-2'] });
  });

  it('maps duplicate-profile errors to a distinct code', async () => {
    const { client } = createClient({ rpcError: { code: '23505', message: 'Profile already exists for this user' } });
    const result = await new SupabaseOkrRepository(client).approvePendingUser({ userId: 'u1', role: 'employee', department: '', jobTitle: '' });
    expect(result).toEqual({ ok: false, error: { code: 'duplicate', message: '请求未完成，请稍后重试' } });
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
      profiles: [{ id: 'profile-1', display_name: '员工一', clearance: 'internal', user_roles: [{ role: 'employee' }], project_members: [{ project_id: 'project-1' }] }],
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
      'profiles', 'projects', 'objectives', 'key_results', 'progress_baselines', 'milestones', 'risks', 'progress_snapshots', 'kr_assignments', 'kr_progress_updates', 'daily_reports', 'daily_report_revisions', 'daily_okr_blocks', 'report_attachments', 'report_attachment_revisions',
    ]);
    if (!result.ok) throw new Error('Expected dashboard data');
    expectTypeOf(result.data.risks[0]).toMatchTypeOf<{ keyResultId?: string; objectiveId?: string; resolved: boolean } | undefined>();
  });

  it('joins administrator-assigned clearance from profiles when directory rows omit it', async () => {
    const { client } = createDashboardClient({
      profiles: [], projects: [], objectives: [], key_results: [], progress_baselines: [], milestones: [], risks: [], progress_snapshots: [], kr_assignments: [], kr_progress_updates: [], daily_reports: [], daily_report_revisions: [], daily_okr_blocks: [], report_attachments: [], report_attachment_revisions: [],
    }, {
      organizationUsers: [{ id: 'profile-1', display_name: '员工一', user_roles: [{ role: 'employee' }], project_members: [] }],
      clearances: [{ id: 'profile-1', clearance: 'restricted' }],
    });

    await expect(new SupabaseOkrRepository(client).getDashboardData()).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        currentUser: expect.objectContaining({ id: 'profile-1', role: 'employee', clearance: 'restricted' }),
        users: [expect.objectContaining({ id: 'profile-1', clearance: 'restricted' })],
      }),
    });
  });

  it('retains future baseline-only plan points without inventing actual progress', async () => {
    const { client } = createDashboardClient({
      profiles: [{ id: 'profile-1', display_name: '员工一', clearance: 'internal', user_roles: [{ role: 'employee' }], project_members: [{ project_id: 'project-1' }] }],
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

  it('authorizes a revision detach without soft-deleting immutable evidence', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const result = await new SupabaseOkrRepository(client).removeAttachment('attachment-1', { preserveRevisionHistory: true });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('authorize_attachment_revision_removal', { p_attachment_id: 'attachment-1' });
    expect(rpc).not.toHaveBeenCalledWith('soft_delete_attachment', expect.anything());
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
    const input = { reportDate: '2026-08-13', status: 'submitted' as const, classification: 'internal' as const, blocks: [{ dailyObjective: '目标', linkedKeyResultId: 'kr-1', workDescription: '执行 KR', hours: 2, result: '完成', evidenceLinks: [] }], evidenceLinks: [] };
    const result = await new SupabaseOkrRepository(client).createDailyReportWithAttachments(input, [{ file: new File(['x'], 'a.pdf', { type: 'application/pdf' }), classification: 'confidential' }]);
    expect(result).toEqual({ ok: true, data: { id: 'report-shell', revision: 1 } });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(['begin_daily_report_with_attachments', 'begin_attachment_upload', 'finalize_attachment_upload', 'update_daily_report_with_attachments']);
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[3]!);
  });

  it('does not transfer legacy save attachments during report submission', async () => {
    vi.mocked(uploadStorageObject).mockClear();
    const { client, rpc } = createClient({ rpcData: [{ report_id: 'report-1', revision: 1 }] });
    const repository = new SupabaseOkrRepository(client);
    const input = { reportDate: '2026-08-13', status: 'submitted' as const, classification: 'internal' as const, blocks: [{ dailyObjective: '目标', linkedKeyResultId: 'kr-1', workDescription: '执行 KR', hours: 2, result: '完成', evidenceLinks: [] }], evidenceLinks: [] };

    const result = await repository.saveDailyReport(input, [
      { file: new File(['ok'], 'first.pdf', { type: 'application/pdf' }), classification: 'internal', entryPosition: 1, label: '第一份成果' },
      { file: new File(['bad'], 'second.pdf', { type: 'text/plain' }), classification: 'internal', entryPosition: 1, label: '第二份成果' },
    ]);

    expect(result).toEqual({ ok: true, data: { id: 'report-1', revision: 1 } });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('save_daily_report', expect.anything());
    expect(uploadStorageObject).not.toHaveBeenCalled();
  });

  it('persists an edited attachment display name and restores it into an edit draft after reload', async () => {
    const dashboardClient = createDashboardClient({
      profiles: [{ id: 'profile-1', display_name: '员工一', clearance: 'internal', user_roles: [{ role: 'employee' }], project_members: [{ project_id: 'project-1' }] }],
      projects: [{ id: 'project-1', name: '项目一', description: '', leader_id: 'leader-1', classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31', project_members: [{ profile_id: 'profile-1' }] }],
      objectives: [{ id: 'objective-1', project_id: 'project-1', owner_id: 'leader-1', title: '目标', description: '', progress: 0, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      key_results: [{ id: 'kr-1', objective_id: 'objective-1', project_id: 'project-1', owner_id: 'profile-1', title: '关键结果', progress: 0, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      daily_reports: [{ id: 'report-1', author_id: 'profile-1', project_id: 'project-1', objective_id: 'objective-1', report_date: '2026-08-13', status: 'submitted', classification: 'internal', total_hours: 2, current_revision: 1 }],
      daily_report_revisions: [{ id: 'revision-1', report_id: 'report-1', revision_number: 1 }],
      daily_okr_blocks: [{ id: 'block-db-1', report_id: 'report-1', revision_id: 'revision-1', position: 1, daily_objective: '目标', linked_key_result_id: 'kr-1', work_description: '执行 KR', hours: 2, result: '完成', key_results: [], evidence_links: [] }],
      report_attachments: [{ id: 'attachment-1', report_id: 'report-1', revision_id: 'revision-1', daily_okr_block_id: 'block-db-1', original_name: 'proof.pdf', display_name: '验收结果图', classification: 'confidential', state: 'uploaded' }],
      report_attachment_revisions: [{ report_id: 'report-1', revision_id: 'revision-1', daily_okr_block_id: 'block-db-1', attachment_id: 'attachment-1', display_name: '验收结果图', classification: 'confidential' }],
      progress_baselines: [], milestones: [], risks: [], progress_snapshots: [], kr_assignments: [], kr_progress_updates: [],
    });
    const reloaded = await new SupabaseOkrRepository(dashboardClient.client).getDashboardData();
    if (!reloaded.ok) throw new Error(reloaded.error.message);

    expect(dailyReportToDraft(reloaded.data.dailyReports[0]!)).toEqual(expect.objectContaining({
      blocks: [expect.objectContaining({ evidence: [expect.objectContaining({ attachmentId: 'attachment-1', label: '验收结果图', classification: 'confidential', kind: 'file' })] })],
    }));
  });

  it('loads only the current report revision and its revision-scoped attachment metadata', async () => {
    const dashboardClient = createDashboardClient({
      profiles: [{ id: 'profile-1', display_name: '员工一', clearance: 'internal', user_roles: [{ role: 'employee' }], project_members: [{ project_id: 'project-1' }] }],
      projects: [{ id: 'project-1', name: '项目一', description: '', leader_id: 'leader-1', classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31', project_members: [{ profile_id: 'profile-1' }] }],
      objectives: [{ id: 'objective-1', project_id: 'project-1', owner_id: 'leader-1', title: '目标', description: '', progress: 0, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      key_results: [{ id: 'kr-1', objective_id: 'objective-1', project_id: 'project-1', owner_id: 'profile-1', title: '关键结果', progress: 0, classification: 'internal', start_date: '2026-08-01', due_date: '2026-08-31' }],
      daily_reports: [{ id: 'report-1', author_id: 'profile-1', project_id: 'project-1', objective_id: 'objective-1', report_date: '2026-08-13', status: 'submitted', classification: 'internal', total_hours: 3, current_revision: 2 }],
      daily_report_revisions: [
        { id: 'revision-1', report_id: 'report-1', revision_number: 1 },
        { id: 'revision-2', report_id: 'report-1', revision_number: 2 },
      ],
      daily_okr_blocks: [
        { id: 'block-1', report_id: 'report-1', revision_id: 'revision-1', position: 1, daily_objective: '旧目标', linked_key_result_id: 'kr-1', work_description: '旧工作', hours: 2, result: '旧结果', key_results: [], evidence_links: [] },
        { id: 'block-2', report_id: 'report-1', revision_id: 'revision-2', position: 1, daily_objective: '新目标', linked_key_result_id: 'kr-1', work_description: '新工作', hours: 3, result: '新结果', key_results: [], evidence_links: [] },
      ],
      report_attachments: [
        { id: 'attachment-retained', report_id: 'report-1', revision_id: 'revision-1', daily_okr_block_id: 'block-1', original_name: 'retained.pdf', display_name: '旧名称', classification: 'internal', state: 'uploaded' },
        { id: 'attachment-removed', report_id: 'report-1', revision_id: 'revision-1', daily_okr_block_id: 'block-1', original_name: 'removed.pdf', display_name: '已移除', classification: 'internal', state: 'deleted' },
      ],
      report_attachment_revisions: [
        { report_id: 'report-1', revision_id: 'revision-1', daily_okr_block_id: 'block-1', attachment_id: 'attachment-retained', display_name: '旧名称', classification: 'internal' },
        { report_id: 'report-1', revision_id: 'revision-1', daily_okr_block_id: 'block-1', attachment_id: 'attachment-removed', display_name: '已移除', classification: 'internal' },
        { report_id: 'report-1', revision_id: 'revision-2', daily_okr_block_id: 'block-2', attachment_id: 'attachment-retained', display_name: '新名称', classification: 'confidential' },
      ],
      progress_baselines: [], milestones: [], risks: [], progress_snapshots: [], kr_assignments: [], kr_progress_updates: [],
    });

    const reloaded = await new SupabaseOkrRepository(dashboardClient.client).getDashboardData();
    if (!reloaded.ok) throw new Error(reloaded.error.message);
    const report = reloaded.data.dailyReports[0]!;

    expect(report.blocks).toEqual([expect.objectContaining({
      id: 'block-2',
      dailyObjective: '新目标',
      evidenceItems: [expect.objectContaining({ attachmentId: 'attachment-retained', label: '新名称', classification: 'confidential' })],
    })]);
    expect(JSON.stringify(report)).not.toContain('旧目标');
    expect(JSON.stringify(report)).not.toContain('已移除');
  });
});
