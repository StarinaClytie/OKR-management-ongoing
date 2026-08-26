import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { DashboardData, OkrRepository } from '../data/types';
import type { User } from '../domain/types';
import { TeamPage } from './TeamPage';

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'u1', name: '用户', role: 'employee', title: '工程师', department: '产品部', projectIds: [], ...overrides, clearance: overrides.clearance ?? 'internal' };
}

function emptyDashboard(currentUser: User): DashboardData {
  return {
    currentUser,
    users: [currentUser],
    dailyReports: [],
    weeklyReports: [],
    projects: [],
    objectives: [],
    keyResults: [],
    krAssignments: [],
    krProgressUpdates: [],
    objectiveOwners: [],
    milestones: [],
    risks: [],
    progressSnapshots: [],
    workloads: [],
    attachments: [],
    companyObjectives: [],
    projectTasks: [],
  };
}

function renderTeam(currentUser: User, data: DashboardData) {
  const repository = {
    mode: 'supabase',
    getDashboardData: vi.fn(async () => ({ ok: true, data })),
    setMyLocale: vi.fn(async () => ({ ok: true, data: undefined })),
  } as unknown as OkrRepository;
  const authValue: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  render(
    <AuthContext.Provider value={authValue}>
      <LocaleProvider repository={repository}>
        <MemoryRouter>
          <TeamPage dataRepository={repository} />
        </MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
}

describe('TeamPage role resolution', () => {
  it('shows all organization business users to management', async () => {
    const management = makeUser({ id: 'm1', name: '管理层', role: 'management' });
    const employee = makeUser({ id: 'e1', name: '员工一', role: 'employee' });
    renderTeam(management, { ...emptyDashboard(management), users: [management, employee] });

    expect(await screen.findByText('员工一')).toBeVisible();
    expect(screen.getByText('管理层')).toBeVisible();
  });

  it('shows the led-project empty state for a project leader with no projects', async () => {
    const leader = makeUser({ id: 'pl1', name: '负责人', role: 'project_leader' });
    renderTeam(leader, emptyDashboard(leader));

    expect(await screen.findByText('当前没有分配给你的项目。')).toBeVisible();
  });

  it('shows the joined-project empty state for an employee with no projects', async () => {
    const employee = makeUser({ id: 'e1', name: '员工', role: 'employee' });
    renderTeam(employee, emptyDashboard(employee));

    expect(await screen.findByText('当前还没有加入任何项目。')).toBeVisible();
  });
});
