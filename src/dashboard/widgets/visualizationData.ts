import { can } from '../../auth/permissionService';
import type {
  Classification,
  KeyResult,
  Milestone,
  Objective,
  ProgressSnapshot,
  ProgressStatus,
} from '../../domain/types';
import type { DashboardData } from '../../mocks/repository';
import { scoreRisk } from '../../domain/riskScore';

export interface PreparedKeyResult {
  id: string;
  title: string;
  ownerName: string;
  isCurrentUser: boolean;
  progress: number;
  status: ProgressStatus;
  startDate: string;
  dueDate: string;
}
export interface PreparedTask { id: string; title: string; keyResultTitle: string; startDate: string; dueDate: string; progress: number; }

export interface PreparedObjective {
  id: string;
  title: string;
  ownerName: string;
  progress: number;
  status: ProgressStatus;
  keyResults: PreparedKeyResult[];
  hasRestrictedKeyResults: boolean;
}

export interface PreparedAlignmentProject {
  id: string;
  companyObjectiveId?: string;
  name: string;
  startDate: string;
  dueDate: string;
  objectives: PreparedObjective[];
  hasRestrictedObjectives: boolean;
}

export interface PreparedMilestone {
  id: string;
  title: string;
  dueDate: string;
  status: ProgressStatus;
  dependencyLabels: string[];
}

export interface PreparedRisk {
  id: string;
  title: string;
  probability: 1 | 2 | 3;
  impact: 1 | 2 | 3;
  probabilityLabel: string;
  impactLabel: string;
  status: ProgressStatus;
  mitigation: string;
  reason: string;
  ownerName: string;
  lastReviewedAt: string;
  score: 1 | 2 | 3 | 4 | 6 | 9;
  level: 'low' | 'medium' | 'high' | 'critical';
}

export interface PreparedWorkload {
  id: string;
  memberName: string;
  plannedHours: number;
  loggedHours: number;
  capacityHours: number;
  overloaded: boolean;
}

export interface PreparedVisualizationData {
  companyObjectives: Array<{ id: string; title: string }>;
  alignmentProjects: PreparedAlignmentProject[];
  keyResults: PreparedKeyResult[];
  milestones: PreparedMilestone[];
  trendPoints: ProgressSnapshot[];
  risks: PreparedRisk[];
  workloads: PreparedWorkload[];
  tasks: PreparedTask[];
}

const probabilityLabels = { 1: '低概率', 2: '中概率', 3: '高概率' } as const;
const impactLabels = { 1: '低影响', 2: '中影响', 3: '高影响' } as const;

function isExplicitlyRestricted(classification: Classification): boolean {
  return classification === 'restricted';
}

function resolveUserName(data: DashboardData, userId: string): string {
  if (userId === data.currentUser.id) return data.currentUser.name;
  return data.users.find((user) => user.id === userId)?.name ?? '成员';
}

function prepareKeyResult(data: DashboardData, keyResult: KeyResult): PreparedKeyResult {
  return {
    id: keyResult.id,
    title: keyResult.title,
    ownerName: resolveUserName(data, keyResult.ownerId),
    isCurrentUser: keyResult.ownerId === data.currentUser.id,
    progress: keyResult.progress,
    status: keyResult.status,
    startDate: keyResult.startDate,
    dueDate: keyResult.dueDate,
  };
}

function canReadObjective(data: DashboardData, objective: Objective): boolean {
  return can(data.currentUser, 'okr.read_summary', objective).allowed;
}

function canReadKeyResult(data: DashboardData, keyResult: KeyResult): boolean {
  return can(data.currentUser, 'okr.read_summary', keyResult).allowed;
}

function canReadMilestone(data: DashboardData, milestone: Milestone): boolean {
  return can(data.currentUser, 'milestone.read', milestone).allowed;
}

