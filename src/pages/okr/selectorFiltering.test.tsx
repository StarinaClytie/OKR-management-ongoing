import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthContext';
import { AppRoutes } from '../../app/routes';
import type { OrganizationUser } from '../../data/types';
import type { OkrPriority } from '../../domain/types';
import { ObjectiveFormModal, type ObjectiveFormValues } from './ObjectiveFormModal';
import { KeyResultFormModal, type KeyResultFormValues } from './KeyResultFormModal';

const eligibleUsers: OrganizationUser[] = [
  { id: 'u-admin', displayName: '管理员甲', email: '', department: '', jobTitle: '', role: 'administrator', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'u-management', displayName: '管理层乙', email: '', department: '', jobTitle: '', role: 'management', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'u-leader', displayName: '负责人丙', email: '', department: '', jobTitle: '', role: 'project_leader', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'u-employee', displayName: '员工丁', email: '', department: '', jobTitle: '', role: 'employee', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'u-hr', displayName: '人事戊', email: '', department: '', jobTitle: '', role: 'hr', isActive: true, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'u-inactive', displayName: '停用员工', email: '', department: '', jobTitle: '', role: 'employee', isActive: false, approvalStatus: 'approved', createdAt: '', projectIds: [] },
  { id: 'u-pending', displayName: '待审批员工', email: '', department: '', jobTitle: '', role: 'employee', isActive: true, approvalStatus: 'pending', createdAt: '', projectIds: [] },
];

const objectiveInitial: ObjectiveFormValues = { name: '', number: '', leaderId: '', quarter: '2026-Q3', startDate: '', dueDate: '', priority: 'medium' as OkrPriority, description: '' };

const keyResultInitial: KeyResultFormValues = { title: '', ownerIds: [], deadline: '', metricType: 'milestone', milestoneDefinition: '', unit: '', priority: 'medium', notes: '' };

describe('role-filtered OKR selectors', () => {
  it('shows only project leaders in the Objective Project Leader selector', () => {
    render(<ObjectiveFormModal title="新建 Objective" mode="create" initial={objectiveInitial} eligibleUsers={eligibleUsers} onSubmit={() => undefined} onClose={() => undefined} />);

    expect(screen.getByRole('option', { name: /负责人丙/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /管理员甲/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /管理层乙/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /员工丁/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /人事戊/ })).not.toBeInTheDocument();
  });

  it('shows a hint instead of an empty selector when no project leader is eligible', () => {
    render(<ObjectiveFormModal title="新建 Objective" mode="create" initial={objectiveInitial} eligibleUsers={[]} onSubmit={() => undefined} onClose={() => undefined} />);

    expect(screen.getByText('当前没有可分配的项目负责人，请先由管理员创建并启用 Project Leader 账号。')).toBeVisible();
  });

  it('shows all approved active server-provided leaders and employees even when they have no project membership', () => {
    render(<KeyResultFormModal title="添加 Key Result" initial={keyResultInitial} ownerCandidates={eligibleUsers} onSubmit={() => undefined} onClose={() => undefined} />);

    expect(screen.getByLabelText('负责人丙')).toBeInTheDocument();
    expect(screen.getByLabelText('员工丁')).toBeInTheDocument();
    expect(screen.queryByLabelText('管理员甲')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('管理层乙')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('人事戊')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('停用员工')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('待审批员工')).not.toBeInTheDocument();
  });
});

describe('risk UI removal', () => {
  it('does not expose risk creation or the risk matrix on the OKR management page', () => {
    render(
      <AuthProvider initialUserId="user-management">
        <MemoryRouter initialEntries={['/okrs']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.queryByRole('button', { name: '新增风险' })).not.toBeInTheDocument();
    expect(screen.queryByText('风险矩阵')).not.toBeInTheDocument();
    expect(screen.queryByText('风险项')).not.toBeInTheDocument();
  });
});
