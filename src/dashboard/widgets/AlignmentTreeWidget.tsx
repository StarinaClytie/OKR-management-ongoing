import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../data/types';
import { prepareVisualizationData } from './visualizationData';
import { useLocale } from '../../i18n/LocaleProvider';

export interface AlignmentTreeWidgetProps {
  data: DashboardData;
}

export function AlignmentTreeWidget({ data }: AlignmentTreeWidgetProps) {
  const { t } = useLocale();
  const { alignmentProjects } = prepareVisualizationData(data, { unknownMember: t('table.member') });
  const objectives = alignmentProjects.flatMap((project) => project.objectives);

  if (objectives.length === 0) {
    return <p className="visualization-empty">{t('alignment.empty')}</p>;
  }

  return (
    <div className="alignment-tree">
      <p className="visualization-description">{t('alignment.description')}</p>
      <ObjectiveBranches objectives={objectives} />
    </div>
  );
}

function ObjectiveBranches({ objectives }: { objectives: ReturnType<typeof prepareVisualizationData>['alignmentProjects'][number]['objectives'] }) {
  const { t } = useLocale();
  return <ul className="alignment-tree__objectives">
              {objectives.map((objective) => (
                <li key={objective.id}>
                  <article className="alignment-node alignment-node--objective">
                    <div>
                      <span className="alignment-node__type">Objective</span>
                      <strong>{objective.title}</strong>
                      <small>{t('alignment.ownerLabel')}<span>{objective.ownerName}</span> · {objective.progress}%</small>
                    </div>
                    <StatusBadge status={objective.status} />
                  </article>
                  <ul>
                    {objective.keyResults.map((keyResult) => (
                      <li key={keyResult.id}>
                        <article className={keyResult.isCurrentUser ? 'alignment-node alignment-node--mine' : 'alignment-node'}>
                          <div>
                            <span className="alignment-node__type">KR</span>
                            <strong>{keyResult.title}</strong>
                            <small>
                              {t('alignment.ownerLabel')}<span>{keyResult.ownerName}{keyResult.isCurrentUser ? t('alignment.me') : ''}</span> · {keyResult.progress}%
                            </small>
                          </div>
                          <StatusBadge status={keyResult.status} />
                        </article>
                      </li>
                    ))}
                    {objective.hasRestrictedKeyResults ? (
                      <li><RestrictedContent classification="restricted" /></li>
                    ) : null}
                  </ul>
                </li>
              ))}
      </ul>;
}
