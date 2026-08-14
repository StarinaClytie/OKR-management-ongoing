import { useRef, useState, type FormEvent } from 'react';
import type { KeyResult } from '../domain/types';
import type { KrProgressInput, RepositoryResult } from '../data/types';
import { useLocale } from '../i18n/LocaleProvider';
import { repositoryErrorKey } from '../i18n/repositoryErrors';

interface KrProgressEditorProps {
  ownerId: string;
  keyResults: KeyResult[];
  onSave: (input: KrProgressInput) => Promise<RepositoryResult<{ snapshotId: string }>>;
  onCancel?: () => void;
}

export function KrProgressEditor({ ownerId, keyResults, onSave, onCancel }: KrProgressEditorProps) {
  const { t } = useLocale();
  const ownedKeyResults = keyResults.filter((keyResult) => keyResult.ownerId === ownerId);
  const [keyResultId, setKeyResultId] = useState(ownedKeyResults[0]?.id ?? '');
  const [progress, setProgress] = useState(ownedKeyResults[0] ? String(ownedKeyResults[0].progress) : '');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);

  if (ownedKeyResults.length === 0) {
    return <p role="status">{t('kr.noneOwned')}</p>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submissionPending.current) return;
    setError('');
    const numericProgress = Number(progress);
    if (progress.trim() === '' || !Number.isFinite(numericProgress) || numericProgress < 0 || numericProgress > 100) {
      setError(t('kr.progressRange'));
      return;
    }
    if (!effectiveDate || !note.trim()) {
      setError(t('kr.dateNoteRequired'));
      return;
    }

    submissionPending.current = true;
    setSubmitting(true);
    try {
      const result = await onSave({ keyResultId, progress: numericProgress, effectiveDate, note: note.trim() });
      if (!result.ok) setError(t(repositoryErrorKey(result.error.code)));
    } catch {
      setError(t('common.requestFailed'));
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="form-card form-section" onSubmit={submit} noValidate>
      <h2>{t('okr.updateMine')}</h2>
      <label>{t('okr.keyResult')}
        <select value={keyResultId} onChange={(event) => {
          const nextId = event.target.value;
          setKeyResultId(nextId);
          setProgress(String(ownedKeyResults.find((item) => item.id === nextId)?.progress ?? ''));
        }}>
          {ownedKeyResults.map((keyResult) => <option key={keyResult.id} value={keyResult.id}>{keyResult.title}</option>)}
        </select>
      </label>
      <label>{t('kr.actualProgress')}
        <input type="number" min="0" max="100" step="0.01" value={progress} onChange={(event) => setProgress(event.target.value)} />
      </label>
      <label>{t('kr.effectiveDate')}
        <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
      </label>
      <label>{t('kr.note')}
        <textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="inline-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? t('common.saving') : t('kr.saveProgress')}</button>
        {onCancel && <button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>{t('common.cancel')}</button>}
      </div>
    </form>
  );
}
