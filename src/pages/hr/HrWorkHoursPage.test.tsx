import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';
import type { HrWorkHourRow, OkrRepository } from '../../data/types';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { HrWorkHoursPage } from './HrWorkHoursPage';

const hrUser = { id: 'hr1', name: '孙悦', role: 'hr' as const, clearance: 'internal' as const, title: '', department: '', projectIds: [] };

function makeRow(overrides: Partial<HrWorkHourRow> = {}): HrWorkHourRow {
  return {
    date: '2026-08-24',
    userId: 'u1',
    displayName: '张三',
    role: 'employee',
    projectLeaderName: '李然',
    projectLeaderId: 'leader1',
    projectId: 'p1',
    projectName: '光谱仪',
    objectiveId: 'o1',
    objectiveTitle: '下一代光谱仪',
    objectiveArchived: false,
    krId: 'kr1',
    krTitle: '光路设计',
    hours: 3,
    ...overrides,
  };
}

function renderPage(rows: HrWorkHourRow[]) {
  const repository = {
    mode: 'supabase',
    getHrWorkHours: vi.fn(async () => ({ ok: true, data: rows })),
  } as unknown as OkrRepository;
  const authValue: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser: hrUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  render(
    <AuthContext.Provider value={authValue}>
      <LocaleProvider repository={repository}>
        <MemoryRouter>
          <HrWorkHoursPage dataRepository={repository} />
        </MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
}

describe('HrWorkHoursPage', () => {
  it('shows the empty state when there are no records', async () => {
    renderPage([]);
    expect(await screen.findByText('暂无工时记录')).toBeVisible();
  });

  it('renders stat cards and daily detail without report content', async () => {
    renderPage([makeRow({ hours: 3 }), makeRow({ userId: 'u2', displayName: '李四', krId: 'kr2', krTitle: '数据标注', hours: 2 })]);
    expect(await screen.findByText('本周总工时')).toBeVisible();
    expect(screen.getByText('记录人数')).toBeVisible();
    expect(screen.getByText('关联 KR 数量')).toBeVisible();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('张三')).toBeVisible();
    expect(within(table).getByText('光路设计')).toBeVisible();
    expect(within(table).queryByText(/日报正文|工作描述|成果/)).not.toBeInTheDocument();
  });

  it('switches to the weekly summary with per-day columns', async () => {
    renderPage([makeRow({ date: '2026-08-24', hours: 3 }), makeRow({ date: '2026-08-25', hours: 1 })]);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('tab', { name: '每周汇总' }));
    expect(screen.getByText('周一')).toBeVisible();
    expect(screen.getByText('总计')).toBeVisible();
    expect(screen.getByText('4')).toBeVisible(); // 3 + 1 total
  });

  it('cascades KR options by the selected objective', async () => {
    renderPage([
      makeRow({ objectiveId: 'o1', krId: 'kr1', krTitle: '光路设计' }),
      makeRow({ objectiveId: 'o2', objectiveTitle: 'AI检测平台', krId: 'kr2', krTitle: '数据标注' }),
    ]);
    await screen.findByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('Objective'), 'o1');
    const krSelect = screen.getByLabelText('KR') as HTMLSelectElement;
    expect(within(krSelect).getByRole('option', { name: '光路设计' })).toBeInTheDocument();
    expect(within(krSelect).queryByRole('option', { name: '数据标注' })).not.toBeInTheDocument();
  });
});
