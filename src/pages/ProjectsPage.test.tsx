import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository, OrganizationUser } from '../data/types';
import type { User } from '../domain/types';
import { mockRepository, type DashboardData } from '../mocks/repository';
import { ProjectsPage } from './ProjectsPage';

const management: User = { id: 'user-management', name: '王敏', role: 'management', title: '运营总监', department: '管理层', projectIds: ['project-nova'] };
const leader: User = { id: 'user-project-leader', name: '李然', role: 'project_leader', title: '项目负责人', department: '产品部', projectIds: ['project-orion'] };
const employee: User = { id: 'user-employee', name: '周琳', role: 'employee', title: '产品经理', department: '产品部', projectIds: ['project-orion'] };
const hr: User = { id: 'user-hr', name: '孙悦', role: 'hr', title: '人力伙伴', department: '人力资源部', projectIds: [] };

const eligibleUsers: OrganizationUser[] = [
  { id: 'user-project-leader', displayName: '李然', email: '', department: '产品部', jobTitle: '项目负责人', role: 'project_leader', isActive: true, onboardingCompleted: true, projectIds: [] },
  { id: 'user-employee', displayName: '周琳', email: '', department: '产品部', jobTitle: '产品经理', role: 'employee', isActive: true, onboardingCompleted: true, projectIds: [] },
];

const activeProject = {
  id: 'project-orion', name: '星图增长计划', description: '提升核心用户激活。', leaderId: 'user-project-leader',
  memberIds: ['user-project-leader', 'user-employee'], classification: 'internal' as const,
  startDate: '2026-06-01', dueDate: '2026-08-31', status: 'on_track' as const,
};

const archivedProject = {
  id: 'project-archived', name: '已归档历史项目', description: '', leaderId: 'user-management',
  memberIds: [], classification: 'internal' as const, startDate: '2026-01-01', dueDate: '2026-02-01',
  status: 'on_track' as const, lifecycle: 'archived' as const,
};

function dashboardWith(projects: DashboardData['projects']): DashboardData {
  return { ...mockRepository.getDashboardData('user-management'), projects };
}

function makeRepository(overrides: Record<string, unknown> = {}): OkrRepository {
  return {
    mode: 'supabase',
    getDashboardData: vi.fn(async () => ({ ok: true, data: dashboardWith([activeProject, archivedProject]) })),
    listOrganizationUsers: vi.fn(async () => ({ ok: true, data: eligibleUsers })),
    createProject: vi.fn(async () => ({ ok: true, data: { id: 'new-project' } })),
    updateProject: vi.fn(async () => ({ ok: true, data: undefined })),
    archiveProject: vi.fn(async () => ({ ok: true, data: undefined })),
    restoreProject: vi.fn(async () => ({ ok: true, data: undefined })),
    setProjectLeader: vi.fn(async () => ({ ok: true, data: undefined })),
    setProjectMembers: vi.fn(async () => ({ ok: true, data: undefined })),
    ...overrides,
  } as unknown as OkrRepository;
}

function renderPage(user: User, dataRepository: OkrRepository) {
  const authValue: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser: user, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter><ProjectsPage dataRepository={dataRepository} /></MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProjectsPage list', () => {
  it('renders permitted projects and hides archived projects by default', async () => {
    renderPage(management, makeRepository());

    expect(await screen.findByText('星图增长计划')).toBeVisible();
    expect(screen.queryByText('已归档历史项目')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '显示已归档' }));
    expect(await screen.findByText('已归档历史项目')).toBeVisible();
  });

  it('shows create for management but not for employees or HR', async () => {
    const { unmount } = renderPage(management, makeRepository());
    expect(await screen.findByRole('button', { name: '新建项目' })).toBeVisible();
    unmount();

    renderPage(employee, makeRepository());
    expect(await screen.findByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '新建项目' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档项目' })).not.toBeInTheDocument();
  });

  it('shows a safe loading state while data is pending', () => {
    const repo = makeRepository({ getDashboardData: vi.fn(() => new Promise(() => undefined)) });
    renderPage(management, repo);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载');
  });

  it('shows a localized error when the list read fails', async () => {
    const repo = makeRepository({ getDashboardData: vi.fn(async () => ({ ok: false, error: { code: 'network', message: '' } })) });
    renderPage(management, repo);
    expect(await screen.findByRole('alert')).toHaveTextContent('请求未完成，请稍后重试');
  });
});

