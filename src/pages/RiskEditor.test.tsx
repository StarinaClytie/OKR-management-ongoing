import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { KeyResult, Objective, Project, User } from '../domain/types';
import { RiskEditor } from './RiskEditor';

const employee: User = { id: 'employee-1', name: '员工', role: 'employee', title: '产品经理', department: '产品部', projectIds: ['project-1'] };
const leader: User = { id: 'leader-1', name: '负责人', role: 'project_leader', title: '负责人', department: '产品部', projectIds: ['project-1'] };
const projects: Project[] = [
  { id: 'project-1', name: '项目一', description: '', leaderId: leader.id, memberIds: [leader.id, employee.id], classification: 'internal', startDate: '2026-08-01', dueDate: '2026-09-01', status: 'on_track' },
  { id: 'project-2', name: '项目二', description: '', leaderId: 'leader-2', memberIds: [employee.id], classification: 'internal', startDate: '2026-08-01', dueDate: '2026-09-01', status: 'on_track' },
];
const objectives: Objective[] = [
  { id: 'objective-owned', projectId: 'project-1', title: '我负责的目标', description: '', ownerId: employee.id, progress: 10, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal' },
  { id: 'objective-unowned', projectId: 'project-1', title: '项目内他人目标', description: '', ownerId: leader.id, progress: 20, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal' },
  { id: 'objective-outside', projectId: 'project-2', title: '其他项目目标', description: '', ownerId: employee.id, progress: 20, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal' },
];
const keyResults: KeyResult[] = [
  { id: 'kr-owned', objectiveId: 'objective-unowned', title: '我负责的 KR', ownerId: employee.id, progress: 30, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal' },
  { id: 'kr-unowned', objectiveId: 'objective-unowned', title: '项目内他人 KR', ownerId: leader.id, progress: 40, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal' },
  { id: 'kr-outside', objectiveId: 'objective-outside', title: '其他项目 KR', ownerId: employee.id, progress: 40, status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal' },
];

it('offers employees only their owned KR and Objective subjects', () => {
  render(<RiskEditor currentUser={employee} projects={projects} objectives={objectives} keyResults={keyResults} onSave={vi.fn()} />);

  expect(screen.getByRole('option', { name: 'KR · 我负责的 KR' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '目标 · 我负责的目标' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'KR · 项目内他人 KR' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '目标 · 项目内他人目标' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /其他项目/ })).not.toBeInTheDocument();
});

it('offers project leaders every KR and Objective in projects they lead', () => {
  render(<RiskEditor currentUser={leader} projects={projects} objectives={objectives} keyResults={keyResults} onSave={vi.fn()} />);

  expect(screen.getByRole('option', { name: 'KR · 我负责的 KR' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'KR · 项目内他人 KR' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '目标 · 项目内他人目标' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /其他项目/ })).not.toBeInTheDocument();
});

it('uses project leadership rather than the role label for project-wide subjects', () => {
  const managementLeader: User = { ...leader, role: 'management' };
  render(<RiskEditor currentUser={managementLeader} projects={projects} objectives={objectives} keyResults={keyResults} onSave={vi.fn()} />);

  expect(screen.getByRole('option', { name: 'KR · 我负责的 KR' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /其他项目/ })).not.toBeInTheDocument();
});

it('never offers risk-write subjects to HR even when HR owns the subject', () => {
  const hrOwner: User = { ...employee, id: 'hr-1', role: 'hr' };
  const hrObjectives = objectives.map((objective) => objective.id === 'objective-owned' ? { ...objective, ownerId: hrOwner.id } : objective);
  render(<RiskEditor currentUser={hrOwner} projects={projects} objectives={hrObjectives} keyResults={keyResults} onSave={vi.fn()} />);

  expect(screen.getByRole('status')).toHaveTextContent('当前没有可关联风险');
  expect(screen.queryByLabelText('关联对象')).not.toBeInTheDocument();
});

it('requires explained risk inputs, shows a live coordinate and score, and saves the selected subject', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue({ ok: true, data: { id: 'risk-1' } });
  render(<RiskEditor currentUser={employee} projects={projects} objectives={objectives} keyResults={keyResults} onSave={onSave} />);
  await user.selectOptions(screen.getByLabelText('关联对象'), 'key_result:kr-owned');
  await user.type(screen.getByLabelText('风险标题'), '交付风险');
  await user.selectOptions(screen.getByLabelText('发生概率'), '2');
  await user.selectOptions(screen.getByLabelText('业务影响'), '3');
  expect(screen.getByText('矩阵坐标：影响 3，概率 2')).toBeVisible();
  expect(screen.getByText('当前评分：2 × 3 = 6（高）')).toBeVisible();
  await user.type(screen.getByLabelText('判断依据'), '依赖方延期');
  await user.type(screen.getByLabelText('缓解措施'), '准备替代方案');
  await user.type(screen.getByLabelText('复核日期'), '2026-08-13');
  await user.click(screen.getByRole('button', { name: '保存风险' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 'project-1', keyResultId: 'kr-owned', objectiveId: null, probability: 2, impact: 3,
    level: 'high', reason: '依赖方延期', classification: 'internal', resolved: false,
  }));
});

it('prevents duplicate risk saves and retains edits after a failed save', async () => {
  let finishSave!: (value: { ok: false; error: { code: 'network'; message: string } }) => void;
  const onSave = vi.fn().mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
  const user = userEvent.setup();
  render(<RiskEditor currentUser={employee} projects={projects} objectives={objectives} keyResults={keyResults} onSave={onSave} />);
  await user.type(screen.getByLabelText('风险标题'), '保留的风险标题');
  await user.type(screen.getByLabelText('判断依据'), '保留的判断依据');
  await user.type(screen.getByLabelText('缓解措施'), '保留的缓解措施');
  await user.type(screen.getByLabelText('复核日期'), '2026-08-14');

  const form = screen.getByRole('button', { name: '保存风险' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
  finishSave({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });

  expect(await screen.findByRole('alert')).toHaveTextContent('请求未完成，请稍后重试');
  expect(screen.getByLabelText('风险标题')).toHaveValue('保留的风险标题');
  expect(screen.getByLabelText('判断依据')).toHaveValue('保留的判断依据');
});
