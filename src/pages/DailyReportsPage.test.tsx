import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../auth/AuthContext';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { mockRepository } from '../mocks/repository';
import type { DailyReportAttachmentUploadInput, OkrRepository } from '../data/types';
import type { DailyReport, DailyReportDetail } from '../domain/types';
import { currentBusinessDate } from '../domain/progressStatus';
import { DailyReportsPage } from './DailyReportsPage';

function renderPageAs(userId: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={['/reports?tab=daily']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

function editableReport(authorId: string, withRetainedAttachment = false): DailyReport {
  const attachment = withRetainedAttachment
    ? [{ id: 'retained', attachmentId: 'attachment-retained', label: '保留附件', kind: 'file' as const, classification: 'internal' as const, uploadState: 'uploaded' as const }]
    : [];
  return {
    id: 'report-server-authority', authorId, projectId: 'project-orion', objectiveId: 'objective-orion-activation', keyResultIds: ['kr-orion-onboarding'],
    date: currentBusinessDate(), content: '当前目标', dailyObjective: '当前目标', classification: 'internal', hours: 2,
    evidence: attachment.map((item) => item.label), evidenceClassification: 'internal', attachmentIds: attachment.flatMap((item) => item.attachmentId ? [item.attachmentId] : []), status: 'submitted', currentRevision: 1,
    blocks: [{ id: 'block-current', dailyObjective: '当前目标', keyResultId: 'kr-orion-onboarding', workDescription: '当前工作', hours: 2, result: '当前结果', keyResults: [], evidenceItems: attachment }],
  };
}

function detailFor(report: DailyReport, overrides: Partial<DailyReportDetail> = {}): DailyReportDetail {
  return {
    id: report.id,
    authorId: report.authorId,
    authorName: '陈敏',
    date: report.date,
    status: report.status,
    hours: report.hours,
    currentRevision: report.currentRevision ?? 1,
    blocks: report.blocks ?? [],
    comments: [],
    canComment: false,
    canConfirm: false,
    ...overrides,
  };
}

describe('DailyReportsPage', () => {
  it('shows a clear fill-today CTA when the employee owns assigned KRs', () => {
    renderPageAs('user-employee');
    expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
  });

  it('opens today\'s existing unconfirmed report from the fill-today CTA instead of a blank duplicate', async () => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-employee');
    const report = editableReport(data.currentUser.id);
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [report] } })),
      listReportRevisions: vi.fn(async () => ({ ok: true as const, data: [] })),
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: '填写今日日报' }));

    expect(screen.getByRole('heading', { name: '编辑我的日报' })).toBeVisible();
    expect(screen.getByDisplayValue('当前目标')).toBeVisible();
  });

  it('keeps the fill-today CTA locked when today\'s report is already confirmed', async () => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-employee');
    const report = { ...editableReport(data.currentUser.id), status: 'confirmed' as const };
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [report] } })),
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: '填写今日日报' }));

    expect(screen.getByText('日报已锁定')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '填写今日日报' })).not.toBeInTheDocument();
  });

  it('lets an employee submit a Daily OKR entry with work, result, and hours', async () => {
    const user = userEvent.setup();
    renderPageAs('user-employee');

    await user.click(screen.getByRole('button', { name: '填写今日日报' }));
    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-orion-onboarding');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText(/工作描述/), '完成样本 A 测量');
    await user.type(screen.getByLabelText(/结果/), '完成数据采集');
    await user.type(screen.getByLabelText(/记录工时/), '3.5');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(screen.getByText('日报已保存。')).toBeVisible();
    expect(screen.getAllByText('1 条日报事项').length).toBeGreaterThan(0);
  });

  it('keeps management out of daily report authoring', () => {
    renderPageAs('user-management');
    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
  });

  it('loads a member report on demand and confirms it through the detail review path', async () => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-project-leader');
    const memberReport = editableReport('user-employee');
    const confirmDailyReport = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [memberReport] } })),
      getDailyReportDetail: vi.fn(async () => ({ ok: true as const, data: detailFor(memberReport, { canComment: true, canConfirm: true }) })),
      confirmDailyReport,
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: '查看详情' }));
    expect(dataRepository.getDailyReportDetail).toHaveBeenCalledWith(memberReport.id);
    expect(await screen.findByRole('dialog', { name: /日报详情/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '确认成员日报' }));

    expect(confirmDailyReport).toHaveBeenCalledWith(memberReport.id, memberReport.currentRevision);
    expect(screen.getByText('成员日报已确认。')).toBeVisible();
    expect(screen.queryByRole('button', { name: '确认成员日报' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: '项目成员日报' })).getByText('已确认')).toBeVisible();
  });

  it('does not infer confirmation authority from the current role or report status', async () => {
    const data = mockRepository.getDashboardData('user-project-leader');
    const submittedReport = editableReport('user-employee');
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [submittedReport] } })),
      getDailyReportDetail: vi.fn(async () => ({ ok: true as const, data: detailFor(submittedReport, { canComment: false, canConfirm: false }) })),
      confirmDailyReport: vi.fn(async () => ({ ok: true as const, data: undefined })),
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await userEvent.setup().click(await screen.findByRole('button', { name: '查看详情' }));
    await screen.findByRole('dialog', { name: /日报详情/ });
    expect(screen.queryByRole('button', { name: '确认成员日报' })).not.toBeInTheDocument();
  });

  it('keeps list summaries compact and restores focus after closing an on-demand detail', async () => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-employee');
    const report = editableReport(data.currentUser.id);
    const getDailyReportDetail = vi.fn(async () => ({ ok: true as const, data: detailFor(report) }));
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [report] } })),
      getDailyReportDetail,
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText('1 条日报事项')).toBeVisible();
    expect(screen.queryByText('当前工作')).not.toBeInTheDocument();
    expect(screen.queryByText('当前结果')).not.toBeInTheDocument();

    const viewButton = screen.getByRole('button', { name: '查看详情' });
    await user.click(viewButton);
    expect(getDailyReportDetail).toHaveBeenCalledWith(report.id);
    expect(await screen.findByText('当前工作')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /日报详情/ })).not.toBeInTheDocument();
    expect(viewButton).toHaveFocus();
  });

  it('clears residual report details when a later detail request is denied', async () => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-project-leader');
    const first = { ...editableReport('user-employee'), id: 'report-first' };
    const second = { ...editableReport('user-employee'), id: 'report-second', date: '2026-08-23' };
    const getDailyReportDetail = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: detailFor(first) })
      .mockResolvedValueOnce({ ok: false, error: { code: 'unauthorized', message: 'denied' } });
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [first, second] } })),
      getDailyReportDetail,
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    const viewButtons = await screen.findAllByRole('button', { name: '查看详情' });
    await user.click(viewButtons[0]);
    expect(await screen.findByText('当前工作')).toBeVisible();
    await user.keyboard('{Escape}');

    await user.click(viewButtons[1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('你没有执行此操作的权限。');
    expect(screen.queryByText('当前工作')).not.toBeInTheDocument();
  });

  it('keeps HR on an hours-only view without report bodies', () => {
    renderPageAs('user-hr');
    expect(screen.getByRole('table', { name: '授权工时日报' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/当日 O/)).not.toBeInTheDocument();
  });

  it('edits today\'s unconfirmed report through explicit attachment adoption and session submission', async () => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-employee');
    const employee = data.currentUser;
    const report: DailyReport = {
      id: 'report-current', authorId: employee.id, projectId: 'project-orion', objectiveId: 'objective-orion-activation',
      keyResultIds: ['kr-orion-onboarding'], date: currentBusinessDate(), content: '当前目标', dailyObjective: '当前目标', classification: 'internal', hours: 2,
      evidence: ['保留附件', '移除附件'], evidenceClassification: 'internal', attachmentIds: ['attachment-retained', 'attachment-removed'], status: 'submitted', currentRevision: 1,
      blocks: [{
        id: 'block-current', dailyObjective: '当前目标', keyResultId: 'kr-orion-onboarding', workDescription: '当前工作', hours: 2, result: '当前结果', keyResults: [],
        evidenceItems: [
          { id: 'retained', attachmentId: 'attachment-retained', label: '保留附件', kind: 'file', classification: 'internal', uploadState: 'uploaded' },
          { id: 'removed', attachmentId: 'attachment-removed', label: '移除附件', kind: 'file', classification: 'internal', uploadState: 'uploaded' },
        ],
      }],
    };
    const createAttachmentDownload = vi.fn(async () => ({ ok: true as const, data: { url: 'https://storage.example/signed' } }));
    const removeAttachment = vi.fn(async () => ({ ok: true as const, data: undefined }));
    let sessionNumber = 0;
    const beginDailyReportUploadSession = vi.fn(async () => {
      sessionNumber += 1;
      return { ok: true as const, data: { reportId: report.id, sessionId: `session-edit-${sessionNumber}` } };
    });
    const adoptDailyReportAttachments = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const submitDailyReportSession = vi.fn(async () => ({ ok: true as const, data: { id: report.id, revision: 2 } }));
    const uploadDailyReportAttachment = vi.fn(async () => ({ ok: true as const, data: { attachmentId: 'attachment-new' } }));
    const abandonDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [report] } })),
      listReportRevisions: vi.fn(async () => ({ ok: true as const, data: [] })),
      createAttachmentDownload,
      removeAttachment,
      beginDailyReportUploadSession,
      adoptDailyReportAttachments,
      submitDailyReportSession,
      uploadDailyReportAttachment,
      abandonDailyReportUploadSession,
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: employee, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter initialEntries={['/reports?tab=daily']}><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: '编辑我的日报' }));
    await user.click(screen.getByRole('button', { name: '下载 保留附件' }));
    expect(createAttachmentDownload).toHaveBeenCalledWith('attachment-retained');
    expect(anchorClick).toHaveBeenCalledOnce();

    await user.clear(screen.getByLabelText('成果 1'));
    await user.type(screen.getByLabelText('成果 1'), '保留附件新名称');
    expect(screen.queryByRole('option', { name: '机密' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除 移除附件' }));
    expect(removeAttachment).toHaveBeenCalledWith('attachment-removed', { preserveRevisionHistory: true });
    expect(screen.queryByDisplayValue('移除附件')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '编辑我的日报' }));
    expect(screen.getByDisplayValue('保留附件')).toBeVisible();
    expect(screen.getByDisplayValue('移除附件')).toBeVisible();

    await user.clear(screen.getByLabelText('成果 1'));
    await user.type(screen.getByLabelText('成果 1'), '保留附件新名称');
    await user.click(screen.getByRole('button', { name: '移除 移除附件' }));

    await user.click(screen.getByRole('button', { name: '保存日报修改' }));
    expect(beginDailyReportUploadSession).toHaveBeenLastCalledWith(expect.objectContaining({ reportDate: currentBusinessDate() }));
    expect(adoptDailyReportAttachments).toHaveBeenCalledWith(
      { reportId: report.id, sessionId: 'session-edit-1' },
      ['attachment-retained'],
    );
    expect(submitDailyReportSession).toHaveBeenCalledWith(expect.objectContaining({ blocks: [expect.objectContaining({
      attachments: [{ attachmentId: 'attachment-retained', displayName: '保留附件新名称', classification: 'internal' }],
    })], reportDate: currentBusinessDate() }), 'session-edit-1');
    expect(removeAttachment).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('button', { name: '编辑我的日报' })).toHaveLength(1);
    expect(screen.getByRole('cell', { name: currentBusinessDate() })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '编辑我的日报' }));
    expect(screen.getByDisplayValue('保留附件新名称')).toBeVisible();
    expect(screen.queryByDisplayValue('保留附件')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('移除附件')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存日报修改' }));
    expect(adoptDailyReportAttachments).toHaveBeenNthCalledWith(
      2,
      { reportId: report.id, sessionId: 'session-edit-2' },
      ['attachment-retained'],
    );
    expect(submitDailyReportSession).toHaveBeenNthCalledWith(2, expect.anything(), 'session-edit-2');
    anchorClick.mockRestore();
  });

  it('passes today, clearance, and upload transport into the real authoring form', async () => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-employee');
    const employee = data.currentUser;
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-today', sessionId: 'session-today' } }));
    const uploadDailyReportAttachment = vi.fn(async ({ onChange }: DailyReportAttachmentUploadInput) => {
      onChange({ state: 'uploaded', progress: 100, attachmentId: 'attachment-new' });
      return { ok: true as const, data: { attachmentId: 'attachment-new' } };
    });
    const removeAttachment = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data })),
      beginDailyReportUploadSession,
      uploadDailyReportAttachment,
      abandonDailyReportUploadSession: vi.fn(async () => ({ ok: true as const, data: undefined })),
      adoptDailyReportAttachments: vi.fn(async () => ({ ok: true as const, data: undefined })),
      submitDailyReportSession: vi.fn(async () => ({ ok: true as const, data: { id: 'report-today', revision: 1 } })),
      removeAttachment,
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: employee, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: '填写今日日报' }));
    expect(screen.queryByRole('option', { name: '机密' })).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'page.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(uploadDailyReportAttachment).toHaveBeenCalledOnce());
    expect(screen.getByRole('progressbar', { name: 'page.pdf 上传进度' })).toHaveValue(100);
    expect(screen.getByText('上传完成')).toBeVisible();
    expect(screen.getByText('100%')).toBeVisible();
    expect(beginDailyReportUploadSession).toHaveBeenCalledWith({
      reportDate: currentBusinessDate(), status: 'submitted', classification: 'public',
    });
    await user.click(screen.getByRole('button', { name: '移除 page.pdf' }));
    expect(removeAttachment).toHaveBeenCalledWith('attachment-new', { preserveRevisionHistory: false });
  });

  it.each([
    ['clearance', '附件密级超过权限'],
    ['storage', '附件存储失败，请重试。'],
    ['network', '网络错误，请检查连接后重试。'],
    ['locked', '日报已锁定'],
  ] as const)('shows actionable upload error copy for %s', async (error, expectedMessage) => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-employee');
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data })),
      beginDailyReportUploadSession: vi.fn(async () => ({ ok: true as const, data: { reportId: 'report-upload-error', sessionId: 'session-upload-error' } })),
      uploadDailyReportAttachment: vi.fn(async () => ({ ok: false as const, error: { code: error, message: '请求未完成，请稍后重试' } })),
      abandonDailyReportUploadSession: vi.fn(async () => ({ ok: true as const, data: undefined })),
      adoptDailyReportAttachments: vi.fn(async () => ({ ok: true as const, data: undefined })),
      submitDailyReportSession: vi.fn(async () => ({ ok: true as const, data: { id: 'report-upload-error', revision: 1 } })),
      removeAttachment: vi.fn(async () => ({ ok: true as const, data: undefined })),
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: '填写今日日报' }));
    await user.upload(screen.getByLabelText('选择成果附件'), new File(['proof'], 'error.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText(expectedMessage)).toBeVisible();
  });

  it.each([
    ['a prior-day report', { date: '2026-08-20', status: 'submitted' as const }],
    ['a confirmed report today', { date: currentBusinessDate(), status: 'confirmed' as const }],
  ])('locks %s in the page before opening the form', async (_label, state) => {
    const data = mockRepository.getDashboardData('user-employee');
    const report = { ...data.dailyReports.find((candidate) => candidate.authorId === data.currentUser.id)!, ...state };
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [report] } })),
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText('已锁定')).toBeVisible();
    expect(screen.queryByRole('button', { name: '编辑我的日报' })).not.toBeInTheDocument();
  });

  it.each([
    ['save', 'locked', '日报已锁定'],
    ['adoption', 'clearance', '附件密级超过权限'],
  ] as const)('keeps the typed %s failure actionable when the database rejects %s', async (stage, code, expectedMessage) => {
    const user = userEvent.setup();
    const data = mockRepository.getDashboardData('user-employee');
    const report = editableReport(data.currentUser.id, stage === 'adoption');
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: report.id, sessionId: 'session-server-authority' } }));
    const adoptDailyReportAttachments = vi.fn(async () => stage === 'adoption'
      ? { ok: false as const, error: { code, message: '请求未完成，请稍后重试' } }
      : { ok: true as const, data: undefined });
    const submitDailyReportSession = vi.fn(async () => stage === 'save'
      ? { ok: false as const, error: { code, message: '请求未完成，请稍后重试' } }
      : { ok: true as const, data: { id: report.id, revision: 2 } });
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn(async () => ({ ok: true as const, data: { ...data, dailyReports: [report] } })),
      listReportRevisions: vi.fn(async () => ({ ok: true as const, data: [] })),
      beginDailyReportUploadSession,
      uploadDailyReportAttachment: vi.fn(),
      abandonDailyReportUploadSession: vi.fn(async () => ({ ok: true as const, data: undefined })),
      adoptDailyReportAttachments,
      submitDailyReportSession,
    } as unknown as OkrRepository;
    const auth: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: data.currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(
      <AuthContext.Provider value={auth}>
        <LocaleProvider repository={dataRepository}>
          <MemoryRouter><DailyReportsPage dataRepository={dataRepository} /></MemoryRouter>
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: '编辑我的日报' }));
    await user.click(screen.getByRole('button', { name: '保存日报修改' }));

    expect(await screen.findByText(expectedMessage)).toBeVisible();
    if (stage === 'adoption') expect(submitDailyReportSession).not.toHaveBeenCalled();
  });
});
