import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository, ResourceDetail } from '../data/types';
import type { User } from '../domain/types';
import { ResourceDetailPage } from './ResourceDetailPage';

const notifyMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({
  repository: {},
  resourceNotificationService: { notify: notifyMock },
}));

const owner: User = { id: 'user-employee', name: '周琳', role: 'project_leader', title: '项目负责人', department: '产品部', projectIds: ['project-orion'] };
const peer: User = { id: 'user-project-peer', name: '赵峰', role: 'project_leader', title: '项目负责人', department: '数据部', projectIds: ['project-orion'] };
const management: User = { id: 'user-management', name: '王敏', role: 'management', title: '运营总监', department: '管理层', projectIds: ['project-nova'] };

const detail: ResourceDetail = {
  id: 'resource-1',
  name: 'Vacuum Pump A',
  category: 'vacuum',
  resourceKind: 'durable',
  description: 'Rotary vane pump for the clean-room line.',
  ownerId: 'user-employee',
  ownerName: '周琳',
  location: 'Clean Room / Shelf B2',
  purchaseDate: '2026-03-01',
  purchaseVendor: 'Edmund Optics',
  purchaseReference: null,
  usageNotes: 'Run the warm-up cycle first.',
  manualUrl: 'https://example.com/manual',
  quantity: 1,
  unit: null,
  status: 'in_use',
  createdAt: '2026-03-01T10:00:00Z',
  updatedAt: '2026-07-18T14:00:00Z',
  archivedAt: null,
  attachments: [
    { id: 'att-1', fileName: 'pump-manual.pdf', mimeType: 'application/pdf', sizeBytes: 1024, createdAt: '2026-03-01T10:00:00Z' },
  ],
  problems: [
    { id: 'p1', problemType: 'malfunction', description: '泵启动时有异常噪音。', status: 'open', reporterId: 'user-project-leader', reporterName: '李然', reportedAt: '2026-08-02T11:00:00Z', resolvedAt: null, resolvedBy: null, resolvedByName: null, resolutionNote: null, notificationStatus: 'failed', notificationErrorCode: 'email_not_configured' },
    { id: 'p2', problemType: 'location_incorrect', description: '在 Shelf B2 没有找到。', status: 'resolved', reporterId: 'user-project-peer', reporterName: '赵峰', reportedAt: '2026-07-15T10:00:00Z', resolvedAt: '2026-07-15T16:00:00Z', resolvedBy: 'user-employee', resolvedByName: '周琳', resolutionNote: 'Moved to Shelf B3.', notificationStatus: 'sent', notificationErrorCode: null },
  ],
};

function makeRepository(overrides: Record<string, unknown> = {}): OkrRepository {
  return {
    mode: 'supabase',
    getResourceDetail: vi.fn(async () => ({ ok: true, data: detail })),
    reportResourceProblem: vi.fn(async () => ({ ok: true, data: { problemId: 'p-new', notificationId: 'n-new' } })),
    resolveResourceProblem: vi.fn(async () => ({ ok: true, data: undefined })),
    retryResourceProblemNotification: vi.fn(async () => ({ ok: true, data: { problemId: 'p1', notificationId: 'n1', status: 'failed', errorCode: 'email_not_configured' } })),
    updateResource: vi.fn(async () => ({ ok: true, data: undefined })),
    archiveResource: vi.fn(async () => ({ ok: true, data: undefined })),
    restoreResource: vi.fn(async () => ({ ok: true, data: undefined })),
    createResourceAttachmentDownload: vi.fn(async () => ({ ok: true, data: { url: 'https://example.com/download' } })),
    uploadResourceAttachment: vi.fn(async () => ({ ok: true, data: { id: 'att-2' } })),
    ...overrides,
  } as unknown as OkrRepository;
}

