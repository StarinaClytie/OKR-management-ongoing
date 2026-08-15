import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../app/routes';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { User } from '../domain/types';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { DashboardData } from '../mocks/repository';
import type { OkrRepository } from '../data/types';

const repositoryMock = vi.hoisted(() => ({
  mode: 'supabase' as const,
  getDashboardData: vi.fn(),
  setMyLocale: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

vi.mock('../lib/supabase', () => ({
  appMode: 'supabase',
  repository: repositoryMock,
}));

const currentUser: User = {
  id: '6d314f30-5a8e-4ffd-9dd2-345abb427080',
  name: '真实管理者',
  role: 'management',
  title: '负责人',
  department: '经营部',
  projectIds: ['41923d91-f471-4c18-9686-1c694a9d203d'],
  preferredLocale: 'zh-CN',
};

const teammate: User = {
  id: 'e1744bad-3baf-4a61-950b-e312b1fa51d6',
  name: 'RLS 团队成员',
  role: 'employee',
  title: '工程师',
  department: '产品部',
  projectIds: currentUser.projectIds,
};

const dashboardData: DashboardData = {
  currentUser,
  users: [currentUser, teammate],
  projects: [{
    id: currentUser.projectIds[0], name: 'RLS 项目', description: '仅来自真实仓库', leaderId: currentUser.id,
    memberIds: [currentUser.id, teammate.id], classification: 'internal', startDate: '2026-08-01', dueDate: '2026-09-01', status: 'on_track',
  }],
  objectives: [{
    id: 'ce8a2fa2-b2e2-44c0-972c-47b49c830281', projectId: currentUser.projectIds[0], title: 'RLS 经营目标', description: '', ownerId: currentUser.id,
    progress: 50, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal',
  }],
  keyResults: [{
    id: '1e53e6f1-347a-46e5-af5e-64c13b7cae4b', objectiveId: 'ce8a2fa2-b2e2-44c0-972c-47b49c830281', title: 'RLS 真实 KR', ownerId: currentUser.id,
    progress: 50, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal',
  }],
  dailyReports: [{
    id: 'a217ff9b-7285-410c-9577-b39ae12137f9', authorId: currentUser.id, projectId: currentUser.projectIds[0], objectiveId: 'ce8a2fa2-b2e2-44c0-972c-47b49c830281',
    keyResultIds: [], date: '2026-08-14', content: 'RLS 日报正文', classification: 'internal', hours: 9, evidence: [], evidenceClassification: 'internal', attachmentIds: [], status: 'submitted',
  }],
  weeklyReports: [{
    id: '51d70542-fe54-42b4-874b-b14f928d821a', authorId: currentUser.id, projectId: currentUser.projectIds[0], objectiveId: 'ce8a2fa2-b2e2-44c0-972c-47b49c830281',
    keyResultIds: [], weekEnding: '2026-08-14', summary: 'RLS 周报摘要', classification: 'internal', nextWeekPlan: '继续真实交付', hours: 9, attachmentIds: [], status: 'submitted',
  }],
  workloads: [{
    id: '7edcf2d0-e07f-4e80-a2dc-0ac8d8d25f10', userId: teammate.id, projectId: currentUser.projectIds[0], sourceReportId: 'a217ff9b-7285-410c-9577-b39ae12137f9',
    periodStart: '2026-08-10', periodEnd: '2026-08-14', plannedHours: 8, loggedHours: 9, capacityHours: 10, hrVisibility: 'hours_only',
  }],
  milestones: [], risks: [], progressSnapshots: [], attachments: [], companyObjectives: [], projectTasks: [],
};

const authValue: AuthContextValue = {
  status: 'ready', mode: 'supabase', currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
};

function renderRoute(path: string) {
  return render(
    <AuthContext.Provider value={authValue}>
      <LocaleProvider repository={repositoryMock as unknown as OkrRepository}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
}

describe('Supabase production page data paths', () => {
  beforeEach(() => {
    repositoryMock.getDashboardData.mockReset();
    repositoryMock.getDashboardData.mockResolvedValue({ ok: true, data: dashboardData });
  });

  it.each([
    ['/dashboard', 'RLS 经营目标'],
    ['/projects', 'RLS 项目'],
    ['/daily-reports', 'RLS 日报正文'],
    ['/weekly-reports', 'RLS 周报摘要'],
    ['/team', 'RLS 团队成员'],
    ['/analytics', '9 小时'],
  ])('renders %s from the RLS-backed repository for a real UUID profile', async (path, expectedText) => {
    renderRoute(path);

    expect(await screen.findByText(expectedText)).toBeVisible();
  });

  it('shows a safe loading state while the RLS read is pending', () => {
    repositoryMock.getDashboardData.mockReturnValue(new Promise(() => undefined));

    renderRoute('/projects');

    expect(screen.getByRole('status')).toHaveTextContent('正在加载');
  });

  it('shows a safe localized error instead of crashing when the RLS read rejects', async () => {
    repositoryMock.getDashboardData.mockRejectedValue(new Error('offline'));

    renderRoute('/projects');

    expect(await screen.findByRole('alert')).toHaveTextContent('请求未完成，请稍后重试');
  });

  it('shows the normal neutral empty state for an authorized empty RLS result', async () => {
    repositoryMock.getDashboardData.mockResolvedValue({
      ok: true,
      data: { ...dashboardData, projects: [] },
    });

    renderRoute('/projects');

    expect(await screen.findByText('当前没有可查看的项目。')).toBeVisible();
  });
});
