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
    expect(screen.queryByRole('button', { name: '添加另一组 Daily OKR' })).not.toBeInTheDocument();
  });

  it('submits a complete entry with objective, KR, work description, result and hours', async () => {
    const user = userEvent.setup();
    let submitted: DailyReportDraft | undefined;
    const { handleSubmit } = renderForm((draft) => { submitted = draft; return { ok: true }; });

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText(/工作描述/), '完成样本 A 测量与数据整理');
    await user.type(screen.getByLabelText(/结果/), '完成 5000 组光谱数据训练');
    await user.type(screen.getByLabelText(/记录工时/), '3.5');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(submitted!.blocks).toHaveLength(1);
    expect(submitted!.blocks[0]).toMatchObject({
      dailyObjective: '完成实验采集第一阶段',
      linkedKeyResultId: 'kr-1',
      workDescription: '完成样本 A 测量与数据整理',
      result: '完成 5000 组光谱数据训练',
      hours: 3.5,
    });
  });

  it('offers another entry only after the current entry is complete', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集');
    await user.type(screen.getByLabelText(/工作描述/), '采集并整理数据');
    await user.type(screen.getByLabelText(/结果/), '完成数据采集');
    await user.type(screen.getByLabelText(/记录工时/), '2');
    expect(screen.getByRole('button', { name: '添加另一组 Daily OKR' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '添加另一组 Daily OKR' }));
    expect(screen.getByRole('heading', { name: 'Daily OKR #2' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '添加另一组 Daily OKR' })).not.toBeInTheDocument();
  });

  it('renders attachment controls inside the Daily OKR entry', () => {
    renderForm();
    const entry = screen.getByRole('heading', { name: 'Daily OKR #1' }).closest('section');
    expect(entry).toContainElement(screen.getByLabelText(/选择成果附件/));
  });

  it('authors file-only evidence after Result / Data and before recorded hours', async () => {
    const user = userEvent.setup();
    let submitted: DailyReportDraft | undefined;
    const { handleSubmit } = renderForm((draft) => { submitted = draft; return { ok: true }; });
    const result = screen.getByLabelText(/结果/);
    const picker = screen.getByLabelText(/选择成果附件/);
    const hours = screen.getByLabelText(/记录工时/);

    expect(result.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker.compareDocumentPosition(hours) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('关联与成果')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /添加成果附件或链接/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '链接' })).not.toBeInTheDocument();

    const file = new File(['proof'], '实验结果.pdf', { type: 'application/pdf' });
    await user.upload(picker, file);

    expect(screen.getByLabelText('成果 1')).toHaveValue('实验结果.pdf');
    expect(screen.getByLabelText('成果 1 密级')).toHaveValue('internal');
    expect(screen.queryByLabelText('成果 1 类型')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText(/工作描述/), '完成样本 A 测量与数据整理');
    await user.type(result, '完成 5000 组光谱数据训练');
    await user.type(hours, '3.5');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(handleSubmit).toHaveBeenCalledOnce();
    expect(submitted!.blocks[0]!.evidence).toEqual([expect.objectContaining({ file, kind: 'file' })]);
  });

  it('renders exact field errors and focuses each next missing required control', async () => {
    const user = userEvent.setup();
    const { handleSubmit } = renderForm();
    const quarterlyKr = screen.getByLabelText(/关联季度 KR/);
    const dailyObjective = screen.getByLabelText(/当日 O/);
    const workDescription = screen.getByLabelText(/工作描述/);
    const result = screen.getByLabelText(/结果/);

    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(screen.getByText('请选择关联的季度 KR')).toBeVisible();
    expect(screen.getByText('请填写当日 O')).toBeVisible();
    expect(screen.getByText('请填写工作描述')).toBeVisible();
    expect(screen.getByText('请填写结果或数据')).toBeVisible();
    expect(document.activeElement).toBe(quarterlyKr);

    await user.selectOptions(quarterlyKr, 'kr-1');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(document.activeElement).toBe(dailyObjective);

    await user.type(dailyObjective, '完成实验采集第一阶段');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(document.activeElement).toBe(workDescription);

    await user.type(workDescription, '完成样本 A 测量与数据整理');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(document.activeElement).toBe(result);

    await user.type(result, '完成 5000 组光谱数据训练');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(handleSubmit).toHaveBeenCalledOnce();
  });

  it('focuses work description before a later invalid hours field', async () => {
    const user = userEvent.setup();
    renderForm();
    const workDescription = screen.getByLabelText(/工作描述/);
    const hours = screen.getByLabelText(/记录工时/);

    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-1');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.clear(hours);
    await user.type(hours, '-1');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(document.activeElement).toBe(workDescription);
  });

  it('saves a complete edit draft containing legacy link evidence', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(() => ({ ok: true as const }));
    render(
      <DailyReportForm
        mode="edit"
        initialDraft={{
          classification: 'internal',
          blocks: [{
            id: 'block-1', dailyObjective: '完成实验采集第一阶段', linkedKeyResultId: 'kr-1',
            workDescription: '完成样本 A 测量与数据整理', hours: 3.5, result: '完成 5000 组光谱数据训练',
            evidence: [{ id: 'legacy-link', label: '历史设计文档', kind: 'link', classification: 'internal' }],
          }],
        }}
        ownedKeyResults={ownedKeyResults}
        objectives={objectives}
        onCancel={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /保存.*修改/ }));

    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [expect.objectContaining({ evidence: [expect.objectContaining({ kind: 'link' })] })],
    }));
  });
});
