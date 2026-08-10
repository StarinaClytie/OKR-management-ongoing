import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { mockRepository } from '../mocks/repository';
import { DashboardGrid } from './DashboardGrid';

describe('DashboardGrid confidentiality boundaries', () => {
  it('does not reveal restricted KR or milestone labels before permission approval', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const data = {
      ...source,
      objectives: source.objectives.map((objective) =>
        objective.id === 'objective-orion-activation' ? { ...objective, classification: 'restricted' as const } : objective,
      ),
      keyResults: source.keyResults.map((keyResult) =>
        keyResult.id === 'kr-orion-activation' ? { ...keyResult, classification: 'restricted' as const } : keyResult,
      ),
    };

    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter>
          <DashboardGrid data={data} widgetIds={['today-focus', 'my-key-results']} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.queryByText('将七日激活率提升至 62%')).not.toBeInTheDocument();
    expect(screen.queryByText('新手引导实验复盘')).not.toBeInTheDocument();
    expect(screen.getAllByText('严格机密内容')).toHaveLength(2);
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
    expect(screen.getByLabelText('需关注风险')).toHaveTextContent('0');
    expect(screen.getByLabelText('正常推进项目')).toHaveTextContent('共 0 个项目');
  });
});
