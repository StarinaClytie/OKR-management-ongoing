import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DailyReportDraft } from '../../domain/dailyEntry';
import type { KeyResult, Objective } from '../../domain/types';
import type { DailyReportAttachmentUploadInput, OkrRepository } from '../../data/types';
import { DailyReportForm } from './DailyReportForm';

const objectives: Objective[] = [
  { id: 'objective-1', projectId: 'project-1', title: '下一代光谱仪研发', description: '', ownerId: 'leader', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
];

const ownedKeyResults: KeyResult[] = [
  { id: 'kr-1', objectiveId: 'objective-1', title: '完成控制软件 v1.0', ownerId: 'emp', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
];

function renderForm(onSubmit?: (draft: DailyReportDraft) => { ok: true }) {
  const onCancel = vi.fn();
  const handleSubmit = vi.fn((draft: DailyReportDraft) => (onSubmit ? onSubmit(draft) : { ok: true as const }));
  render(<DailyReportForm ownedKeyResults={ownedKeyResults} objectives={objectives} onCancel={onCancel} onSubmit={handleSubmit} />);
  return { onCancel, handleSubmit };
}

function completeDraft(uploadState?: NonNullable<DailyReportDraft['blocks'][number]['evidence'][number]['uploadState']>): DailyReportDraft {
  return {
    classification: 'internal',
    blocks: [{
      id: 'block-1', dailyObjective: '目标', linkedKeyResultId: 'kr-1', workDescription: '执行', hours: 2, result: '完成',
      evidence: uploadState ? [{ id: 'file-1', label: 'proof.pdf', kind: 'file', classification: 'internal', file: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }), attachmentId: uploadState === 'uploaded' ? 'attachment-1' : undefined, uploadState, uploadProgress: uploadState === 'uploaded' ? 100 : 0 }] : [],
    }],
  };
}

type UploadRepository = Required<Pick<OkrRepository, 'beginDailyReportUploadSession' | 'uploadDailyReportAttachment' | 'abandonDailyReportUploadSession' | 'submitDailyReportSession'>>
  & Pick<OkrRepository, 'findDailyReportUploadSession'>;

function uploadRepository(overrides: Partial<UploadRepository> = {}): UploadRepository {
  return {
    beginDailyReportUploadSession: vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-1', sessionId: 'session-1' } })),
    uploadDailyReportAttachment: vi.fn(async () => ({ ok: true as const, data: { attachmentId: 'attachment-1' } })),
    abandonDailyReportUploadSession: vi.fn(async () => ({ ok: true as const, data: undefined })),
    submitDailyReportSession: vi.fn(async () => ({ ok: true as const, data: { id: 'report-1', revision: 1 } })),
    ...overrides,
  };
}

