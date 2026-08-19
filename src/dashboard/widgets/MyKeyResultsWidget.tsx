import { useNavigate } from 'react-router-dom';
import { PermissionGate } from '../../auth/PermissionGate';
import type { DashboardData } from '../../data/types';
import { ProgressRing } from '../../components/ProgressRing';
import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import { useLocale } from '../../i18n/LocaleProvider';
import { can } from '../../auth/permissionService';
import { deriveExecutionStatuses } from '../../domain/progressStatus';

export interface MyKeyResultsWidgetProps {
  data: DashboardData;
}

export function MyKeyResultsWidget({ data }: MyKeyResultsWidgetProps) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const ownedKeyResults = data.keyResults.filter((keyResult) => keyResult.ownerId === data.currentUser.id);
  const executionStatuses = deriveExecutionStatuses({
    ...data,
    risks: data.risks.filter((risk) => can(data.currentUser, 'risk.read', risk).allowed),
  });

  return (
    <section className="dashboard-widget" aria-labelledby="my-key-results-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('myKr.eyebrow')}</p>
          <h2 id="my-key-results-title">{t('myKr.title')}</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={() => navigate('/okrs')}>
          {t('myKr.update')}
        </button>
      </div>
      <div className="dashboard-list">
        {ownedKeyResults.map((keyResult) => (
          <PermissionGate
            key={keyResult.id}
            action="okr.read_detail"
            resource={keyResult}
            fallback={<RestrictedContent classification={keyResult.classification} />}
          >
            <article className="key-result-row">
              <ProgressRing value={keyResult.progress} label={t('myKr.progressLabel', { title: keyResult.title })} size="small" />
              <div className="key-result-row__body">
                <strong>{keyResult.title}</strong>
                <span>{t('myKr.due', { date: keyResult.dueDate })}</span>
              </div>
              <StatusBadge status={executionStatuses.keyResults.get(keyResult.id)?.status ?? keyResult.status} />
            </article>
          </PermissionGate>
        ))}
      </div>
    </section>
  );
}
