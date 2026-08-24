import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AttachmentList } from './AttachmentList';

it('keeps a long uploaded filename identifiable while showing its progress', () => {
  const label = 'Q4_AI_Market_Review_Report_Answer_CN_with_a_very_long_name.docx';

  render(<AttachmentList items={[{
    id: 'long-uploaded-item',
    label,
    kind: 'file',
    classification: 'internal',
    uploadState: 'uploaded',
    uploadProgress: 100,
    attachmentId: 'attachment-long-uploaded-item',
  }]} />);

  expect(screen.getByText(/Q4_AI_Market/)).toHaveAttribute('title', expect.stringContaining('.docx'));
  expect(screen.getByRole('progressbar')).toHaveAccessibleName(/Q4_AI_Market/);
  expect(screen.getByText('100%')).toBeVisible();
});

it.each([1, 50, 100])('renders real progress value %s in the matching attachment progressbar', (progress) => {
  render(<AttachmentList items={[{ id: 'progress-item', label: 'proof.pdf', kind: 'file', classification: 'internal', uploadState: progress === 100 ? 'uploaded' : 'uploading', uploadProgress: progress, attachmentId: progress === 100 ? 'attachment-1' : undefined }]} />);
  expect(screen.getByRole('progressbar', { name: 'proof.pdf 上传进度' })).toHaveValue(progress);
});

it('uses localized upload states and a visible percentage for each attachment', () => {
  render(<AttachmentList items={[
    { id: 'waiting', label: 'waiting.pdf', kind: 'file', classification: 'internal', uploadState: 'selected', uploadProgress: 0 },
    { id: 'uploading', label: 'uploading.pdf', kind: 'file', classification: 'internal', uploadState: 'uploading', uploadProgress: 42 },
    { id: 'verifying', label: 'verifying.pdf', kind: 'file', classification: 'internal', uploadState: 'verifying', uploadProgress: 100 },
    { id: 'complete', label: 'complete.pdf', kind: 'file', classification: 'internal', uploadState: 'uploaded', uploadProgress: 100, attachmentId: 'attachment-complete' },
    { id: 'failed', label: 'failed.pdf', kind: 'file', classification: 'internal', uploadState: 'failed', uploadProgress: 0 },
  ]} />);

  expect(screen.getByText('等待上传')).toBeVisible();
  expect(screen.getByText('上传中 42%')).toBeVisible();
  expect(screen.getByText('服务器校验中')).toBeVisible();
  expect(screen.getByText('上传完成')).toBeVisible();
  expect(screen.getByText('上传失败')).toBeVisible();
  expect(screen.getAllByText('100%')).toHaveLength(2);
});

it('does not present an uploaded item without an attachment id as complete', () => {
  render(<AttachmentList items={[{ id: 'unverified', label: 'unverified.pdf', kind: 'file', classification: 'internal', uploadState: 'uploaded', uploadProgress: 100 }]} />);

  expect(screen.getByRole('progressbar', { name: 'unverified.pdf 上传进度' })).toHaveValue(0);
  expect(screen.getByText('服务器校验中')).toBeVisible();
  expect(screen.queryByText('上传完成')).not.toBeInTheDocument();
  expect(screen.queryByText('100%')).not.toBeInTheDocument();
});

it('shows progress, retry, replace, remove, and signed-download actions', async () => {
  const user = userEvent.setup(); const onRetry = vi.fn(); const onRemove = vi.fn(); const onDownload = vi.fn(); const onReplace = vi.fn();
  const { rerender } = render(<AttachmentList items={[{ id: 'a', label: 'evidence.pdf', kind: 'file', classification: 'confidential', uploadState: 'failed', uploadProgress: 40, error: '网络中断' }]} onRetry={onRetry} onRemove={onRemove} onDownload={onDownload} onReplace={onReplace} />);
  expect(screen.getByRole('progressbar', { name: 'evidence.pdf 上传进度' })).toHaveValue(40);
  expect(screen.getByText('机密')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '重试' })); expect(onRetry).toHaveBeenCalledWith('a');
  rerender(<AttachmentList items={[{ id: 'a', attachmentId: 'server-a', label: 'evidence.pdf', kind: 'file', classification: 'confidential', uploadState: 'uploaded' }]} onRetry={onRetry} onRemove={onRemove} onDownload={onDownload} onReplace={onReplace} />);
  await user.click(screen.getByRole('button', { name: '下载' })); expect(onDownload).toHaveBeenCalledWith('a');
  await user.upload(screen.getByLabelText('替换 evidence.pdf'), new File(['new'], 'new.pdf', { type: 'application/pdf' })); expect(onReplace).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '移除' })); expect(onRemove).toHaveBeenCalledWith('a');
});