function renderDetail(user: User, dataRepository: OkrRepository) {
  const authValue: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser: user, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/resources/resource-1']}>
        <Routes>
          <Route path="/resources/:resourceId" element={<ResourceDetailPage dataRepository={dataRepository} />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ResourceDetailPage', () => {
  beforeEach(() => {
    notifyMock.mockReset();
  });

  it('renders resource metadata, instructions, and attachments', async () => {
    renderDetail(owner, makeRepository());

    expect(await screen.findByRole('heading', { name: 'Vacuum Pump A' })).toBeVisible();
    expect(screen.getByText('周琳')).toBeVisible();
    expect(screen.getByText('Clean Room / Shelf B2')).toBeVisible();
    expect(screen.getByText('使用中')).toBeVisible();
    expect(screen.getByText('Run the warm-up cycle first.')).toBeVisible();
    expect(screen.getByRole('link', { name: '查看手册' })).toHaveAttribute('href', 'https://example.com/manual');
    expect(screen.getByText('pump-manual.pdf')).toBeVisible();
  });

  it('offers report problem to every user, including a non-owner', async () => {
    renderDetail(peer, makeRepository());
    expect(await screen.findByRole('button', { name: '报告问题' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
  });

  it('validates the report form', async () => {
    renderDetail(peer, makeRepository());
    await userEvent.click(await screen.findByRole('button', { name: '报告问题' }));
    expect(screen.getByRole('button', { name: '提交问题' })).toBeDisabled();
  });

  it('reports a problem without changing the authoritative resource status', async () => {
    notifyMock.mockResolvedValue({ delivered: true });
    const repo = makeRepository();
    renderDetail(peer, repo);

    await userEvent.click(await screen.findByRole('button', { name: '报告问题' }));
    await userEvent.selectOptions(screen.getByLabelText(/问题类型/), 'malfunction');
    await userEvent.type(screen.getByLabelText(/问题描述/), '奇怪的震动');
    await userEvent.click(screen.getByRole('button', { name: '提交问题' }));

    await waitFor(() => expect(repo.reportResourceProblem).toHaveBeenCalledWith({ resourceId: 'resource-1', problemType: 'malfunction', description: '奇怪的震动' }));
    expect(repo.updateResource).not.toHaveBeenCalled();
    expect(repo.archiveResource).not.toHaveBeenCalled();
    expect(await screen.findByText('问题已提交。')).toBeVisible();
  });

  it('persists the problem and reports an email delivery failure without losing the report', async () => {
    notifyMock.mockResolvedValue({ delivered: false });
    const repo = makeRepository();
    renderDetail(peer, repo);

    await userEvent.click(await screen.findByRole('button', { name: '报告问题' }));
    await userEvent.type(screen.getByLabelText(/问题描述/), '找不到该设备');
    await userEvent.click(screen.getByRole('button', { name: '提交问题' }));

    await waitFor(() => expect(repo.reportResourceProblem).toHaveBeenCalled());
    expect(await screen.findByText('问题已提交，但邮件通知发送失败。')).toBeVisible();
  });

  it('lets the owner resolve a problem and preserves resolved history', async () => {
    const repo = makeRepository();
    renderDetail(owner, repo);

    expect(await screen.findByText('Moved to Shelf B3.')).toBeVisible();
    const openProblem = screen.getByText('泵启动时有异常噪音。').closest('li')!;
    await userEvent.click(within(openProblem as HTMLElement).getByRole('button', { name: '解决' }));

    await userEvent.type(screen.getByLabelText(/处理说明/), '已更换轴承');
    await userEvent.click(screen.getByRole('button', { name: '确认解决' }));

    await waitFor(() => expect(repo.resolveResourceProblem).toHaveBeenCalledWith({ problemId: 'p1', resolutionNote: '已更换轴承' }));
  });

  it('does not offer resolve to an unrelated employee', async () => {
    renderDetail(peer, makeRepository());
    expect(await screen.findByRole('heading', { name: 'Vacuum Pump A' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '解决' })).not.toBeInTheDocument();
  });

  it('lets management resolve a problem on any resource', async () => {
    const repo = makeRepository();
    renderDetail(management, repo);
    expect(await screen.findByText('泵启动时有异常噪音。')).toBeVisible();
    expect(screen.getAllByRole('button', { name: '解决' }).length).toBeGreaterThan(0);
  });

  it('lets the owner retry a failed notification', async () => {
    notifyMock.mockResolvedValue({ delivered: true });
    const repo = makeRepository();
    renderDetail(owner, repo);

    expect(await screen.findByRole('button', { name: '重新发送通知' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '重新发送通知' }));

    await waitFor(() => expect(repo.retryResourceProblemNotification).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(notifyMock).toHaveBeenCalledWith('n1'));
    expect(await screen.findByText('通知已重新发送。')).toBeVisible();
  });

  it('does not re-send a notification that is already sent', async () => {
    const repo = makeRepository({
      retryResourceProblemNotification: vi.fn(async () => ({ ok: true, data: { problemId: 'p1', notificationId: 'n1', status: 'sent', errorCode: null } })),
    });
    renderDetail(owner, repo);

    await userEvent.click(await screen.findByRole('button', { name: '重新发送通知' }));
    await waitFor(() => expect(repo.retryResourceProblemNotification).toHaveBeenCalledWith('p1'));
    expect(notifyMock).not.toHaveBeenCalled();
    expect(await screen.findByText('通知已发送。')).toBeVisible();
  });

  it('does not offer notification retry to an unrelated employee', async () => {
    renderDetail(peer, makeRepository());
    expect(await screen.findByRole('heading', { name: 'Vacuum Pump A' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '重新发送通知' })).not.toBeInTheDocument();
  });

  it('denies resource detail to roles without resource access', async () => {
    renderDetail({ ...owner, role: 'employee' }, makeRepository());
    expect(await screen.findByRole('heading', { name: '访问受限' })).toBeVisible();
  });
});
