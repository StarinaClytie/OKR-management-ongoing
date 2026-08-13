import type { DailyEvidenceDraft } from '../../domain/dailyEntry';

export function AttachmentList({ items, onRetry, onReplace, onRemove, onDownload }: {
  items: DailyEvidenceDraft[];
  onRetry?: (id: string) => void;
  onReplace?: (id: string, file: File) => void;
  onRemove?: (id: string) => void;
  onDownload?: (id: string) => void;
}) {
  if (!items.length) return null;
  return <ul aria-label="已选附件" className="attachment-list">{items.map((item) => <li key={item.id}>
    <span>{item.label}</span><span>{item.classification}</span>
    <progress aria-label={`${item.label} 上传进度`} max={100} value={item.uploadProgress ?? (item.uploadState === 'uploaded' ? 100 : 0)} />
    <span role={item.error ? 'alert' : undefined}>{item.error ?? item.uploadState}</span>
    {item.uploadState === 'failed' && <button type="button" onClick={() => onRetry?.(item.id)}>重试</button>}
    {item.uploadState === 'uploaded' && <button type="button" onClick={() => onDownload?.(item.id)}>下载</button>}
    <label className="text-button">替换<input className="sr-only" aria-label={`替换 ${item.label}`} type="file" onChange={(event) => event.target.files?.[0] && onReplace?.(item.id, event.target.files[0])} /></label>
    <button type="button" onClick={() => onRemove?.(item.id)}>移除</button>
  </li>)}</ul>;
}
