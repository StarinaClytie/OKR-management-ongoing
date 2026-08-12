import { useNavigate } from 'react-router-dom';
import { PermissionGate } from '../../auth/PermissionGate';
import type { DashboardData } from '../../mocks/repository';
import { ProgressRing } from '../../components/ProgressRing';
import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';

export interface MyKeyResultsWidgetProps {
  data: DashboardData;
}

export function MyKeyResultsWidget({ data }: MyKeyResultsWidgetProps) {
  const navigate = useNavigate();
  const ownedKeyResults = data.keyResults.filter((keyResult) => keyResult.ownerId === data.currentUser.id);

  return (
    <section className="dashboard-widget" aria-labelledby="my-key-results-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">我的执行项</p>
          <h2 id="my-key-results-title">我的关键结果</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={() => navigate('/okrs')}>
          更新 KR
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
              <ProgressRing value={keyResult.progress} label={`${keyResult.title}完成进度`} size="small" />
              <div className="key-result-row__body">
                <strong>{keyResult.title}</strong>
                <span>截止 {keyResult.dueDate}</span>
              </div>
              <StatusBadge status={keyResult.status} />
            </article>
          </PermissionGate>
        ))}
      </div>
    </section>
  );
}
