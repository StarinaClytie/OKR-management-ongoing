import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OkrRepository } from '../../data/types';
import type { DailyReportDetail } from '../../domain/types';
import { DailyReportDetailDialog } from './DailyReportDetailDialog';

function reportDetail(overrides: Partial<DailyReportDetail> = {}): DailyReportDetail {
  return {
    id: 'report-member',
    authorId: 'user-employee',
    authorName: '陈敏',
    date: '2026-08-24',
    status: 'submitted',
    hours: 3,
    currentRevision: 4,
    blocks: [{
      id: 'block-1',
      dailyObjective: '完成登录实验',
      keyResultId: 'kr-login',
      workDescription: '分析首轮数据',
      hours: 3,
      result: '转化率提高 8%',
      keyResults: [{ id: 'kr-login', title: '提升激活率' }],
      evidenceItems: [{
        id: 'evidence-1',
        attachmentId: 'attachment-1',
        label: '实验结果.pdf',
        kind: 'file',
        classification: 'internal',
        uploadState: 'uploaded',
      }],
    }],
    comments: [{
      id: 'comment-1',
      reportId: 'report-member',
      authorId: 'user-leader',
      authorName: '李经理',
      body: '数据很清楚。',
      createdAt: '2026-08-24T09:00:00.000Z',
    }],
    canComment: false,
    canConfirm: false,
    ...overrides,
  };
}

function repository(methods: Partial<OkrRepository> = {}) {
  return methods as OkrRepository;
}

describe('DailyReportDetailDialog', () => {
  it('shows the full report and existing comments without review controls for a read-only author', () => {
    render(
      <DailyReportDetailDialog
        detail={reportDetail()}
        repository={repository()}
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /日报详情/ })).toBeVisible();
    expect(screen.getByText('完成登录实验')).toBeVisible();
    expect(screen.getByText('数据很清楚。')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '评论内容' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认成员日报' })).not.toBeInTheDocument();
  });

  it('retains a typed comment after failure, then appends the server comment and clears the field', async () => {
    const user = userEvent.setup();
    const commentDailyReport = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'network', message: 'offline' } })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: 'comment-2', reportId: 'report-member', authorId: 'user-leader', authorName: '李经理',
          body: '请补充样本量', createdAt: '2026-08-24T10:00:00.000Z',
        },
      });
    render(
      <DailyReportDetailDialog
        detail={reportDetail({ canComment: true })}
        repository={repository({ commentDailyReport })}
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox', { name: '评论内容' });
    await user.type(input, '请补充样本量');
    await user.click(screen.getByRole('button', { name: '添加评论' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('网络错误，请检查连接后重试。');
    expect(input).toHaveValue('请补充样本量');

    await user.click(screen.getByRole('button', { name: '添加评论' }));

    expect(commentDailyReport).toHaveBeenLastCalledWith('report-member', '请补充样本量');
    expect(await screen.findByText('请补充样本量')).toBeVisible();
    expect(input).toHaveValue('');
  });

  it('uses server authorization to confirm and keeps commenting available afterward', async () => {
    const user = userEvent.setup();
    const confirmDailyReport = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const onConfirmed = vi.fn();
    render(
      <DailyReportDetailDialog
        detail={reportDetail({ canComment: true, canConfirm: true })}
        repository={repository({ confirmDailyReport })}
        onClose={vi.fn()}
        onConfirmed={onConfirmed}
      />,
    );

    await user.click(screen.getByRole('button', { name: '确认成员日报' }));

    expect(confirmDailyReport).toHaveBeenCalledWith('report-member', 4);
    expect(onConfirmed).toHaveBeenCalledWith('report-member');
    expect(screen.queryByRole('button', { name: '确认成员日报' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '评论内容' })).toBeEnabled();
    expect(screen.getByText('已确认')).toBeVisible();
  });

  it('downloads attachments only through a short-lived repository authorization', async () => {
    const user = userEvent.setup();
    const createAttachmentDownload = vi.fn(async () => ({ ok: true as const, data: { url: 'https://storage.example/signed' } }));
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <DailyReportDetailDialog
        detail={reportDetail()}
        repository={repository({ createAttachmentDownload })}
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '下载 实验结果.pdf' }));

    expect(createAttachmentDownload).toHaveBeenCalledWith('attachment-1');
    expect(anchorClick).toHaveBeenCalledOnce();
    anchorClick.mockRestore();
  });

  it('focuses the close control, traps backward focus, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DailyReportDetailDialog
        detail={reportDetail({ canComment: true, canConfirm: true })}
        repository={repository({ confirmDailyReport: vi.fn() })}
        onClose={onClose}
        onConfirmed={vi.fn()}
      />,
    );

    const closeButton = screen.getByRole('button', { name: '关闭日报详情' });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '确认成员日报' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