export function prepareVisualizationData(data: DashboardData): PreparedVisualizationData {
  const companyObjectives = data.companyObjectives
    .filter((objective) => can(data.currentUser, 'company_objective.read', objective).allowed)
    .map((objective) => ({ id: objective.id, title: objective.title }));
  const visibleProjects = data.projects.filter((project) =>
    can(data.currentUser, 'okr.read_summary', project).allowed,
  );
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const visibleObjectives = data.objectives.filter(
    (objective) => visibleProjectIds.has(objective.projectId) && canReadObjective(data, objective),
  );
  const visibleObjectiveIds = new Set(visibleObjectives.map((objective) => objective.id));
  const visibleKeyResults = data.keyResults.filter(
    (keyResult) => visibleObjectiveIds.has(keyResult.objectiveId) && canReadKeyResult(data, keyResult),
  );
  const visibleKeyResultIds = new Set(visibleKeyResults.map((keyResult) => keyResult.id));

  const preparedKeyResults = visibleKeyResults.map((keyResult) => prepareKeyResult(data, keyResult));
  const preparedKeyResultsById = new Map(preparedKeyResults.map((keyResult) => [keyResult.id, keyResult]));

  const alignmentProjects = visibleProjects.map((project): PreparedAlignmentProject => {
    const projectObjectives = visibleObjectives.filter((objective) => objective.projectId === project.id);
    const hasRestrictedObjectives = data.objectives.some(
      (objective) => objective.projectId === project.id && isExplicitlyRestricted(objective.classification),
    );

    return {
      id: project.id,
      companyObjectiveId: project.companyObjectiveId,
      name: project.name,
      startDate: project.startDate,
      dueDate: project.dueDate,
      hasRestrictedObjectives,
      objectives: projectObjectives.map((objective): PreparedObjective => {
        const objectiveKeyResults = data.keyResults.filter(
          (keyResult) => keyResult.objectiveId === objective.id,
        );
        const restrictedKeyResultCount = objectiveKeyResults.filter((keyResult) =>
          isExplicitlyRestricted(keyResult.classification),
        ).length;

        return {
          id: objective.id,
          title: objective.title,
          ownerName: resolveUserName(data, objective.ownerId),
          progress: objective.progress,
          status: objective.status,
          keyResults: objectiveKeyResults
            .filter((keyResult) => visibleKeyResultIds.has(keyResult.id))
            .map((keyResult) => preparedKeyResultsById.get(keyResult.id)!),
          hasRestrictedKeyResults: restrictedKeyResultCount > 0,
        };
      }),
    };
  });

  const milestones = data.milestones
    .filter((milestone) => visibleProjectIds.has(milestone.projectId) && canReadMilestone(data, milestone))
    .map((milestone): PreparedMilestone => ({
      id: milestone.id,
      title: milestone.title,
      dueDate: milestone.dueDate,
      status: milestone.status,
      dependencyLabels: milestone.dependencyIds
        .map((dependencyId) => preparedKeyResultsById.get(dependencyId)?.title)
        .filter((label): label is string => Boolean(label)),
    }));
  const tasks = data.projectTasks.filter((task) => visibleKeyResultIds.has(task.keyResultId) && can(data.currentUser, 'task.read', task).allowed).map((task) => ({
    id: task.id, title: task.title, keyResultTitle: preparedKeyResultsById.get(task.keyResultId)?.title ?? '授权 KR', startDate: task.startDate, dueDate: task.dueDate, progress: task.progress,
  }));

  const trendSourceId = preparedKeyResults
    .map((keyResult) => ({
      id: keyResult.id,
      pointCount: data.progressSnapshots.filter((point) => point.keyResultId === keyResult.id).length,
    }))
    .sort((left, right) => right.pointCount - left.pointCount)[0]?.id;
  const trendPoints = trendSourceId
    ? data.progressSnapshots
        .filter((point) => point.keyResultId === trendSourceId && visibleKeyResultIds.has(point.keyResultId))
        .sort((left, right) => left.weekOf.localeCompare(right.weekOf))
    : [];

  const risks = data.risks
    .filter((risk) => can(data.currentUser, 'risk.read', risk).allowed)
    .map((risk): PreparedRisk => ({
      id: risk.id,
      title: risk.title,
      probability: risk.probability,
      impact: risk.impact,
      probabilityLabel: probabilityLabels[risk.probability],
      impactLabel: impactLabels[risk.impact],
      status: risk.status,
      mitigation: risk.mitigation,
      reason: risk.reason ?? risk.description,
      ownerName: resolveUserName(data, risk.ownerId),
      lastReviewedAt: risk.lastReviewedAt ?? risk.identifiedAt,
      ...scoreRisk(risk.probability, risk.impact),
    }));

  const workloads = data.workloads
    .filter((workload) => can(data.currentUser, 'worklog.read_hours', workload).allowed)
    .map((workload): PreparedWorkload => ({
      id: workload.id,
      memberName: resolveUserName(data, workload.userId),
      plannedHours: workload.plannedHours,
      loggedHours: workload.loggedHours,
      capacityHours: workload.capacityHours,
      overloaded: workload.loggedHours > workload.capacityHours,
    }));

  return {
    companyObjectives,
    alignmentProjects,
    keyResults: preparedKeyResults,
    milestones,
    trendPoints,
    risks,
    workloads,
    tasks,
  };
}
