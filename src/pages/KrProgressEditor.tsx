import { useRef, useState, type FormEvent } from 'react';
import type { KeyResult } from '../domain/types';
import type { KrProgressInput, RepositoryResult } from '../data/types';

interface KrProgressEditorProps {
  ownerId: string;
  keyResults: KeyResult[];
  onSave: (input: KrProgressInput) => Promise<RepositoryResult<{ snapshotId: string }>>;
  onCancel?: () => void;
}

export function KrProgressEditor({ ownerId, keyResults, onSave, onCancel }: KrProgressEditorProps) {
  const ownedKeyResults = keyResults.filter((keyResult) => keyResult.ownerId === ownerId);
  const [keyResultId, setKeyResultId] = useState(ownedKeyResults[0]?.id ?? '');
  const [progress, setProgress] = useState(ownedKeyResults[0] ? String(ownedKeyResults[0].progress) : '');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);

  if (ownedKeyResults.length === 0) {
    return <p role="status">当前没有由你负责、可更新的关键结果。</p>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submissionPending.current) return;
    setError('');
    const numericProgress = Number(progress);
    if (progress.trim() === '' || !Number.isFinite(numericProgress) || numericProgress < 0 || numericProgress > 100) {
      setError('实际进度必须在 0 到 100 之间。');
      return;
    }
    if (!effectiveDate || !note.trim()) {
      setError('请填写生效日期和更新说明。');
      return;
    }

    submissionPending.current = true;
    setSubmitting(true);
    try {
      const result = await onSave({ keyResultId, progress: numericProgress, effectiveDate, note: note.trim() });
      if (!result.ok) setError(result.error.message);
    } catch {
      setError('请求未完成，请稍后重试。');
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="form-card form-section" onSubmit={submit} noValidate>
      <h2>更新我的 KR</h2>
      <label>关键结果
        <select value={keyResultId} onChange={(event) => {
          const nextId = event.target.value;
          setKeyResultId(nextId);
          setProgress(String(ownedKeyResults.find((item) => item.id === nextId)?.progress ?? ''));
        }}>
          {ownedKeyResults.map((keyResult) => <option key={keyResult.id} value={keyResult.id}>{keyResult.title}</option>)}
        </select>
      </label>
      <label>实际进度（0–100）
        <input type="number" min="0" max="100" step="0.01" value={progress} onChange={(event) => setProgress(event.target.value)} />
      </label>
      <label>生效日期
        <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
      </label>
      <label>更新说明
        <textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="inline-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? '保存中…' : '保存 KR 进度'}</button>
        {onCancel && <button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>取消</button>}
      </div>
    </form>
  );
}
