import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DailyReportDraft } from '../../domain/dailyEntry';
import type { KeyResult, Objective } from '../../domain/types';
import { DailyReportForm } from './DailyReportForm';

const objectives: Objective[] = [
  { id: 'objective-1', projectId: 'project-1', title: '下一代光谱仪研发', description: '', ownerId: 'leader', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
];

const ownedKeyResults: KeyResult[] = [
  { id: 'kr-1', objectiveId: 'objective-1', title: '完成控制软件 v1.0', ownerId: 'emp', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
];

function renderForm(onSubmit?: (draft: DailyReportDraft) => { ok: true }) {
  const onCancel = vi.fn();
  const handleSubmit = vi.fn((draft: DailyReportDraft) => (onSubmit ? onSubmit(draft) : { ok: true as const }));
  render(<DailyReportForm ownedKeyResults={ownedKeyResults} objectives={objectives} onCancel={onCancel} onSubmit={handleSubmit} />);
  return { onCancel, handleSubmit };
}

describe('DailyReportForm', () => {
  it('renders a first Daily OKR block with the owned-KR selector and a total-hours line', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'Daily OKR #1' })).toBeVisible();
    expect(screen.getByLabelText(/关联季度 KR/)).toBeVisible();
    expect(screen.getByText('今日总工时：0 小时')).toBeVisible();
    expect(screen.getByRole('button', { name: '添加另一组 Daily OKR' })).toBeVisible();
  });

  it('submits a complete block with its 今日 O, linked KR, hours, and 今日 KRs', async () => {
    const user = userEvent.setup();
    let submitted: DailyReportDraft | undefined;
    const { handleSubmit } = renderForm((draft) => { submitted = draft; return { ok: true }; });

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText('第 1 组 · 今日 KR 1'), '完成样本 A 测量');
    await user.type(screen.getByLabelText(/记录工时/), '3.5');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(submitted!.blocks).toHaveLength(1);
    expect(submitted!.blocks[0]).toMatchObject({
      dailyObjective: '完成实验采集第一阶段',
      linkedKeyResultId: 'kr-1',
      hours: 3.5,
    });
    expect(submitted!.blocks[0]!.keyResults[0]!.title).toBe('完成样本 A 测量');
  });

  it('adds a second Daily OKR block and aggregates hours across blocks', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getAllByLabelText(/记录工时/)[0]!, '2');
    await user.click(screen.getByRole('button', { name: '添加另一组 Daily OKR' }));
    expect(screen.getByRole('heading', { name: 'Daily OKR #2' })).toBeVisible();

    await user.type(screen.getAllByLabelText(/记录工时/)[1]!, '3');
    expect(screen.getByText('今日总工时：5 小时')).toBeVisible();
  });
});
