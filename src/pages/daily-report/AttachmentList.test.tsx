import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AttachmentList } from './AttachmentList';

it('shows progress, retry, replace, remove, and signed-download actions', async () => {
  const user = userEvent.setup(); const onRetry = vi.fn(); const onRemove = vi.fn(); const onDownload = vi.fn(); const onReplace = vi.fn();
  const { rerender } = render(<AttachmentList items={[{ id: 'a', label: 'evidence.pdf', kind: 'file', classification: 'confidential', uploadState: 'failed', uploadProgress: 40, error: '网络中断' }]} onRetry={onRetry} onRemove={onRemove} onDownload={onDownload} onReplace={onReplace} />);
  expect(screen.getByRole('progressbar', { name: 'evidence.pdf 上传进度' })).toHaveValue(40);
  await user.click(screen.getByRole('button', { name: '重试' })); expect(onRetry).toHaveBeenCalledWith('a');
  rerender(<AttachmentList items={[{ id: 'a', attachmentId: 'server-a', label: 'evidence.pdf', kind: 'file', classification: 'confidential', uploadState: 'uploaded' }]} onRetry={onRetry} onRemove={onRemove} onDownload={onDownload} onReplace={onReplace} />);
  await user.click(screen.getByRole('button', { name: '下载' })); expect(onDownload).toHaveBeenCalledWith('a');
  await user.upload(screen.getByLabelText('替换 evidence.pdf'), new File(['new'], 'new.pdf', { type: 'application/pdf' })); expect(onReplace).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '移除' })); expect(onRemove).toHaveBeenCalledWith('a');
});
