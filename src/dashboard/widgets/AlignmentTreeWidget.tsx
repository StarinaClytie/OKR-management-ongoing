import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData } from './visualizationData';

export interface AlignmentTreeWidgetProps {
  data: DashboardData;
}

export function AlignmentTreeWidget({ data }: AlignmentTreeWidgetProps) {
  const { alignmentProjects, companyObjectives } = prepareVisualizationData(data);

  if (alignmentProjects.length === 0) {
    return <p className="visualization-empty">当前权限范围内没有可展示的 OKR 对齐关系。</p>;
  }

  return (
    <div className="alignment-tree">
      <p className="visualization-description">从项目目标向下查看 Objective、KR 与负责人。</p>
      {companyObjectives.map((companyObjective) => {
        const projects = alignmentProjects.filter((project) => project.companyObjectiveId === companyObjective.id);
        if (projects.length === 0) return null;
        return <section key={companyObjective.id} aria-label={`公司目标：${companyObjective.title}`}>
          <article className="alignment-node alignment-node--company"><span className="alignment-node__type">公司 O</span><strong>{companyObjective.title}</strong></article>
          <ProjectBranches projects={projects} />
        </section>;
      })}
      <ProjectBranches projects={alignmentProjects.filter((project) => !companyObjectives.some((objective) => objective.id === project.companyObjectiveId))} />
    </div>
  );
}

function ProjectBranches({ projects }: { projects: ReturnType<typeof prepareVisualizationData>['alignmentProjects'] }) {
  if (projects.length === 0) return null;
  return <ul className="alignment-tree__projects">
        {projects.map((project) => (
          <li key={project.id}>
            <article className="alignment-node alignment-node--project">
              <span className="alignment-node__type">项目目标</span>
              <strong>{project.name}</strong>
            </article>
            <ul>
              {project.objectives.map((objective) => (
                <li key={objective.id}>
                  <article className="alignment-node alignment-node--objective">
                    <div>
                      <span className="alignment-node__type">Objective</span>
                      <strong>{objective.title}</strong>
                      <small>负责人：{objective.ownerName} · {objective.progress}%</small>
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
                              负责人：<span>{keyResult.ownerName}{keyResult.isCurrentUser ? '（我）' : ''}</span> · {keyResult.progress}%
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
