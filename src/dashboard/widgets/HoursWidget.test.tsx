import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DashboardData } from '../../data/types';
import { HoursWidget } from './HoursWidget';

function buildData(): DashboardData {
  return {
    currentUser: { id: 'mgr', name: 'Management', role: 'management', title: '', department: '', projectIds: [] },
    users: [
      { id: 'u1', name: '张三', role: 'employee', title: '', department: '', projectIds: [] },
      { id: 'u2', name: '王芳', role: 'employee', title: '', department: '', projectIds: [] },
    ],
    projects: [
      { id: 'p1', name: '光谱仪', description: '', leaderId: 'leader', memberIds: [], classification: 'internal', startDate: '', dueDate: '', status: 'on_track' },
      { id: 'p2', name: '检测平台', description: '', leaderId: 'leader', memberIds: [], classification: 'internal', startDate: '', dueDate: '', status: 'on_track' },
    ],
    objectives: [
      { id: 'o1', projectId: 'p1', title: '下一代光谱仪', description: '', ownerId: 'leader', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal', quarter: '2026-Q3' },
      { id: 'o2', projectId: 'p2', title: 'AI检测平台', description: '', ownerId: 'leader', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal', quarter: '2026-Q3' },
    ],
    keyResults: [
      { id: 'k1', objectiveId: 'o1', title: '光路设计', ownerId: 'u1', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
      { id: 'k2', objectiveId: 'o2', title: '数据标注', ownerId: 'u2', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
    ],
    dailyReports: [
      { id: 'r1', authorId: 'u1', projectId: 'p1', objectiveId: 'o1', keyResultIds: ['k1'], date: '2026-08-19', content: '', classification: 'internal', hours: 3, evidence: [], evidenceClassification: 'internal', attachmentIds: [], status: 'submitted', blocks: [{ id: 'b1', dailyObjective: 'O', keyResultId: 'k1', hours: 3, result: '', keyResults: [{ id: 'kr1', title: 'KR' }] }] },
      { id: 'r2', authorId: 'u2', projectId: 'p2', objectiveId: 'o2', keyResultIds: ['k2'], date: '2026-08-19', content: '', classification: 'internal', hours: 5, evidence: [], evidenceClassification: 'internal', attachmentIds: [], status: 'submitted', blocks: [{ id: 'b2', dailyObjective: 'O', keyResultId: 'k2', hours: 5, result: '', keyResults: [{ id: 'kr2', title: 'KR' }] }] },
    ],
    krAssignments: [], krProgressUpdates: [], milestones: [], risks: [], progressSnapshots: [], workloads: [], attachments: [], companyObjectives: [], projectTasks: [],
  };
}

describe('HoursWidget filters', () => {
  it('narrows objective options when a project is selected and resets filters', async () => {
    const user = userEvent.setup();
    render(<HoursWidget data={buildData()} />);

    const objectiveSelect = screen.getByLabelText('目标');
    expect(within(objectiveSelect).getByRole('option', { name: '下一代光谱仪' })).toBeInTheDocument();
    expect(within(objectiveSelect).getByRole('option', { name: 'AI检测平台' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('项目'), 'p1');
    expect(within(objectiveSelect).getByRole('option', { name: '下一代光谱仪' })).toBeInTheDocument();
    expect(within(objectiveSelect).queryByRole('option', { name: 'AI检测平台' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重置筛选' }));
    expect(within(objectiveSelect).getByRole('option', { name: 'AI检测平台' })).toBeInTheDocument();
  });

  it('clears an invalid objective when the project changes', async () => {
    const user = userEvent.setup();
    render(<HoursWidget data={buildData()} />);

    await user.selectOptions(screen.getByLabelText('目标'), 'o2');
    expect(screen.getByLabelText('目标')).toHaveValue('o2');

    await user.selectOptions(screen.getByLabelText('项目'), 'p1');
    expect(screen.getByLabelText('目标')).toHaveValue('');
  });

  it('clears an invalid KR when the objective changes', async () => {
    const user = userEvent.setup();
    render(<HoursWidget data={buildData()} />);

    await user.selectOptions(screen.getByLabelText('KR'), 'k2');
    expect(screen.getByLabelText('KR')).toHaveValue('k2');

    await user.selectOptions(screen.getByLabelText('目标'), 'o1');
    expect(screen.getByLabelText('KR')).toHaveValue('');
  });

  it('shows an empty filtered state', async () => {
    const user = userEvent.setup();
    render(<HoursWidget data={buildData()} />);

    await user.type(screen.getByLabelText('从'), '2026-01-01');
    await user.type(screen.getByLabelText('至'), '2026-01-31');

    expect(screen.getByText('没有符合当前筛选条件的工时记录。')).toBeVisible();
  });
});
