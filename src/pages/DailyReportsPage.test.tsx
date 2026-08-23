import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../auth/AuthContext';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { mockRepository } from '../mocks/repository';
import type { DailyReportAttachmentUploadInput, OkrRepository } from '../data/types';
import type { DailyReport } from '../domain/types';
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

describe('DailyReportsPage', () => {
  it('shows a clear fill-today CTA when the employee owns assigned KRs', () => {
    renderPageAs('user-employee');
    expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
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
    expect(screen.getByText(/完成实验采集第一阶段/)).toBeVisible();
  });

  it('keeps management out of daily report authoring', () => {
    renderPageAs('user-management');
    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
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
    const beginDailyReportUploadSession = vi.fn(async () => ({ ok: true as const, data: { reportId: report.id, sessionId: 'session-edit' } }));
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
      { reportId: report.id, sessionId: 'session-edit' },
      ['attachment-retained'],
    );
    expect(submitDailyReportSession).toHaveBeenCalledWith(expect.objectContaining({ blocks: [expect.objectContaining({
      attachments: [{ attachmentId: 'attachment-retained', displayName: '保留附件新名称', classification: 'internal' }],
    })], reportDate: currentBusinessDate() }), 'session-edit');
    expect(removeAttachment).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('button', { name: '编辑我的日报' })).toHaveLength(1);
    expect(screen.getByRole('cell', { name: currentBusinessDate() })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '编辑我的日报' }));
    expect(screen.getByDisplayValue('保留附件新名称')).toBeVisible();
    expect(screen.queryByDisplayValue('保留附件')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('移除附件')).not.toBeInTheDocument();
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
    expect(beginDailyReportUploadSession).toHaveBeenCalledWith({
      reportDate: currentBusinessDate(), status: 'submitted', classification: 'internal',
    });
    await user.click(screen.getByRole('button', { name: '移除 page.pdf' }));
    expect(removeAttachment).toHaveBeenCalledWith('attachment-new', { preserveRevisionHistory: false });
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
});
