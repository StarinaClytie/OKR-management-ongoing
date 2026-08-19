import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { mockData, mockRepository } from '../mocks/repository';
import { DashboardGrid } from './DashboardGrid';

describe('DashboardGrid confidentiality boundaries', () => {
  it('does not reveal a restricted KR before permission approval', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const data = {
      ...source,
      keyResults: source.keyResults.map((keyResult) =>
        keyResult.id === 'kr-orion-activation' ? { ...keyResult, classification: 'restricted' as const } : keyResult,
      ),
    };

    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['my-key-results']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.queryByText('将七日激活率提升至 62%')).not.toBeInTheDocument();
    expect(screen.getByText('严格机密内容')).toBeVisible();
  });

  it('does not reveal a restricted milestone even when its objective is internal', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const data = {
      ...source,
      milestones: source.milestones.map((milestone) =>
        milestone.id === 'milestone-orion-experiment-review'
          ? { ...milestone, classification: 'restricted' as const }
          : milestone,
      ),
    };

    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['today-focus']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.queryByText('新手引导实验复盘')).not.toBeInTheDocument();
    expect(screen.getByText('严格机密内容')).toBeVisible();
  });

  it('excludes restricted records from management aggregate counts', () => {
    const source = mockRepository.getDashboardData('user-management');
    const data = {
      ...source,
      projects: source.projects.map((project) => ({ ...project, classification: 'restricted' as const })),
      objectives: source.objectives.map((objective) => ({ ...objective, classification: 'restricted' as const })),
      risks: source.risks.map((risk) => ({ ...risk, classification: 'restricted' as const })),
    };

    render(
      <AuthProvider initialUserId="user-management">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['company-health']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByLabelText('目标平均进度')).toHaveTextContent('0%');
    expect(screen.getByLabelText('目标平均进度')).toHaveTextContent('0 个目标');
    expect(screen.getByLabelText('正常推进项目')).toHaveTextContent('共 0 个项目');
  });

  it('uses only reports supplied by DashboardData', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const data = { ...source, dailyReports: [] };

    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['report-review']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByText('0 份')).toBeVisible();
    expect(screen.queryByText('完成引导文案的用户访谈整理，并提交实验配置。')).not.toBeInTheDocument();
  });

  it('excludes an unauthorized report from the review count', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const restrictedReport = {
      ...source.dailyReports.find((report) => report.id === 'daily-report-employee-2026-08-07')!,
      id: 'daily-report-restricted-review',
      content: '不应泄漏的严格机密日报正文',
      classification: 'restricted' as const,
    };
    const data = { ...source, dailyReports: [restrictedReport] };

    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['report-review']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByText('0 份')).toBeVisible();
    expect(screen.queryByText('不应泄漏的严格机密日报正文')).not.toBeInTheDocument();
  });

  it('uses user labels supplied by DashboardData for report review', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const data = {
      ...source,
      users: mockData.users.map((user) =>
        user.id === 'user-employee' ? { ...user, name: 'DashboardData 成员' } : user,
      ),
    };

    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['report-review']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByText(/DashboardData 成员/)).toBeVisible();
    expect(screen.queryByText(/周琳/)).not.toBeInTheDocument();
  });

  it('uses user labels supplied by DashboardData for HR workload rows', () => {
    const source = mockRepository.getDashboardData('user-hr');
    const data = {
      ...source,
      users: mockData.users.map((user) =>
        user.id === 'user-employee' ? { ...user, name: 'DashboardData 工时成员' } : user,
      ),
    };

    render(
      <AuthProvider initialUserId="user-hr">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['hr-summary']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByText('DashboardData 工时成员')).toBeVisible();
    expect(screen.queryByText('周琳')).not.toBeInTheDocument();
  });

  it('excludes unauthorized worklogs from HR aggregate counts', () => {
    const source = mockRepository.getDashboardData('user-hr');
    const unauthorizedWorkload = {
      ...source.workloads[0],
      id: 'workload-not-authorized-for-hr',
      sourceReportId: 'daily-report-not-authorized-for-hr',
      loggedHours: 44,
      capacityHours: 40,
    };
    const data = { ...source, workloads: [unauthorizedWorkload] };

    render(
      <AuthProvider initialUserId="user-hr">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['hr-summary']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(within(screen.getByLabelText('授权工时记录')).getByText('0')).toBeVisible();
    expect(screen.queryByText('44 小时')).not.toBeInTheDocument();
  });
});
