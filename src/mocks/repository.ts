import type {
  CollaborationRelation,
  DailyReport,
  DocumentRecord,
  KeyResult,
  Milestone,
  Objective,
  OrganizationRelation,
  ProgressSnapshot,
  Project,
  ProjectMembership,
  Risk,
  User,
  WeeklyReport,
  WorkloadEntry,
} from '../domain/types';
import type { ActiveShare } from '../domain/permissions';
import { keyResults, milestones, objectives, progressSnapshots, projects, risks } from './okr';
import { dailyReports, weeklyReports, workloads } from './reports';
import { activeShares, attachments, collaborationRelations, documents } from './security';
import { organizationRelations, projectMemberships, users } from './users';

export interface DashboardData {
  currentUser: User;
  projects: Project[];
  objectives: Objective[];
  keyResults: KeyResult[];
  milestones: Milestone[];
  risks: Risk[];
  progressSnapshots: ProgressSnapshot[];
  workloads: WorkloadEntry[];
}

export interface MockData {
  users: User[];
  organizationRelations: OrganizationRelation[];
  projectMemberships: ProjectMembership[];
  collaborationRelations: CollaborationRelation[];
  activeShares: ActiveShare[];
  projects: Project[];
  objectives: Objective[];
  keyResults: KeyResult[];
  milestones: Milestone[];
  risks: Risk[];
  progressSnapshots: ProgressSnapshot[];
  dailyReports: DailyReport[];
  weeklyReports: WeeklyReport[];
  workloads: WorkloadEntry[];
  attachments: DocumentRecord[];
  documents: DocumentRecord[];
}

export const mockData: MockData = {
  users,
  organizationRelations,
  projectMemberships,
  collaborationRelations,
  activeShares,
  projects,
  objectives,
  keyResults,
  milestones,
  risks,
  progressSnapshots,
  dailyReports,
  weeklyReports,
  workloads,
  attachments,
  documents,
};

