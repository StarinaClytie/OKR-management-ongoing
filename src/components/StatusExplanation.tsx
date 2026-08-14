import { StatusBadge } from './StatusBadge';
import type { StatusReason } from '../domain/progressStatus';
import type { ProgressStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { LocaleContextValue } from '../i18n/LocaleProvider';

function reasonText(reason: StatusReason, t: LocaleContextValue['t']): string {
  switch (reason.code) {
    case 'behind_plan': return t('statusExplanation.behindPlan', { actual: reason.actual, planned: reason.planned, gap: Math.abs(reason.gap) });
    case 'overdue_milestone': return t('statusExplanation.overdueMilestone', { date: reason.dueDate });
    case 'overdue_due_date': return t('statusExplanation.overdueDueDate', { date: reason.dueDate });
    case 'high_risk': return t('statusExplanation.highRisk');
    case 'critical_risk': return t('statusExplanation.criticalRisk');
    case 'complete': return t('statusExplanation.completed', { actual: reason.actual });
  }
}

export function StatusExplanation({ result }: { result: { status: ProgressStatus; reasons: StatusReason[] } }) {
  const { t } = useLocale();
  return (
    <section className="status-explanation" aria-label={t('statusExplanation.label')}>
      <StatusBadge status={result.status} />
      <p>{t('statusExplanation.summary')}</p>
      {result.reasons.length > 0
        ? <ul>{result.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reasonText(reason, t)}</li>)}</ul>
        : <p>{t('statusExplanation.healthy')}</p>}
    </section>
  );
}