describe('ProjectsPage create', () => {
  it('creates a project through the repository and refreshes', async () => {
    const repo = makeRepository();
    renderPage(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '新建项目' }));
    await userEvent.type(screen.getByLabelText(/项目名称/), '新研发项目');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /项目负责人/ }), 'user-project-leader');
    fireEvent.change(screen.getByLabelText(/开始日期/), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/截止日期/), { target: { value: '2026-10-01' } });
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.createProject).toHaveBeenCalledWith(expect.objectContaining({
      name: '新研发项目', leaderId: 'user-project-leader', startDate: '2026-09-01', dueDate: '2026-10-01', status: 'active',
    })));
    expect(repo.getDashboardData).toHaveBeenCalledTimes(2);
  });

  it('blocks submission with an empty name', async () => {
    renderPage(management, makeRepository());
    await userEvent.click(await screen.findByRole('button', { name: '新建项目' }));

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('blocks submission with an inverted date range', async () => {
    renderPage(management, makeRepository());
    await userEvent.click(await screen.findByRole('button', { name: '新建项目' }));

    await userEvent.type(screen.getByLabelText(/项目名称/), '日期错误项目');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /项目负责人/ }), 'user-project-leader');
    fireEvent.change(screen.getByLabelText(/开始日期/), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(/截止日期/), { target: { value: '2026-09-01' } });

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('keeps the modal open and shows an error when the server rejects the create', async () => {
    const repo = makeRepository({ createProject: vi.fn(async () => ({ ok: false, error: { code: 'validation', message: '' } })) });
    renderPage(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '新建项目' }));
    await userEvent.type(screen.getByLabelText(/项目名称/), '失败项目');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /项目负责人/ }), 'user-project-leader');
    fireEvent.change(screen.getByLabelText(/开始日期/), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/截止日期/), { target: { value: '2026-10-01' } });
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('提交内容未通过验证');
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

describe('ProjectsPage edit', () => {
  it('lets management edit a project', async () => {
    const repo = makeRepository();
    renderPage(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '编辑' }));
    await userEvent.clear(screen.getByLabelText(/项目名称/));
    await userEvent.type(screen.getByLabelText(/项目名称/), '改名项目');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.updateProject).toHaveBeenCalledWith(expect.objectContaining({ name: '改名项目' })));
  });

  it('lets a project leader edit their own project without a leader field', async () => {
    const repo = makeRepository();
    renderPage(leader, repo);

    await userEvent.click(await screen.findByRole('button', { name: '编辑' }));
    expect(screen.getByLabelText(/项目名称/)).toBeVisible();
    expect(screen.queryByLabelText(/项目负责人/)).not.toBeInTheDocument();
  });

  it('does not offer edit or archive to an unrelated employee', async () => {
    renderPage(employee, makeRepository());

    expect(await screen.findByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档项目' })).not.toBeInTheDocument();
  });

  it('does not offer project mutation to HR', async () => {
    renderPage(hr, makeRepository());

    expect(await screen.findByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '新建项目' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档项目' })).not.toBeInTheDocument();
  });
});

describe('ProjectsPage archive/restore', () => {
  it('archives a project after confirmation', async () => {
    const repo = makeRepository();
    renderPage(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '归档项目' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '确认归档' }));

    await waitFor(() => expect(repo.archiveProject).toHaveBeenCalledWith('project-orion'));
    expect(repo.getDashboardData).toHaveBeenCalledTimes(2);
  });

  it('restores an archived project', async () => {
    const repo = makeRepository();
    renderPage(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '显示已归档' }));
    await userEvent.click(screen.getByRole('button', { name: '恢复项目' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '恢复项目' }));

    await waitFor(() => expect(repo.restoreProject).toHaveBeenCalledWith('project-archived'));
  });
});
