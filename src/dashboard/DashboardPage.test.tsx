import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { DashboardPage } from './DashboardPage';

function renderDashboardAs(userId: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('DashboardPage', () => {
  it('keeps the project leader daily workflow to two visible primary actions', () => {
    renderDashboardAs('user-project-leader');

    expect(screen.getByRole('button', { name: '填写今日日报' })).toBeVisible();
    expect(screen.getByRole('button', { name: '更新 KR' })).toBeVisible();
    expect(screen.queryByText('高级筛选')).not.toBeInTheDocument();
  });

  it('gives an administrator system governance without business-body widgets', () => {
    renderDashboardAs('user-administrator');

    expect(screen.getByRole('heading', { name: '系统治理概览' })).toBeVisible();
    expect(screen.getByText('用户与角色状态')).toBeVisible();
    expect(screen.queryByText('成员日报待审核')).not.toBeInTheDocument();
    expect(screen.queryByText('我的关键结果')).not.toBeInTheDocument();
    expect(screen.queryByText('星图增长计划')).not.toBeInTheDocument();
  });

  it('gives management an organization view instead of personal workflow controls', () => {
    renderDashboardAs('user-management');

    expect(screen.getByRole('heading', { name: '组织经营概览' })).toBeVisible();
    expect(screen.getByText('公司 OKR 健康度')).toBeVisible();
    expect(screen.getByText('项目专业视图')).toBeVisible();
    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
  });

  it('keeps employees focused on their own work', () => {
    renderDashboardAs('user-employee');

    expect(screen.getByRole('heading', { name: '我的工作概览' })).toBeVisible();
    expect(screen.getByText('今日重点')).toBeVisible();
    expect(screen.getByText('我的关键结果')).toBeVisible();
    expect(screen.queryByText('成员日报待审核')).not.toBeInTheDocument();
    expect(screen.queryByText('公司 OKR 健康度')).not.toBeInTheDocument();
  });

  it('shows HR only authorized people and workload summaries', () => {
    renderDashboardAs('user-hr');

    expect(screen.getByRole('heading', { name: '人力与投入概览' })).toBeVisible();
    expect(screen.getByText('授权工时与团队负载摘要')).toBeVisible();
    expect(screen.queryByText('成员日报待审核')).not.toBeInTheDocument();
    expect(screen.queryByText('完成引导文案的用户访谈整理，并提交实验配置。')).not.toBeInTheDocument();
    expect(screen.queryByText('新星数据平台')).not.toBeInTheDocument();
  });
});