describe('DailyReportForm', () => {
  it.each(['selected', 'pending', 'uploading', 'verifying', 'failed', 'deleting'] as const)('disables submission while attachment state is %s', (uploadState) => {
    render(<DailyReportForm initialDraft={completeDraft(uploadState)} ownedKeyResults={ownedKeyResults} objectives={objectives} onCancel={vi.fn()} onSubmit={vi.fn().mockReturnValue({ ok: true })} />);
    expect(screen.getByRole('button', { name: '提交日报' })).toBeDisabled();
  });

  it('enables submission only when validation passes and all file evidence is uploaded', () => {
    render(<DailyReportForm initialDraft={completeDraft('uploaded')} ownedKeyResults={ownedKeyResults} objectives={objectives} onCancel={vi.fn()} onSubmit={vi.fn().mockReturnValue({ ok: true })} />);
    expect(screen.getByRole('button', { name: '提交日报' })).toBeEnabled();
  });

  it('reminds but does not block submission when no KR is linked', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockReturnValue({ ok: true });
    const draft: DailyReportDraft = {
      classification: 'internal',
      blocks: [{ id: 'block-1', dailyObjective: '目标', linkedKeyResultId: '', workDescription: '执行', hours: 2, result: '完成', evidence: [] }],
    };
    render(<DailyReportForm initialDraft={draft} ownedKeyResults={[]} objectives={objectives} onCancel={vi.fn()} onSubmit={handleSubmit} />);

    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(await screen.findByRole('dialog', { name: '未关联任何 KR' })).toBeVisible();
    expect(handleSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '确认提交' }));
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps submission disabled and names every incomplete attachment when an uploaded state has no attachment id', () => {
    const draft = completeDraft('uploaded');
    draft.blocks[0]!.evidence[0]!.attachmentId = undefined;
    draft.blocks[0]!.evidence.push({ id: 'file-2', label: 'second-proof.pdf', kind: 'file', classification: 'internal', uploadState: 'uploaded', uploadProgress: 100 });

    render(<DailyReportForm initialDraft={draft} ownedKeyResults={ownedKeyResults} objectives={objectives} onCancel={vi.fn()} onSubmit={vi.fn().mockReturnValue({ ok: true })} />);

    expect(screen.getByRole('button', { name: '提交日报' })).toBeDisabled();
    expect(screen.getByText('附件未完成上传：proof.pdf、second-proof.pdf。')).toBeVisible();
  });

  it('keeps submission disabled until a persisted over-clearance attachment is authorized for removal', () => {
    const draft = completeDraft('uploaded');
    draft.blocks[0]!.evidence[0]!.classification = 'confidential';
    render(<DailyReportForm initialDraft={draft} clearance="internal" ownedKeyResults={ownedKeyResults} objectives={objectives} onCancel={vi.fn()} onSubmit={vi.fn().mockReturnValue({ ok: true })} />);
    const submit = screen.getByRole('button', { name: '提交日报' });
    expect(submit).toBeDisabled();
    const describedBy = submit.getAttribute('aria-describedby');
    expect(describedBy).toContain('daily-clearance-changed');
    expect(screen.getByText('附件密级高于你当前的权限，请移除后再提交。')).toHaveAttribute('id', 'daily-clearance-changed');
  });

  it('uses public as the safe report classification for a public-clearance author', async () => {
    const user = userEvent.setup();
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-1', sessionId: 'session-1' } }));
    render(<DailyReportForm
      clearance="public"
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession })}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'public-proof.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(beginDailyReportUploadSession).toHaveBeenCalledWith({
      reportDate: '2026-08-23', status: 'submitted', classification: 'public',
    }));
  });

  it('starts one lazy upload session immediately and updates the selected draft item in place', async () => {
    const user = userEvent.setup();
    const beginDailyReportUploadSession = vi.fn().mockResolvedValue({ ok: true, data: { reportId: 'report-1', sessionId: 'session-1' } });
    const uploadDailyReportAttachment = vi.fn(async ({ onChange }: DailyReportAttachmentUploadInput) => {
      onChange({ state: 'pending', progress: 0 });
      onChange({ state: 'uploading', progress: 50, attachmentId: 'attachment-1' });
      onChange({ state: 'uploaded', progress: 100, attachmentId: 'attachment-1' });
      return { ok: true as const, data: { attachmentId: 'attachment-1' } };
    });
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      clearance="internal"
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession, uploadDailyReportAttachment })}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'proof.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'proof.pdf 上传进度' })).toHaveValue(100));
    expect(beginDailyReportUploadSession).toHaveBeenCalledOnce();
    expect(uploadDailyReportAttachment).toHaveBeenCalledOnce();
    expect(screen.getAllByDisplayValue('proof.pdf')).toHaveLength(1);
  });

  it.each([
    ['locked', '日报已锁定'],
    ['network', '网络错误，请检查连接后重试。'],
  ] as const)('keeps the %s error actionable when upload session creation fails', async (code, expectedMessage) => {
    const user = userEvent.setup();
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: false as const, error: { code, message: '请求未完成，请稍后重试' } }));
    const uploadDailyReportAttachment = vi.fn();
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession, uploadDailyReportAttachment })}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'session.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText(expectedMessage)).toBeVisible();
    expect(uploadDailyReportAttachment).not.toHaveBeenCalled();
  });

  it('retries the same failed draft item without duplicating it', async () => {
    const user = userEvent.setup();
    const uploadDailyReportAttachment = vi.fn()
      .mockImplementationOnce(async ({ onChange }: DailyReportAttachmentUploadInput) => { onChange({ state: 'failed', progress: 0, error: 'network' }); return { ok: false as const, error: { code: 'network' as const, message: 'network' } }; })
      .mockImplementationOnce(async ({ onChange }: DailyReportAttachmentUploadInput) => { onChange({ state: 'uploaded', progress: 100, attachmentId: 'attachment-2' }); return { ok: true as const, data: { attachmentId: 'attachment-2' } }; });
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ uploadDailyReportAttachment })}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'proof.pdf', { type: 'application/pdf' }));
    await user.click(await screen.findByRole('button', { name: '重试' }));

    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'proof.pdf 上传进度' })).toHaveValue(100));
    expect(uploadDailyReportAttachment).toHaveBeenCalledTimes(2);
    expect(screen.getAllByDisplayValue('proof.pdf')).toHaveLength(1);
  });

  it('clears a provisional attachment identity when the repository reports upload failure', async () => {
    const user = userEvent.setup();
    const onRemoveAttachment = vi.fn(async () => true);
    const uploadDailyReportAttachment = vi.fn(async ({ onChange }: DailyReportAttachmentUploadInput) => {
      onChange({ state: 'uploading', progress: 50, attachmentId: 'attachment-provisional' });
      return { ok: false as const, error: { code: 'network' as const, message: 'upload failed' } };
    });
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ uploadDailyReportAttachment })}
      onRemoveAttachment={onRemoveAttachment}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'failed.pdf', { type: 'application/pdf' }));
    await screen.findByRole('button', { name: '重试' });
    await user.click(screen.getByRole('button', { name: '移除 failed.pdf' }));

    expect(onRemoveAttachment).not.toHaveBeenCalled();
  });

  it('awaits session abandonment before invoking cancellation', async () => {
    const user = userEvent.setup();
    let resolveAbandon!: () => void;
    const abandonPromise = new Promise<{ ok: true; data: undefined }>((resolve) => { resolveAbandon = () => resolve({ ok: true, data: undefined }); });
    const abandonDailyReportUploadSession = vi.fn(async (_sessionId: string) => abandonPromise);
    const onCancel = vi.fn();
    render(<DailyReportForm
      initialDraft={completeDraft('uploaded')}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      uploadSession={{ reportId: 'report-1', sessionId: 'session-1' }}
      uploadRepository={uploadRepository({ abandonDailyReportUploadSession })}
      onCancel={onCancel}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(abandonDailyReportUploadSession).toHaveBeenCalledWith('session-1');
    expect(onCancel).not.toHaveBeenCalled();
    resolveAbandon();
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  });

  it('deletes known finalized session uploads before abandoning on cancellation', async () => {
    const user = userEvent.setup();
    const events: string[] = [];
    const onRemoveAttachment = vi.fn(async (_id: string, options?: { preserveRevisionHistory?: boolean }) => {
      events.push(`remove:${String(options?.preserveRevisionHistory)}`);
      return true;
    });
    const abandonDailyReportUploadSession = vi.fn(async () => {
      events.push('abandon');
      return { ok: true as const, data: undefined };
    });
    const uploadDailyReportAttachment = vi.fn(async ({ onChange }: DailyReportAttachmentUploadInput) => {
      onChange({ state: 'uploaded', progress: 100, attachmentId: 'attachment-finalized' });
      return { ok: true as const, data: { attachmentId: 'attachment-finalized' } };
    });
    const onCancel = vi.fn(() => events.push('close'));
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ uploadDailyReportAttachment, abandonDailyReportUploadSession })}
      onRemoveAttachment={onRemoveAttachment}
      onCancel={onCancel}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'cancel.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'cancel.pdf 上传进度' })).toHaveValue(100));
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(onRemoveAttachment).toHaveBeenCalledWith('attachment-finalized', { preserveRevisionHistory: false });
    expect(events).toEqual(['remove:false', 'abandon', 'close']);
  });

  it('does not create a report shell when cancelling a blank form that never started a session', async () => {
    const user = userEvent.setup();
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-1', sessionId: 'session-recovered' } }));
    const abandonDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const onCancel = vi.fn();
    render(<DailyReportForm
      mode="edit"
      initialDraft={completeDraft('uploaded')}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession, abandonDailyReportUploadSession })}
      onCancel={onCancel}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(beginDailyReportUploadSession).not.toHaveBeenCalled();
    expect(abandonDailyReportUploadSession).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('resumes and abandons an existing edit session without creating a replacement shell', async () => {
    const user = userEvent.setup();
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-1', sessionId: 'session-new' } }));
    const findDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-1', sessionId: 'session-existing' } }));
    const abandonDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const onCancel = vi.fn();
    render(<DailyReportForm
      mode="edit"
      initialDraft={completeDraft('uploaded')}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession, findDailyReportUploadSession, abandonDailyReportUploadSession })}
      onCancel={onCancel}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(findDailyReportUploadSession).toHaveBeenCalledWith('2026-08-23');
    expect(abandonDailyReportUploadSession).toHaveBeenCalledWith('session-existing');
    expect(beginDailyReportUploadSession).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('authorizes removal of a finalized session attachment before dropping its draft item', async () => {
    const user = userEvent.setup();
    const onRemoveAttachment = vi.fn(async () => true);
    render(<DailyReportForm
      initialDraft={completeDraft('uploaded')}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      onRemoveAttachment={onRemoveAttachment}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.click(screen.getByRole('button', { name: '移除 proof.pdf' }));

    expect(onRemoveAttachment).toHaveBeenCalledWith('attachment-1');
    expect(screen.queryByDisplayValue('proof.pdf')).not.toBeInTheDocument();
  });

  it('cancels a queued upload when removal happens before lazy session creation finishes', async () => {
    const user = userEvent.setup();
    let resolveSession!: (result: { ok: true; data: { reportId: string; sessionId: string } }) => void;
    const sessionPromise = new Promise<{ ok: true; data: { reportId: string; sessionId: string } }>((resolve) => { resolveSession = resolve; });
    const beginDailyReportUploadSession = vi.fn(async () => sessionPromise);
    const uploadDailyReportAttachment = vi.fn(async () => ({ ok: true as const, data: { attachmentId: 'orphan' } }));
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession, uploadDailyReportAttachment })}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'queued.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: '移除 queued.pdf' }));
    resolveSession({ ok: true, data: { reportId: 'report-1', sessionId: 'session-1' } });

    await waitFor(() => expect(screen.queryByDisplayValue('queued.pdf')).not.toBeInTheDocument());
    expect(uploadDailyReportAttachment).not.toHaveBeenCalled();
  });

  it('requests destructive cleanup when removing a newly finalized session attachment', async () => {
    const user = userEvent.setup();
    const onRemoveAttachment = vi.fn(async () => true);
    const uploadDailyReportAttachment = vi.fn(async ({ onChange }: DailyReportAttachmentUploadInput) => {
      onChange({ state: 'uploaded', progress: 100, attachmentId: 'session-attachment' });
      return { ok: true as const, data: { attachmentId: 'session-attachment' } };
    });
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ uploadDailyReportAttachment })}
      onRemoveAttachment={onRemoveAttachment}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'new.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'new.pdf 上传进度' })).toHaveValue(100));
    await user.click(screen.getByRole('button', { name: '移除 new.pdf' }));

    expect(onRemoveAttachment).toHaveBeenCalledWith('session-attachment', { preserveRevisionHistory: false });
  });

  it('retains current-session cleanup semantics when a removal attempt fails', async () => {
    const user = userEvent.setup();
    const onRemoveAttachment = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const uploadDailyReportAttachment = vi.fn(async ({ onChange }: DailyReportAttachmentUploadInput) => {
      onChange({ state: 'uploaded', progress: 100, attachmentId: 'session-attachment' });
      return { ok: true as const, data: { attachmentId: 'session-attachment' } };
    });
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ uploadDailyReportAttachment })}
      onRemoveAttachment={onRemoveAttachment}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockReturnValue({ ok: true })}
    />);

    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'new.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'new.pdf 上传进度' })).toHaveValue(100));
    await user.click(screen.getByRole('button', { name: '移除 new.pdf' }));
    expect(screen.getByDisplayValue('new.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除 new.pdf' }));

    expect(onRemoveAttachment).toHaveBeenNthCalledWith(1, 'session-attachment', { preserveRevisionHistory: false });
    expect(onRemoveAttachment).toHaveBeenNthCalledWith(2, 'session-attachment', { preserveRevisionHistory: false });
  });

  it('creates a lazy session at submit when a valid report has no attachments', async () => {
    const user = userEvent.setup();
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-1', sessionId: 'session-submit' } }));
    const onSubmit = vi.fn(async () => ({ ok: true as const }));
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession })}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />);

    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(beginDailyReportUploadSession).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(expect.anything(), { reportId: 'report-1', sessionId: 'session-submit' });
  });

  it('shows the dedicated network message when a no-attachment report cannot begin its session', async () => {
    const user = userEvent.setup();
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: false as const, error: { code: 'network' as const, message: '请求未完成，请稍后重试' } }));
    const onSubmit = vi.fn(async () => ({ ok: true as const }));
    render(<DailyReportForm
      initialDraft={completeDraft()}
      ownedKeyResults={ownedKeyResults}
      objectives={objectives}
      reportDate="2026-08-23"
      uploadRepository={uploadRepository({ beginDailyReportUploadSession })}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />);

    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(await screen.findByText('网络错误，请检查连接后重试。')).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cleans finalized evidence before removing its Daily OKR block', async () => {
    const user = userEvent.setup();
    const initialDraft = completeDraft('uploaded');
    initialDraft.blocks.push({ id: 'block-2', dailyObjective: '第二目标', linkedKeyResultId: 'kr-1', workDescription: '第二执行', hours: 1, result: '完成', evidence: [] });
    const onRemoveAttachment = vi.fn(async () => true);
    render(<DailyReportForm initialDraft={initialDraft} ownedKeyResults={ownedKeyResults} objectives={objectives} onRemoveAttachment={onRemoveAttachment} onCancel={vi.fn()} onSubmit={vi.fn().mockReturnValue({ ok: true })} />);

    await user.click(screen.getAllByRole('button', { name: '删除该组' })[0]!);

    expect(onRemoveAttachment).toHaveBeenCalledWith('attachment-1');
    expect(screen.queryByDisplayValue('proof.pdf')).not.toBeInTheDocument();
  });

  it('keeps only the attachments whose cleanup failed when whole-block removal is partial', async () => {
    const user = userEvent.setup();
    const initialDraft = completeDraft('uploaded');
    initialDraft.blocks[0]!.evidence.push({
      id: 'file-2', label: 'second.pdf', kind: 'file', classification: 'internal',
      attachmentId: 'attachment-2', uploadState: 'uploaded', uploadProgress: 100,
    });
    initialDraft.blocks.push({ id: 'block-2', dailyObjective: '第二目标', linkedKeyResultId: 'kr-1', workDescription: '第二执行', hours: 1, result: '完成', evidence: [] });
    const onRemoveAttachment = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    render(<DailyReportForm initialDraft={initialDraft} ownedKeyResults={ownedKeyResults} objectives={objectives} onRemoveAttachment={onRemoveAttachment} onCancel={vi.fn()} onSubmit={vi.fn().mockReturnValue({ ok: true })} />);

    await user.click(screen.getAllByRole('button', { name: '删除该组' })[0]!);
    expect(screen.queryByDisplayValue('proof.pdf')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('second.pdf')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '删除该组' })[0]!);
    expect(onRemoveAttachment.mock.calls).toEqual([
      ['attachment-1'],
      ['attachment-2'],
      ['attachment-2'],
    ]);
  });
  it('renders a first Daily OKR block with the owned-KR selector and a total-hours line', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'Daily OKR #1' })).toBeVisible();
    expect(screen.getByLabelText(/关联季度 KR/)).toBeVisible();
    expect(screen.getByText('今日总工时：0 小时')).toBeVisible();
    expect(screen.queryByRole('button', { name: '添加另一组 Daily OKR' })).not.toBeInTheDocument();
  });

  it('submits a complete entry with objective, KR, work description, result and hours', async () => {
    const user = userEvent.setup();
    let submitted: DailyReportDraft | undefined;
    const { handleSubmit } = renderForm((draft) => { submitted = draft; return { ok: true }; });

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText(/工作描述/), '完成样本 A 测量与数据整理');
    await user.type(screen.getByLabelText(/结果/), '完成 5000 组光谱数据训练');
    await user.type(screen.getByLabelText(/记录工时/), '3.5');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(submitted!.blocks).toHaveLength(1);
    expect(submitted!.blocks[0]).toMatchObject({
      dailyObjective: '完成实验采集第一阶段',
      linkedKeyResultId: 'kr-1',
      workDescription: '完成样本 A 测量与数据整理',
      result: '完成 5000 组光谱数据训练',
      hours: 3.5,
    });
  });

  it('offers another entry only after the current entry is complete', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集');
    await user.type(screen.getByLabelText(/工作描述/), '采集并整理数据');
    await user.type(screen.getByLabelText(/结果/), '完成数据采集');
    await user.type(screen.getByLabelText(/记录工时/), '2');
    expect(screen.getByRole('button', { name: '添加另一组 Daily OKR' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '添加另一组 Daily OKR' }));
    expect(screen.getByRole('heading', { name: 'Daily OKR #2' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '添加另一组 Daily OKR' })).not.toBeInTheDocument();
  });

  it('renders attachment controls inside the Daily OKR entry', () => {
    renderForm();
    const entry = screen.getByRole('heading', { name: 'Daily OKR #1' }).closest('section');
    expect(entry).toContainElement(screen.getByLabelText(/选择成果附件/));
  });

  it('authors file-only evidence after Result / Data and before recorded hours', async () => {
    const user = userEvent.setup();
    const { handleSubmit } = renderForm();
    const result = screen.getByLabelText(/结果/);
    const picker = screen.getByLabelText(/选择成果附件/);
    const hours = screen.getByLabelText(/记录工时/);

    expect(result.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker.compareDocumentPosition(hours) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('关联与成果')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /添加成果附件或链接/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '链接' })).not.toBeInTheDocument();

    const file = new File(['proof'], '实验结果.pdf', { type: 'application/pdf' });
    await user.upload(picker, file);

    expect(screen.getByLabelText('成果 1')).toHaveValue('实验结果.pdf');
    expect(screen.getByLabelText('成果 1 密级')).toHaveValue('internal');
    expect(screen.queryByLabelText('成果 1 类型')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText(/工作描述/), '完成样本 A 测量与数据整理');
    await user.type(result, '完成 5000 组光谱数据训练');
    await user.type(hours, '3.5');
    expect(screen.getByRole('button', { name: '提交日报' })).toBeDisabled();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('blocks submit and add-another while showing an invalid-file upload state', async () => {
    const user = userEvent.setup();
    const { handleSubmit } = renderForm();

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText(/工作描述/), '完成样本 A 测量与数据整理');
    await user.type(screen.getByLabelText(/结果/), '完成 5000 组光谱数据训练');
    await user.type(screen.getByLabelText(/记录工时/), '3.5');
    await user.upload(screen.getByLabelText('选择成果附件'), new File(['bad'], 'proof.pdf', { type: 'text/plain' }));

    expect(screen.queryByRole('button', { name: '添加另一组 Daily OKR' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交日报' })).toBeDisabled();
    expect(screen.getByText('附件不符合上传要求')).toBeVisible();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('keeps submission disabled until all required controls are complete', async () => {
    const { handleSubmit } = renderForm();
    expect(screen.getByRole('button', { name: '提交日报' })).toBeDisabled();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('keeps submission disabled when work description and hours are invalid', async () => {
    const user = userEvent.setup();
    renderForm();
    const hours = screen.getByLabelText(/记录工时/);

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.clear(hours);
    await user.type(hours, '-1');
    expect(screen.getByRole('button', { name: '提交日报' })).toBeDisabled();
  });

  it('saves a complete edit draft containing legacy link evidence', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(() => ({ ok: true as const }));
    render(
      <DailyReportForm
        mode="edit"
        initialDraft={{
          classification: 'internal',
          blocks: [{
            id: 'block-1', dailyObjective: '完成实验采集第一阶段', linkedKeyResultId: 'kr-1',
            workDescription: '完成样本 A 测量与数据整理', hours: 3.5, result: '完成 5000 组光谱数据训练',
            evidence: [{ id: 'legacy-link', label: '历史设计文档', kind: 'link', classification: 'internal' }],
          }],
        }}
        ownedKeyResults={ownedKeyResults}
        objectives={objectives}
        onCancel={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /保存.*修改/ }));

    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [expect.objectContaining({ evidence: [expect.objectContaining({ kind: 'link' })] })],
    }));
  });
});
