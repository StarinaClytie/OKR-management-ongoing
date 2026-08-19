import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository, OrganizationUser, ProjectDetail } from '../data/types';
import type { User } from '../domain/types';
import { ProjectDetailPage } from './ProjectDetailPage';

const management: User = { id: 'user-management', name: '王敏', role: 'management', title: '运营总监', department: '管理层', projectIds: [] };
const leader: User = { id: 'user-project-leader', name: '李然', role: 'project_leader', title: '项目负责人', department: '产品部', projectIds: ['project-orion'] };
const employee: User = { id: 'user-employee', name: '周琳', role: 'employee', title: '产品经理', department: '产品部', projectIds: ['project-orion'] };

const detail: ProjectDetail = {
  id: 'project-orion',
  name: '星图增长计划',
  description: '提升核心用户激活。',
  leaderId: 'user-project-leader',
  leaderName: '李然',
  classification: 'internal',
  startDate: '2026-06-01',
  dueDate: '2026-08-31',
  status: 'active',
  archivedAt: null,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  members: [
    { id: 'user-employee', name: '周琳', role: 'employee', department: '产品部', jobTitle: '产品经理', isActive: true, onboardingCompleted: true, isLeader: false },
    { id: 'user-project-peer', name: '赵峰', role: 'employee', department: '数据部', jobTitle: '数据分析师', isActive: true, onboardingCompleted: true, isLeader: false },
  ],
};

const eligibleUsers: OrganizationUser[] = [
  { id: 'user-project-leader', displayName: '李然', email: '', department: '产品部', jobTitle: '项目负责人', role: 'project_leader', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'user-employee', displayName: '周琳', email: '', department: '产品部', jobTitle: '产品经理', role: 'employee', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'user-project-peer', displayName: '赵峰', email: '', department: '数据部', jobTitle: '数据分析师', role: 'employee', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'user-new', displayName: '新成员', email: '', department: '产品部', jobTitle: '工程师', role: 'employee', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'user-inactive', displayName: '停用成员', email: '', department: '', jobTitle: '', role: 'employee', isActive: false, approvalStatus: 'approved', createdAt: '', projectIds: [] },
];

function makeRepository(overrides: Record<string, unknown> = {}): OkrRepository {
  return {
    mode: 'supabase',
    getProjectDetail: vi.fn(async () => ({ ok: true, data: detail })),
    listOrganizationUsers: vi.fn(async () => ({ ok: true, data: eligibleUsers })),
    updateProject: vi.fn(async () => ({ ok: true, data: undefined })),
    setProjectLeader: vi.fn(async () => ({ ok: true, data: undefined })),
    setProjectMembers: vi.fn(async () => ({ ok: true, data: undefined })),
    archiveProject: vi.fn(async () => ({ ok: true, data: undefined })),
    restoreProject: vi.fn(async () => ({ ok: true, data: undefined })),
    ...overrides,
  } as unknown as OkrRepository;
}

function renderDetail(user: User, dataRepository: OkrRepository) {
  const authValue: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser: user, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/projects/project-orion']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage dataRepository={dataRepository} />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProjectDetailPage', () => {
  it('renders project metadata and team for an authorized manager', async () => {
    renderDetail(management, makeRepository());

    expect(await screen.findByRole('heading', { name: '星图增长计划' })).toBeVisible();
    expect(screen.getAllByText('李然').length).toBeGreaterThan(0);
    expect(screen.getByText('周琳')).toBeVisible();
    expect(screen.getByText('尚未配置 OKR')).toBeVisible();
  });

  it('shows access denied for an unauthorized or unknown project', async () => {
    const repo = makeRepository({ getProjectDetail: vi.fn(async () => ({ ok: false, error: { code: 'not_found', message: '' } })) });
    renderDetail(employee, repo);

    expect(await screen.findByRole('heading', { name: '访问受限' })).toBeVisible();
  });

  it('hides mutation actions from an employee member', async () => {
    renderDetail(employee, makeRepository());

    expect(await screen.findByRole('heading', { name: '星图增长计划' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '变更负责人' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '管理成员' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档项目' })).not.toBeInTheDocument();
  });

  it('lets management change the project leader', async () => {
    const repo = makeRepository();
    renderDetail(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '变更负责人' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /项目负责人/ }), 'user-employee');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.setProjectLeader).toHaveBeenCalledWith('project-orion', 'user-employee'));
  });

  it('does not offer leader change to the project leader', async () => {
    renderDetail(leader, makeRepository());

    expect(await screen.findByRole('heading', { name: '星图增长计划' })).toBeVisible();
    expect(screen.getByRole('button', { name: '编辑' })).toBeVisible();
    expect(screen.getByRole('button', { name: '管理成员' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '变更负责人' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档项目' })).not.toBeInTheDocument();
  });

  it('removes and adds members through the member picker', async () => {
    const repo = makeRepository();
    renderDetail(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '管理成员' }));

    // Remove an existing member (周琳).
    await userEvent.click(screen.getByRole('checkbox', { name: /周琳/ }));
    // Add an eligible non-member (新成员).
    await userEvent.click(screen.getByRole('checkbox', { name: /新成员/ }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.setProjectMembers).toHaveBeenCalledWith('project-orion', expect.arrayContaining(['user-project-peer', 'user-new'])));
    const memberIds = (repo.setProjectMembers as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    expect(memberIds).not.toContain('user-employee');
  });

  it('excludes inactive accounts from the member picker', async () => {
    const repo = makeRepository();
    renderDetail(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '管理成员' }));

    expect(screen.getByRole('checkbox', { name: /新成员/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /停用成员/ })).not.toBeInTheDocument();
  });

  it('archives a project after confirmation', async () => {
    const repo = makeRepository();
    renderDetail(management, repo);

    await userEvent.click(await screen.findByRole('button', { name: '归档项目' }));
    await userEvent.click(screen.getByRole('button', { name: '确认归档' }));

    await waitFor(() => expect(repo.archiveProject).toHaveBeenCalledWith('project-orion'));
  });
});
