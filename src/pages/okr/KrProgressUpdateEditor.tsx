import { useState, type FormEvent } from 'react';
import { useLocale } from '../../i18n/LocaleProvider';

export interface KrProgressUpdateInput {
  newProgress: number;
  summary: string;
  blocker?: string;
  reason?: string;
  nextAction?: string;
  evidence?: string;
}

export interface KrProgressUpdateEditorProps {
  currentProgress: number;
  onSubmit: (input: KrProgressUpdateInput) => void;
  onCancel: () => void;
}

export function KrProgressUpdateEditor({ currentProgress, onSubmit, onCancel }: KrProgressUpdateEditorProps) {
  const { t } = useLocale();
  const [newProgress, setNewProgress] = useState<number | undefined>(currentProgress);
  const [summary, setSummary] = useState('');
  const [blocker, setBlocker] = useState('');
  const [reason, setReason] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (newProgress === undefined || !Number.isFinite(newProgress) || newProgress < 0 || newProgress > 100) {
      setError(t('krProgress.validation.progress'));
      return;
    }
    if (!summary.trim()) {
      setError(t('krProgress.validation.summary'));
      return;
    }
    onSubmit({
      newProgress,
      summary: summary.trim(),
      blocker: blocker.trim() || undefined,
      reason: reason.trim() || undefined,
      nextAction: nextAction.trim() || undefined,
      evidence: evidence.trim() || undefined,
    });
  }

  return (
    <form className="form-card form-section" onSubmit={handleSubmit} noValidate aria-label={t('krProgress.updateTitle')}>
      <h3>{t('krProgress.updateTitle')}</h3>
      <label htmlFor="kr-update-progress">
        {t('krProgress.newProgress')}
        <input id="kr-update-progress" type="number" min="0" max="100" inputMode="decimal" value={newProgress ?? ''} onChange={(event) => setNewProgress(event.target.value === '' ? undefined : Number(event.target.value))} />
      </label>
      <label htmlFor="kr-update-summary">
        {t('krProgress.summary')} *
        <textarea id="kr-update-summary" value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} />
      </label>
      <label htmlFor="kr-update-blocker">
        {t('krProgress.blocker')}
        <input id="kr-update-blocker" value={blocker} onChange={(event) => setBlocker(event.target.value)} />
      </label>
      <label htmlFor="kr-update-reason">
        {t('krProgress.reason')}
        <input id="kr-update-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <label htmlFor="kr-update-next">
        {t('krProgress.nextAction')}
        <input id="kr-update-next" value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
      </label>
      <label htmlFor="kr-update-evidence">
        {t('krProgress.evidence')}
        <input id="kr-update-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="inline-actions">
        <button type="button" className="button button--secondary" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="button button--primary">{t('krProgress.save')}</button>
      </div>
    </form>
  );
}
