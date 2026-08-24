import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { SupabaseOkrRepository } from './supabaseRepository';
import { dailyReportToDraft } from './dailyReportMapper';
import type { SupabaseClientLike } from './types';
import type { OssAttachmentTransport } from '../services/ossAttachmentTransport';

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

function createAttachmentTransport(overrides: Partial<OssAttachmentTransport> = {}): OssAttachmentTransport {
  return {
    upload: vi.fn(async (_id, _file, onProgress) => { onProgress(100); }),
    downloadUrl: vi.fn(async () => 'https://oss.example/signed'),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
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
      return { data: null, error: null };
    });
    const { client } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    const transport = createAttachmentTransport({ upload: vi.fn(async (_id, _file, onProgress) => {
      for (const progress of [1, 50, 100]) {
        events.push(`upload progress ${progress}`);
        onProgress(progress);
      }
    }) });
    const repository = new SupabaseOkrRepository(client, transport);

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
      'uploaded',
    ]);
    expect(updates).toEqual([
      { state: 'pending', progress: 0 },
      { state: 'uploading', progress: 0, attachmentId: `attachment-${entryPosition}` },
      { state: 'uploading', progress: 1, attachmentId: `attachment-${entryPosition}` },
      { state: 'uploading', progress: 50, attachmentId: `attachment-${entryPosition}` },
      { state: 'verifying', progress: 100, attachmentId: `attachment-${entryPosition}` },
      { state: 'uploaded', progress: 100, attachmentId: `attachment-${entryPosition}` },
    ]);
    expect(rpc).toHaveBeenCalledWith('begin_entry_attachment_upload', expect.objectContaining({ p_display_name: `Display ${fileName}` }));
  });

  it('finds an active daily upload session without calling the shell-creating begin RPC', async () => {
    const { client, rpc } = createClient({ rpcData: { reportId: 'report-1', sessionId: 'session-1' } });
    const repository = new SupabaseOkrRepository(client) as SupabaseOkrRepository & {
      findDailyReportUploadSession(reportDate: string): Promise<unknown>;
    };

    await expect(repository.findDailyReportUploadSession('2026-08-23')).resolves.toEqual({
      ok: true, data: { reportId: 'report-1', sessionId: 'session-1' },
    });
    expect(rpc).toHaveBeenCalledWith('find_daily_report_upload_session', { p_report_date: '2026-08-23' });
  });

  it('confirms a member report through the dedicated reviewer RPC', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const repository = new SupabaseOkrRepository(client) as SupabaseOkrRepository & {
      confirmDailyReport(reportId: string, expectedRevision: number): Promise<unknown>;
    };

    await expect(repository.confirmDailyReport('report-1', 3)).resolves.toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith('confirm_daily_report', { p_report_id: 'report-1', p_expected_revision: 3 });
  });

  it('maps the authorized daily report detail RPC payload including visible attachments', async () => {
    const { client, rpc } = createClient({ rpcData: {
      id: 'report-1', authorId: 'author-1', authorName: '日报作者', date: '2026-08-24', status: 'submitted', hours: 8, currentRevision: 2,
      blocks: [{
        id: 'block-1', dailyObjective: '完成光学测试', keyResultId: 'kr-1', workDescription: '完成测试和记录', hours: 8, result: '通过',
        keyResults: [{ id: 'daily-kr-1', title: '记录测试结果' }],
        attachments: [{ attachmentId: 'attachment-1', displayName: 'test-results.pdf', classification: 'internal' }],
      }],
      comments: [{ id: 'comment-1', reportId: 'report-1', authorId: 'leader-1', authorName: '直属负责人', body: '请补充数据', createdAt: '2026-08-24T09:00:00.000Z' }],
      canComment: true, canConfirm: true,
    } });

    await expect(new SupabaseOkrRepository(client).getDailyReportDetail('report-1')).resolves.toEqual({
      ok: true,
      data: {
        id: 'report-1', authorId: 'author-1', authorName: '日报作者', date: '2026-08-24', status: 'submitted', hours: 8, currentRevision: 2,
        blocks: [{
          id: 'block-1', dailyObjective: '完成光学测试', keyResultId: 'kr-1', workDescription: '完成测试和记录', hours: 8, result: '通过',
          keyResults: [{ id: 'daily-kr-1', title: '记录测试结果' }],
          evidenceItems: [{ id: 'attachment-attachment-1', attachmentId: 'attachment-1', label: 'test-results.pdf', kind: 'file', classification: 'internal', uploadState: 'uploaded', uploadProgress: 100 }],
        }],
        comments: [{ id: 'comment-1', reportId: 'report-1', authorId: 'leader-1', authorName: '直属负责人', body: '请补充数据', createdAt: '2026-08-24T09:00:00.000Z' }],
        canComment: true, canConfirm: true,
      },
    });
    expect(rpc).toHaveBeenCalledWith('get_daily_report_detail', { p_report_id: 'report-1' });
  });

  it('maps a posted daily report comment through the reviewer RPC', async () => {
    const { client, rpc } = createClient({ rpcData: {
      id: 'comment-1', reportId: 'report-1', authorId: 'leader-1', authorName: '直属负责人', body: '请补充数据', createdAt: '2026-08-24T09:00:00.000Z',
    } });

    await expect(new SupabaseOkrRepository(client).commentDailyReport('report-1', '请补充数据')).resolves.toEqual({
      ok: true,
      data: { id: 'comment-1', reportId: 'report-1', authorId: 'leader-1', authorName: '直属负责人', body: '请补充数据', createdAt: '2026-08-24T09:00:00.000Z' },
    });
    expect(rpc).toHaveBeenCalledWith('comment_daily_report', { p_report_id: 'report-1', p_body: '请补充数据' });
  });

  it('maps notification dates, nullable read state, and pagination cursor from the notification RPC', async () => {
    const { client, rpc } = createClient({ rpcData: {
      items: [
        { id: 'notification-resource-1', type: 'resource_owner_assigned', reportId: null, resourceId: 'resource-1', actorName: '管理员', readAt: null, createdAt: '2026-08-24T10:00:00.000Z' },
        { id: 'notification-report-1', type: 'daily_report_comment', reportId: 'report-1', resourceId: null, actorName: '直属负责人', readAt: '2026-08-24T09:00:00.000Z', createdAt: '2026-08-24T08:00:00.000Z' },
      ],
      nextCursor: { createdAt: '2026-08-24T08:00:00.000Z', id: 'notification-report-1' },
      unreadCount: 1,
    } });
    const cursor = { createdAt: '2026-08-24T11:00:00.000Z', id: 'notification-cursor-1' };

    await expect(new SupabaseOkrRepository(client).listMyNotifications(10, cursor)).resolves.toEqual({
      ok: true,
      data: {
        items: [
          { id: 'notification-resource-1', type: 'resource_owner_assigned', reportId: null, resourceId: 'resource-1', actorName: '管理员', readAt: null, createdAt: '2026-08-24T10:00:00.000Z' },
          { id: 'notification-report-1', type: 'daily_report_comment', reportId: 'report-1', resourceId: null, actorName: '直属负责人', readAt: '2026-08-24T09:00:00.000Z', createdAt: '2026-08-24T08:00:00.000Z' },
        ],
        nextCursor: { createdAt: '2026-08-24T08:00:00.000Z', id: 'notification-report-1' },
        unreadCount: 1,
      },
    });
    expect(rpc).toHaveBeenCalledWith('list_my_notifications', {
      p_limit: 10,
      p_cursor_created_at: '2026-08-24T11:00:00.000Z',
      p_cursor_id: 'notification-cursor-1',
    });
  });

  it('marks one or all notifications read only through their RPCs', async () => {
    const { client, rpc } = createClient({ rpcData: null });
    const repository = new SupabaseOkrRepository(client);

    await expect(repository.markNotificationRead('notification-1')).resolves.toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenLastCalledWith('mark_notification_read', { p_notification_id: 'notification-1' });
    rpc.mockResolvedValueOnce({ data: 3, error: null });
    await expect(repository.markAllNotificationsRead()).resolves.toEqual({ ok: true, data: 3 });
    expect(rpc).toHaveBeenLastCalledWith('mark_all_notifications_read', {});
  });

  it.each([
    ['Daily report is locked', 'locked'],
    ['Attachment classification exceeds user clearance', 'clearance'],
    ['Daily report is not available', 'unauthorized'],
    ['Daily report revision conflict', 'conflict'],
    ['network request failed', 'network'],
  ])('preserves the repository error category for daily report detail %s', async (message, expectedCode) => {
    const code = expectedCode === 'conflict' ? '40001' : expectedCode === 'network' ? '500' : '42501';
    const { client } = createClient({ rpcError: { code, message } });

    await expect(new SupabaseOkrRepository(client).getDailyReportDetail('report-1')).resolves.toEqual({
      ok: false,
      error: { code: expectedCode, message: expectedCode === 'unauthorized' ? '无权访问请求的资源' : '请求未完成，请稍后重试' },
    });
  });

  it.each([
    ['Daily report is locked', 'locked'],
    ['Attachment classification exceeds user clearance', 'clearance'],
  ])('preserves the upload failure category for %s', async (message, expectedCode) => {
    const { client } = createClient({ rpcError: { code: '42501', message } });
    const updates: Array<{ state: string; errorCode?: string; error?: string }> = [];

    const result = await new SupabaseOkrRepository(client).uploadDailyReportAttachment({
      session: { reportId: 'report-1', sessionId: 'session-1' },
      file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      entryPosition: 1,
      label: 'proof.pdf',
      classification: 'internal',
      onChange: (update) => updates.push(update),
    });

    expect(result).toEqual({ ok: false, error: { code: expectedCode, message: '请求未完成，请稍后重试' } });
    expect(updates.at(-1)).toEqual({ state: 'failed', progress: 0, errorCode: expectedCode, error: '请求未完成，请稍后重试' });
  });

  it('submits a session with finalized attachment identities and no file transfer', async () => {
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
  });

  it('preserves the recoverable cleanup-required failure when an upload session has orphaned metadata', async () => {
    const { client } = createClient({
      rpcError: { code: '55000', message: 'Upload session has unassociated attachments requiring cleanup' },
    });
    const input = {
      reportDate: '2026-08-23', status: 'submitted' as const, classification: 'internal' as const,
      blocks: [{ dailyObjective: '目标', linkedKeyResultId: 'kr-1', workDescription: '工作', hours: 2, result: '完成', evidenceLinks: [], attachments: [] }],
      evidenceLinks: [],
    };

    await expect(new SupabaseOkrRepository(client).submitDailyReportSession(input, 'session-1')).resolves.toEqual({
      ok: false,
      error: { code: 'cleanup_required', message: '请求未完成，请稍后重试' },
    });
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
      .mockResolvedValueOnce({ data: { id: 'attachment-retry', path: 'organization/o/reports/r/retry.pdf', bucket: 'report-attachments' }, error: null });
    const remove = vi.fn().mockResolvedValue(undefined);
    const { client } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementationOnce(async (_id, _file, onProgress) => onProgress(100));
    const repository = new SupabaseOkrRepository(client, createAttachmentTransport({ upload, remove }));
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });
    const base = { session: { reportId: 'report-1', sessionId: 'session-1' }, file, entryPosition: 1, label: 'proof.pdf', classification: 'internal' as const, onChange: (update: { state: string; attachmentId?: string }) => failedUpdates.push(update) };

    await expect(repository.uploadDailyReportAttachment(base)).resolves.toEqual({ ok: false, error: expect.objectContaining({ code: 'network' }) });
    await expect(repository.uploadDailyReportAttachment(base)).resolves.toEqual({ ok: true, data: { attachmentId: 'attachment-retry' } });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'begin_entry_attachment_upload',
      'begin_entry_attachment_upload',
    ]);
    expect(remove).toHaveBeenCalledWith('attachment-failed');
    expect([...failedUpdates].reverse().find((update) => update.state === 'failed')).toEqual({ state: 'failed', progress: 0, attachmentId: undefined, errorCode: 'network', error: '请求未完成，请稍后重试' });
  });

  it('classifies a non-network storage transfer failure for actionable upload copy', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'attachment-storage', path: 'organization/o/reports/r/storage.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-storage', path: 'organization/o/reports/r/storage.pdf', bucket: 'report-attachments' }, error: null });
    const { client } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    const transport = createAttachmentTransport({ upload: vi.fn().mockRejectedValueOnce(new Error('storage service unavailable')) });

    await expect(new SupabaseOkrRepository(client, transport).uploadDailyReportAttachment({
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
    const transport = createAttachmentTransport({
      upload: vi.fn().mockRejectedValueOnce(new Error('upload failed')),
      remove: vi.fn().mockRejectedValueOnce(new Error('cleanup denied')),
    });
    const updates: Array<{ state: string; attachmentId?: string; error?: string }> = [];

    const result = await new SupabaseOkrRepository(client, transport).uploadDailyReportAttachment({
      session: { reportId: 'report-1', sessionId: 'session-1' },
      file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      entryPosition: 1,
      label: 'proof.pdf',
      classification: 'internal',
      onChange: (update) => updates.push(update),
    });

    expect(result).toEqual({ ok: false, error: { code: 'storage', message: '请求未完成，请稍后重试' } });
    expect(updates.at(-1)).toEqual({ state: 'failed', progress: 0, attachmentId: undefined, errorCode: 'storage', error: '请求未完成，请稍后重试' });
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('propagates Storage cleanup failure after metadata deletion', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'attachment-failed', path: 'organization/o/reports/r/failed.pdf', bucket: 'report-attachments' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'attachment-failed', path: 'organization/o/reports/r/failed.pdf', bucket: 'report-attachments' }, error: null });
    const remove = vi.fn().mockRejectedValue(new Error('storage cleanup failed'));
    const { client } = createClient();
    client.rpc = rpc;
    client.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'profile-1' }, access_token: 'access-token' } }, error: null }));
    const transport = createAttachmentTransport({ upload: vi.fn().mockRejectedValueOnce(new Error('upload failed')), remove });

    const result = await new SupabaseOkrRepository(client, transport).uploadDailyReportAttachment({
      session: { reportId: 'report-1', sessionId: 'session-1' },
      file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      entryPosition: 1,
      label: 'proof.pdf',
      classification: 'internal',
      onChange: vi.fn(),
    });

    expect(result).toEqual({ ok: false, error: { code: 'storage', message: '请求未完成，请稍后重试' } });
  });

  it('retries deleted metadata cleanup and never abandons before Storage deletion succeeds', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_daily_report_upload_session_cleanup') return { data: [{ attachment_id: 'attachment-deleted' }], error: null };
      if (name === 'delete_daily_report_upload_attachment') return { data: { id: 'attachment-deleted', bucket: 'report-attachments', path: 'organization/o/reports/r/deleted.pdf' }, error: null };
      return { data: null, error: null };
    });
    const remove = vi.fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const { client } = createClient();
    client.rpc = rpc;
    client.storage.from = vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove }));
    const repository = new SupabaseOkrRepository(client, createAttachmentTransport({ remove }));

    await expect(repository.abandonDailyReportUploadSession('session-current')).resolves.toEqual({
      ok: false, error: { code: 'storage', message: '请求未完成，请稍后重试' },
    });
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('abandon_daily_report_upload_session');

    await expect(repository.abandonDailyReportUploadSession('session-current')).resolves.toEqual({ ok: true, data: undefined });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'list_daily_report_upload_session_cleanup',
      'list_daily_report_upload_session_cleanup',
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
    const remove = vi.fn(async () => undefined);
    const { client } = createClient();
    client.rpc = rpc;
    const repository = new SupabaseOkrRepository(client, createAttachmentTransport({ remove }));

    const session = await repository.beginDailyReportUploadSession({
      reportDate: '2026-08-23', status: 'submitted', classification: 'internal',
    });
    expect(session).toEqual({ ok: true, data: { reportId: 'report-1', sessionId: 'session-recovered' } });
    await expect(repository.abandonDailyReportUploadSession('session-recovered')).resolves.toEqual({ ok: true, data: undefined });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'begin_daily_report_upload_session',
      'list_daily_report_upload_session_cleanup',
      'abandon_daily_report_upload_session',
    ]);
    expect(remove).toHaveBeenCalledWith('attachment-deleted');
  });

  it('cleans recovered unassociated uploads before abandoning exactly the selected session', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_daily_report_upload_session_cleanup') return { data: [{ attachment_id: 'attachment-recovered' }], error: null };
      if (name === 'delete_daily_report_upload_attachment') return { data: { id: 'attachment-recovered', bucket: 'report-attachments', path: 'organization/o/reports/r/recovered.pdf' }, error: null };
      return { data: null, error: null };
    });
    const remove = vi.fn(async () => undefined);
    const { client } = createClient();
    client.rpc = rpc;
    await expect(new SupabaseOkrRepository(client, createAttachmentTransport({ remove })).abandonDailyReportUploadSession('session-current')).resolves.toEqual({ ok: true, data: undefined });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'list_daily_report_upload_session_cleanup',
      'abandon_daily_report_upload_session',
    ]);
    expect(remove).toHaveBeenCalledWith('attachment-recovered');
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

  it('lists eligible resource owners through the focused RPC', async () => {
    const { client, rpc } = createClient({ rpcData: [{
      id: 'profile-2',
      display_name: '资源负责人',
      email: 'owner@example.com',
      department: '运营部',
      job_title: '设备主管',
      is_active: true,
      approval_status: 'approved',
      created_at: '2026-08-23T00:00:00Z',
      user_roles: [{ role: 'employee' }],
      project_members: [],
    }] });
    const repository = new SupabaseOkrRepository(client);

    await expect(repository.listEligibleResourceOwners()).resolves.toEqual({
      ok: true,
      data: [expect.objectContaining({
        id: 'profile-2', displayName: '资源负责人', email: 'owner@example.com', department: '运营部', jobTitle: '设备主管',
        role: 'employee', isActive: true, approvalStatus: 'approved', projectIds: [],
      })],
    });
    expect(rpc).toHaveBeenCalledWith('list_eligible_resource_owners', {});
  });

  it('passes the selected owner to the assigned-owner resource create overload', async () => {
    const { client, rpc } = createClient({ rpcData: 'resource-1' });
    const repository = new SupabaseOkrRepository(client);

    await expect(repository.createResource({
      name: 'Assigned Tool', category: 'tools', resourceKind: 'durable', description: '', location: 'Workshop',
      purchaseDate: null, purchaseVendor: '', purchaseReference: '', usageNotes: '', manualUrl: '', quantity: 1, unit: 'set',
      ownerId: 'profile-2',
    })).resolves.toEqual({ ok: true, data: { id: 'resource-1' } });
    expect(rpc).toHaveBeenCalledWith('create_resource', expect.objectContaining({ p_owner_id: 'profile-2' }));
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
    const { client, storageFrom } = createClient();
    const downloadUrl = vi.fn().mockResolvedValue('https://oss.example/signed');
    const result = await new SupabaseOkrRepository(client, createAttachmentTransport({ downloadUrl })).createAttachmentDownload('attachment-1');
    expect(result).toEqual({ ok: true, data: { url: 'https://oss.example/signed' } });
    expect(downloadUrl).toHaveBeenCalledWith('attachment-1');
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('creates resource metadata before uploading through the resource OSS transport without Supabase Storage', async () => {
    const rpc = vi.fn(async (name: string) => name === 'begin_resource_attachment_upload'
      ? { data: { id: 'resource-attachment-1', path: 'organization/o/resources/r/resource-attachment-1/manual.pdf' }, error: null }
      : { data: null, error: null });
    const upload = vi.fn(async (_id: string, _file: File, onProgress: (value: number) => void, _signal: AbortSignal, onVerifying?: () => void) => {
      onProgress(50);
      onVerifying?.();
      onProgress(100);
    });
    const { client, storageFrom } = createClient();
    client.rpc = rpc;
    const resourceTransport = createAttachmentTransport({ upload });
    const file = new File(['manual'], 'manual.pdf', { type: 'application/pdf' });

    const updates: Array<{ state: string; progress: number }> = [];
    const result = await new SupabaseOkrRepository(client, createAttachmentTransport(), resourceTransport).uploadResourceAttachment('resource-1', file, (update) => updates.push(update));

    expect(result).toEqual({ ok: true, data: { id: 'resource-attachment-1' } });
    expect(rpc).toHaveBeenCalledWith('begin_resource_attachment_upload', {
      p_resource_id: 'resource-1', p_original_name: 'manual.pdf', p_mime_type: 'application/pdf', p_byte_size: file.size,
    });
    expect(upload).toHaveBeenCalledWith('resource-attachment-1', file, expect.any(Function), expect.any(AbortSignal), expect.any(Function));
    expect(updates).toEqual([
      { state: 'uploading', progress: 0 },
      { state: 'uploading', progress: 50 },
      { state: 'verifying', progress: 99 },
      { state: 'uploaded', progress: 100 },
    ]);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]!);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('removes the resource attachment after its OSS PUT fails', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'resource-attachment-1', path: 'organization/o/resources/r/resource-attachment-1/manual.pdf' }, error: null }));
    const upload = vi.fn(async () => { throw new Error('OSS upload failed (HTTP 503)'); });
    const remove = vi.fn(async () => undefined);
    const { client } = createClient();
    client.rpc = rpc;

    await expect(new SupabaseOkrRepository(client, createAttachmentTransport(), createAttachmentTransport({ upload, remove }))
      .uploadResourceAttachment('resource-1', new File(['manual'], 'manual.pdf', { type: 'application/pdf' })))
      .resolves.toEqual({ ok: false, error: { code: 'storage', message: '请求未完成，请稍后重试' } });

    expect(remove).toHaveBeenCalledWith('resource-attachment-1');
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]!);
  });

  it('removes the resource attachment after OSS finalization fails', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'resource-attachment-1', path: 'organization/o/resources/r/resource-attachment-1/manual.pdf' }, error: null }));
    const upload = vi.fn(async () => { throw new Error('Attachment API failed (HTTP 502)'); });
    const remove = vi.fn(async () => undefined);
    const { client } = createClient();
    client.rpc = rpc;

    await new SupabaseOkrRepository(client, createAttachmentTransport(), createAttachmentTransport({ upload, remove }))
      .uploadResourceAttachment('resource-1', new File(['manual'], 'manual.pdf', { type: 'application/pdf' }));

    expect(remove).toHaveBeenCalledWith('resource-attachment-1');
  });

  it('allocates a clean attachment ID when retrying after an OSS upload failure', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'resource-attachment-failed', path: 'organization/o/resources/r/resource-attachment-failed/manual.pdf' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'resource-attachment-retry', path: 'organization/o/resources/r/resource-attachment-retry/manual.pdf' }, error: null });
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('OSS upload failed (HTTP 503)'))
      .mockResolvedValueOnce(undefined);
    const remove = vi.fn(async () => undefined);
    const { client } = createClient();
    client.rpc = rpc;
    const repository = new SupabaseOkrRepository(client, createAttachmentTransport(), createAttachmentTransport({ upload, remove }));
    const file = new File(['manual'], 'manual.pdf', { type: 'application/pdf' });

    await expect(repository.uploadResourceAttachment('resource-1', file)).resolves.toEqual({ ok: false, error: { code: 'storage', message: '请求未完成，请稍后重试' } });
    await expect(repository.uploadResourceAttachment('resource-1', file)).resolves.toEqual({ ok: true, data: { id: 'resource-attachment-retry' } });

    expect(upload.mock.calls.map(([id]) => id)).toEqual(['resource-attachment-failed', 'resource-attachment-retry']);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('resource-attachment-failed');
  });

  it('returns the resource cleanup error when cleanup cannot remove a failed upload', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'resource-attachment-1', path: 'organization/o/resources/r/resource-attachment-1/manual.pdf' }, error: null }));
    const upload = vi.fn(async () => { throw new Error('OSS upload failed (HTTP 503)'); });
    const remove = vi.fn(async () => { throw new Error('OSS deletion network error'); });
    const { client } = createClient();
    client.rpc = rpc;

    await expect(new SupabaseOkrRepository(client, createAttachmentTransport(), createAttachmentTransport({ upload, remove }))
      .uploadResourceAttachment('resource-1', new File(['manual'], 'manual.pdf', { type: 'application/pdf' })))
      .resolves.toEqual({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });

    expect(remove).toHaveBeenCalledWith('resource-attachment-1');
  });

  it('gets resource download URLs through the resource OSS transport without Supabase Storage', async () => {
    const { client, storageFrom } = createClient();
    const downloadUrl = vi.fn(async () => 'https://oss.example/resource-download');
    const resourceTransport = createAttachmentTransport({ downloadUrl });

    await expect(new SupabaseOkrRepository(client, createAttachmentTransport(), resourceTransport).createResourceAttachmentDownload('resource-attachment-1'))
      .resolves.toEqual({ ok: true, data: { url: 'https://oss.example/resource-download' } });

    expect(downloadUrl).toHaveBeenCalledWith('resource-attachment-1');
    expect(storageFrom).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ data: 1, error: null });
    const upload = vi.fn().mockImplementation(async (_id, _file, onProgress) => onProgress(100));
    const { client } = createClient();
    client.rpc = rpc;
    client.storage.from = vi.fn(() => ({ upload, createSignedUrl: vi.fn(), remove: vi.fn() }));
    const input = { reportDate: '2026-08-13', status: 'submitted' as const, classification: 'internal' as const, blocks: [{ dailyObjective: '目标', linkedKeyResultId: 'kr-1', workDescription: '执行 KR', hours: 2, result: '完成', evidenceLinks: [] }], evidenceLinks: [] };
    const result = await new SupabaseOkrRepository(client, createAttachmentTransport({ upload })).createDailyReportWithAttachments(input, [{ file: new File(['x'], 'a.pdf', { type: 'application/pdf' }), classification: 'confidential' }]);
    expect(result).toEqual({ ok: true, data: { id: 'report-shell', revision: 1 } });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(['begin_daily_report_with_attachments', 'begin_attachment_upload', 'update_daily_report_with_attachments']);
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[2]!);
  });

  it('does not transfer legacy save attachments during report submission', async () => {
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
