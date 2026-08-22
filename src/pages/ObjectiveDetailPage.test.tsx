import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository, OrganizationUser } from '../data/types';
import type { User } from '../domain/types';
import { mockRepository } from '../mocks/repository';
import { ObjectiveDetailPage } from './ObjectiveDetailPage';

const projectLeader: User = {
  id: 'user-project-leader', name: '李然', role: 'project_leader', title: '项目负责人', department: '产品部', projectIds: ['project-orion'],
};

const unassignedEmployee: OrganizationUser = {
  id: 'unassigned-employee', displayName: '未分配员工', email: 'unassigned@example.com', department: '产品部', jobTitle: '工程师',
  role: 'employee', isActive: true, approvalStatus: 'approved', createdAt: '2026-08-22T00:00:00Z', projectIds: [],
};

function makeRepository(overrides: Record<string, unknown> = {}): OkrRepository {
  return {
    mode: 'supabase',
    getDashboardData: vi.fn(async () => ({ ok: true, data: mockRepository.getDashboardData(projectLeader.id) })),
    listOrganizationUsers: vi.fn(async () => ({ ok: true, data: [] })),
    ...overrides,
  } as unknown as OkrRepository;
}

function renderDetail(dataRepository: OkrRepository) {
  const authValue: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser: projectLeader, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/okrs/objective-orion-activation']}>
        <Routes>
          <Route path="/okrs/:objectiveId" element={<ObjectiveDetailPage dataRepository={dataRepository} />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ObjectiveDetailPage KR owner candidates', () => {
  it('uses focused KR-owner candidates, including an employee without project membership', async () => {
    const listEligibleKrOwners = vi.fn(async () => ({ ok: true as const, data: [unassignedEmployee] }));
    const repository = makeRepository({ listEligibleKrOwners });
    const user = userEvent.setup();

    renderDetail(repository);
    await user.click(await screen.findByRole('button', { name: '添加 Key Result' }));

    expect(await screen.findByLabelText('未分配员工')).toBeVisible();
    expect(listEligibleKrOwners).toHaveBeenCalledWith('objective-orion-activation');
    expect(repository.listOrganizationUsers).not.toHaveBeenCalled();
  });

  it('shows a localized candidate-load error instead of the no-candidates hint', async () => {
    const listEligibleKrOwners = vi.fn(async () => ({ ok: false as const, error: { code: 'network' as const, message: '' } }));
    const repository = makeRepository({ listEligibleKrOwners });
    const user = userEvent.setup();

    renderDetail(repository);
    await user.click(await screen.findByRole('button', { name: '添加 Key Result' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载可分配的 KR 负责人，请稍后重试。');
    expect(screen.queryByText('当前没有可分配的项目负责人，请先由管理员创建并启用 Project Leader 账号。')).not.toBeInTheDocument();
    await waitFor(() => expect(listEligibleKrOwners).toHaveBeenCalledWith('objective-orion-activation'));
  });
});
