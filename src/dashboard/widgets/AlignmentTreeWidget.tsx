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
  const { alignmentProjects, companyObjectives } = prepareVisualizationData(data, { unknownMember: t('table.member') });

  if (alignmentProjects.length === 0) {
    return <p className="visualization-empty">{t('alignment.empty')}</p>;
  }

  return (
    <div className="alignment-tree">
      <p className="visualization-description">{t('alignment.description')}</p>
      {companyObjectives.map((companyObjective) => {
        const projects = alignmentProjects.filter((project) => project.companyObjectiveId === companyObjective.id);
        if (projects.length === 0) return null;
        return <section key={companyObjective.id} aria-label={t('alignment.companyObjectiveLabel', { title: companyObjective.title })}>
          <article className="alignment-node alignment-node--company"><span className="alignment-node__type">{t('alignment.companyO')}</span><strong>{companyObjective.title}</strong></article>
          <ProjectBranches projects={projects} />
        </section>;
      })}
      <ProjectBranches projects={alignmentProjects.filter((project) => !companyObjectives.some((objective) => objective.id === project.companyObjectiveId))} />
    </div>
  );
}

function ProjectBranches({ projects }: { projects: ReturnType<typeof prepareVisualizationData>['alignmentProjects'] }) {
  const { t } = useLocale();
  if (projects.length === 0) return null;
  return <ul className="alignment-tree__projects">
        {projects.map((project) => (
          <li key={project.id}>
            <article className="alignment-node alignment-node--project">
              <span className="alignment-node__type">{t('alignment.projectObjective')}</span>
              <strong>{project.name}</strong>
            </article>
            <ul>
              {project.objectives.map((objective) => (
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
              {project.hasRestrictedObjectives ? (
                <li><RestrictedContent classification="restricted" /></li>
              ) : null}
            </ul>
          </li>
        ))}
      </ul>;
}