export function validateRepositoryIntegrity(data: MockData): string[] {
  const errors: string[] = [];
  const userIds = new Set(data.users.map((user) => user.id));
  const projectIds = new Set(data.projects.map((project) => project.id));
  const objectivesById = new Map(data.objectives.map((objective) => [objective.id, objective]));
  const keyResultsById = new Map(data.keyResults.map((keyResult) => [keyResult.id, keyResult]));
  const dailyReportsById = new Map(data.dailyReports.map((report) => [report.id, report]));
  const weeklyReportsById = new Map(data.weeklyReports.map((report) => [report.id, report]));
  const attachmentsById = new Map(data.attachments.map((attachment) => [attachment.id, attachment]));

  for (const project of data.projects) {
    if (!userIds.has(project.leaderId)) {
      errors.push(`Project ${project.id} references unknown leader ${project.leaderId}`);
    }
    for (const memberId of project.memberIds) {
      if (!userIds.has(memberId)) {
        errors.push(`Project ${project.id} references unknown member ${memberId}`);
      }
    }
  }

  for (const objective of data.objectives) {
    if (!projectIds.has(objective.projectId)) {
      errors.push(`Objective ${objective.id} references unknown project ${objective.projectId}`);
    }
    if (!userIds.has(objective.ownerId)) {
      errors.push(`Objective ${objective.id} references unknown owner ${objective.ownerId}`);
    }
  }

  for (const keyResult of data.keyResults) {
    if (!objectivesById.has(keyResult.objectiveId)) {
      errors.push(`Key result ${keyResult.id} references unknown objective ${keyResult.objectiveId}`);
    }
    if (!userIds.has(keyResult.ownerId)) {
      errors.push(`Key result ${keyResult.id} references unknown owner ${keyResult.ownerId}`);
    }
  }

  const reportRecords = [...data.dailyReports, ...data.weeklyReports];
  const reportById = new Map(reportRecords.map((report) => [report.id, report]));

  for (const report of reportRecords) {
    const reportType = 'date' in report ? 'Daily report' : 'Weekly report';
    if (!userIds.has(report.authorId)) {
      errors.push(`${reportType} ${report.id} references unknown author ${report.authorId}`);
    }
    if (!projectIds.has(report.projectId)) {
      errors.push(`${reportType} ${report.id} references unknown project ${report.projectId}`);
    }
    const objective = objectivesById.get(report.objectiveId);
    if (!objective) {
      errors.push(`${reportType} ${report.id} references unknown objective ${report.objectiveId}`);
    } else if (objective.projectId !== report.projectId) {
      errors.push(`${reportType} ${report.id} objective ${objective.id} belongs to project ${objective.projectId}`);
    }
    for (const keyResultId of report.keyResultIds) {
      const keyResult = keyResultsById.get(keyResultId);
      if (!keyResult) {
        errors.push(`${reportType} ${report.id} references unknown key result ${keyResultId}`);
      } else if (keyResult.objectiveId !== report.objectiveId) {
        errors.push(`${reportType} ${report.id} key result ${keyResult.id} belongs to objective ${keyResult.objectiveId}`);
      }
    }
    for (const attachmentId of report.attachmentIds) {
      const attachment = attachmentsById.get(attachmentId);
      if (!attachment) {
        errors.push(`${reportType} ${report.id} references unknown attachment ${attachmentId}`);
      } else if (attachment.relatedResourceId !== report.id) {
        errors.push(`${reportType} ${report.id} references attachment ${attachment.id} linked to ${attachment.relatedResourceId ?? 'nothing'}`);
      }
    }
  }

  for (const attachment of data.attachments) {
    if (!userIds.has(attachment.ownerId)) {
      errors.push(`Attachment ${attachment.id} references unknown owner ${attachment.ownerId}`);
    }
    if (attachment.projectId && !projectIds.has(attachment.projectId)) {
      errors.push(`Attachment ${attachment.id} references unknown project ${attachment.projectId}`);
    }
    if (attachment.relatedResourceType === 'daily_report' && !dailyReportsById.has(attachment.relatedResourceId ?? '')) {
      errors.push(`Attachment ${attachment.id} references unknown daily report ${attachment.relatedResourceId}`);
    }
    if (attachment.relatedResourceType === 'weekly_report' && !weeklyReportsById.has(attachment.relatedResourceId ?? '')) {
      errors.push(`Attachment ${attachment.id} references unknown weekly report ${attachment.relatedResourceId}`);
    }
    if (attachment.relatedResourceType === 'objective' && !objectivesById.has(attachment.relatedResourceId ?? '')) {
      errors.push(`Attachment ${attachment.id} references unknown objective ${attachment.relatedResourceId}`);
    }
  }

  for (const share of data.activeShares.filter((candidate) => candidate.active)) {
    const report = reportById.get(share.resourceId);
    if (!report) {
      errors.push(`Active share ${share.id} references unknown report ${share.resourceId}`);
      continue;
    }
    if (report.authorId !== share.grantedByUserId) {
      errors.push(`Active share ${share.id} must be granted by report author ${report.authorId}`);
    }
    const relation = data.collaborationRelations.find(
      (candidate) =>
        candidate.viewerId === share.grantedToUserId &&
        candidate.subjectUserId === share.grantedByUserId &&
        candidate.projectId === report.projectId &&
        candidate.sharedResourceIds.includes(share.resourceId),
    );
    if (!relation) {
      errors.push(
        `Active share ${share.id} lacks a matching collaboration relation from ${share.grantedByUserId} to ${share.grantedToUserId}`,
      );
    }
  }

  return errors;
}

export const mockRepository = {
  getUser(id: string): User | undefined {
    return users.find((user) => user.id === id);
  },

  getDashboardData(userId: string): DashboardData {
    const currentUser = this.getUser(userId);

    if (!currentUser) {
      throw new Error(`Unknown mock user: ${userId}`);
    }

    return {
      currentUser,
      projects,
      objectives,
      keyResults,
      milestones,
      risks,
      progressSnapshots,
      workloads,
    };
  },
};
