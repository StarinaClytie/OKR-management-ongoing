import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import type { User } from '../domain/types';
import type { DashboardData } from '../data/types';
import { mockRepository } from '../mocks/repository';
import { ProjectsPage } from './ProjectsPage';

const management: User = { id: 'user-management', name: '王敏', role: 'management', clearance: 'internal', title: '运营总监', department: '管理层', projectIds: ['project-nova'] };
const employee: User = { id: 'user-employee', name: '周琳', role: 'employee', clearance: 'internal', title: '产品经理', department: '产品部', projectIds: ['project-orion'] };

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

describe('ProjectsPage execution view', () => {
  it('renders permitted projects and hides archived projects by default', async () => {
    renderPage(management, makeRepository());

    expect(await screen.findByText('星图增长计划')).toBeVisible();
    expect(screen.queryByText('已归档历史项目')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '显示已归档' }));
    expect(await screen.findByText('已归档历史项目')).toBeVisible();
  });

  it('links each objective-backed project to its canonical objective detail', async () => {
    renderPage(management, makeRepository());

    const link = await screen.findByRole('link', { name: '星图增长计划' });
    expect(link).toHaveAttribute('href', '/okrs/objective-orion-activation');
  });

  it('does not offer standalone project creation or mutation to any role', async () => {
    const { unmount } = renderPage(management, makeRepository());
    expect(await screen.findByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '新建项目' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档项目' })).not.toBeInTheDocument();
    unmount();

    renderPage(employee, makeRepository());
    expect(await screen.findByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '新建项目' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
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
