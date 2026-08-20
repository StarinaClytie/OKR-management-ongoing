import { configurePermissionSource } from '../auth/permissionService';
import { mockData } from '../mocks/repository';
import { getMockResourceDetail, mockResources } from '../mocks/resources';
import type {
  ApprovePendingUserInput,
  AuthProfileState,
  ClassifiedAttachmentInput,
  CreateResourceInput,
  DailyReportInput,
  DashboardData,
  KeyResultCreateInput,
  KeyResultUpdateInput,
  KrProgressInput,
  KrProgressUpdateInput,
  ObjectiveCreateInput,
  ObjectiveUpdateInput,
  OkrRepository,
  OrganizationUser,
  OwnedRiskInput,
  ProjectCreateInput,
  ProjectDetail,
  ProjectSummary,
  ProjectUpdateInput,
  ReportResourceProblemInput,
  ReportResourceProblemResult,
  RepositoryResult,
  ResolveResourceProblemInput,
  Resource,
  ResourceDetail,
  RetryResourceProblemNotificationResult,
  UpdateResourceInput,
  UpdateUserInput,
} from './types';
import type {
  DailyReport,
  KeyResult,
  KrAssignment,
  KrProgressUpdate,
  Objective,
  ProgressStatus,
  Project,
  ProjectStatus,
  Risk,
} from '../domain/types';

function unsupported<T>(): RepositoryResult<T> {
  return { ok: false, error: { code: 'validation', message: '当前环境不支持此持久化操作' } };
}

function riskStatus(probability: 1 | 2 | 3, impact: 1 | 2 | 3, resolved: boolean): ProgressStatus {
  if (resolved) return 'on_track';
  const score = probability * impact;
  return score === 9 ? 'off_track' : score >= 6 ? 'at_risk' : 'on_track';
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

/**
 * Demo-mode repository. It owns an in-memory, mutable copy of the demo seed so
 * pages can treat demo and Supabase identically (read via `getDashboardData`,
 * write via the same mutation methods). This is the ONLY runtime consumer of the
 * demo fixtures; production Supabase mode never constructs this class.
 */
export class DemoOkrRepository implements OkrRepository {
  readonly mode = 'demo' as const;

  private lastUserId = 'user-employee';
  private projects: Project[] = [...mockData.projects];
  private objectives: Objective[] = [...mockData.objectives];
  private keyResults: KeyResult[] = [...mockData.keyResults];
  private krAssignments: KrAssignment[] = [...mockData.krAssignments];
  private krProgressUpdates: KrProgressUpdate[] = [...mockData.krProgressUpdates];
  private risks: Risk[] = [...mockData.risks];

  constructor() {
    // The demo repository is the sole owner of demo-mode relationship data.
    configurePermissionSource(mockData);
  }

  private buildDashboardData(userId: string): DashboardData {
    const currentUser = mockData.users.find((user) => user.id === userId);
    if (!currentUser) {
      throw new Error(`Unknown demo user: ${userId}`);
    }
    return {
      currentUser,
      users: mockData.users,
      dailyReports: mockData.dailyReports,
      weeklyReports: mockData.weeklyReports,
      projects: this.projects,
      objectives: this.objectives,
      keyResults: this.keyResults,
      krAssignments: this.krAssignments,
      krProgressUpdates: this.krProgressUpdates,
      milestones: mockData.milestones,
      risks: this.risks,
      progressSnapshots: mockData.progressSnapshots,
      workloads: mockData.workloads,
      attachments: mockData.attachments,
      companyObjectives: mockData.companyObjectives,
      projectTasks: mockData.projectTasks,
    };
  }

  getCachedDashboardData(userId: string): DashboardData {
    this.lastUserId = userId;
    return this.buildDashboardData(userId);
  }

  async getCurrentProfile(): Promise<RepositoryResult<AuthProfileState>> {
    return { ok: true, data: { kind: 'error' } };
  }

  async getDashboardData(userId = 'user-employee'): Promise<RepositoryResult<DashboardData>> {
    this.lastUserId = userId;
    return { ok: true, data: this.buildDashboardData(userId) };
  }

  async listDailyReports(): Promise<RepositoryResult<DailyReport[]>> {
    return { ok: true, data: mockData.dailyReports };
  }

  async listOrganizationUsers(): Promise<RepositoryResult<OrganizationUser[]>> {
    return {
      ok: true,
      data: mockData.users.map((user) => ({
        id: user.id,
        displayName: user.name,
        email: '',
        department: user.department,
        jobTitle: user.title,
        role: user.role,
        isActive: true,
        approvalStatus: 'approved',
        createdAt: '',
        projectIds: user.projectIds,
      })),
    };
  }

  // ---- Projects (execution-view) CRUD ----

  async createProject(input: ProjectCreateInput): Promise<RepositoryResult<{ id: string }>> {
    const id = nextId('project');
    this.projects = [...this.projects, {
      id, name: input.name, description: input.description, leaderId: input.leaderId,
      memberIds: input.memberIds, classification: input.classification, startDate: input.startDate,
      dueDate: input.dueDate, status: 'on_track', lifecycle: input.status,
    }];
    return { ok: true, data: { id } };
  }

  async updateProject(input: ProjectUpdateInput): Promise<RepositoryResult<void>> {
    this.projects = this.projects.map((project) => project.id === input.projectId
      ? { ...project, name: input.name, description: input.description, startDate: input.startDate, dueDate: input.dueDate, classification: input.classification, lifecycle: input.status }
      : project);
    return { ok: true, data: undefined };
  }

  async archiveProject(projectId: string): Promise<RepositoryResult<void>> {
    this.projects = this.projects.map((project) => project.id === projectId ? { ...project, lifecycle: 'archived' } : project);
    return { ok: true, data: undefined };
  }

  async restoreProject(projectId: string): Promise<RepositoryResult<void>> {
    this.projects = this.projects.map((project) => project.id === projectId ? { ...project, lifecycle: 'active' } : project);
    return { ok: true, data: undefined };
  }

  async setProjectLeader(_projectId: string, _leaderId: string): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async setProjectMembers(_projectId: string, _memberIds: string[]): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async listProjects(): Promise<RepositoryResult<ProjectSummary[]>> {
    return {
      ok: true,
      data: this.projects.map((project) => ({
        id: project.id,
        name: project.name,
        leaderId: project.leaderId,
        leaderName: mockData.users.find((user) => user.id === project.leaderId)?.name ?? '',
      })),
    };
  }
  async setUserProjectMemberships(_userId: string, _projectIds: string[]): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async setProjectStatus(_projectId: string, _status: ProjectStatus): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async getProjectDetail(_projectId: string): Promise<RepositoryResult<ProjectDetail>> { return unsupported<ProjectDetail>(); }

  // ---- Objective (portfolio/goal view) CRUD ----

  async createObjective(input: ObjectiveCreateInput): Promise<RepositoryResult<{ id: string }>> {
    const number = input.number?.trim()
      ? input.number.trim()
      : `O-${input.quarter}-${String(this.objectives.filter((objective) => objective.quarter === input.quarter).length + 1).padStart(3, '0')}`;
    const projectId = nextId('project');
    const objectiveId = nextId('objective');
    this.projects = [...this.projects, {
      id: projectId, name: input.name, description: input.description, leaderId: input.leaderId,
      memberIds: [input.leaderId], classification: input.classification, startDate: input.startDate,
      dueDate: input.dueDate, status: 'on_track', lifecycle: 'active',
    }];
    this.objectives = [...this.objectives, {
      id: objectiveId, projectId, title: input.name, description: input.description, ownerId: input.leaderId,
      progress: 0, status: 'on_track', startDate: input.startDate, dueDate: input.dueDate,
      classification: input.classification, number, quarter: input.quarter, priority: input.priority, okrStatus: 'not_started',
    }];
    return { ok: true, data: { id: objectiveId } };
  }

  async updateObjective(input: ObjectiveUpdateInput): Promise<RepositoryResult<void>> {
    const objective = this.objectives.find((candidate) => candidate.id === input.objectiveId);
    this.objectives = this.objectives.map((candidate) => candidate.id === input.objectiveId
      ? { ...candidate, title: input.name, number: input.number, ownerId: input.leaderId, quarter: input.quarter, startDate: input.startDate, dueDate: input.dueDate, priority: input.priority, description: input.description, classification: input.classification }
      : candidate);
    if (objective) {
      this.projects = this.projects.map((project) => project.id === objective.projectId
        ? { ...project, name: input.name, leaderId: input.leaderId, startDate: input.startDate, dueDate: input.dueDate, classification: input.classification }
        : project);
    }
    return { ok: true, data: undefined };
  }

  async archiveObjective(objectiveId: string): Promise<RepositoryResult<void>> {
    this.objectives = this.objectives.map((objective) => objective.id === objectiveId ? { ...objective, archivedAt: new Date().toISOString() } : objective);
    return { ok: true, data: undefined };
  }

  async restoreObjective(objectiveId: string): Promise<RepositoryResult<void>> {
    this.objectives = this.objectives.map((objective) => objective.id === objectiveId ? { ...objective, archivedAt: null } : objective);
    return { ok: true, data: undefined };
  }

  // ---- Key Result CRUD ----

  async createKeyResult(input: KeyResultCreateInput): Promise<RepositoryResult<{ id: string }>> {
    const objective = this.objectives.find((candidate) => candidate.id === input.objectiveId);
    const id = nextId('kr');
    const ownerId = input.ownerIds[0] ?? '';
    this.keyResults = [...this.keyResults, {
      id, objectiveId: input.objectiveId, title: input.title, ownerId, progress: 0,
      status: 'on_track', startDate: objective?.startDate ?? '', dueDate: input.dueDate,
      classification: input.classification, metricType: input.metricType, currentValue: input.currentValue,
      targetValue: input.targetValue, unit: input.unit, notes: input.notes, confidenceIndex: input.confidenceIndex,
      priority: input.priority, okrStatus: 'not_started',
    }];
    this.krAssignments = [...this.krAssignments,
      ...input.ownerIds.map((userId, index) => ({ id: `${id}-owner-${index}`, krId: id, userId, assignmentRole: 'owner' as const })),
    ];
    return { ok: true, data: { id } };
  }

  async updateKeyResult(input: KeyResultUpdateInput): Promise<RepositoryResult<void>> {
    this.keyResults = this.keyResults.map((keyResult) => keyResult.id === input.keyResultId
      ? { ...keyResult, title: input.title, ownerId: input.ownerIds[0] ?? '', dueDate: input.dueDate, metricType: input.metricType, currentValue: input.currentValue, targetValue: input.targetValue, unit: input.unit, notes: input.notes, confidenceIndex: input.confidenceIndex, priority: input.priority, classification: input.classification }
      : keyResult);
    this.krAssignments = [...this.krAssignments.filter((assignment) => assignment.krId !== input.keyResultId),
      ...input.ownerIds.map((userId, index) => ({ id: `${input.keyResultId}-owner-${index}`, krId: input.keyResultId, userId, assignmentRole: 'owner' as const })),
    ];
    return { ok: true, data: undefined };
  }

  // ---- KR progress updates & risks ----

  async saveKrProgressUpdate(input: KrProgressUpdateInput): Promise<RepositoryResult<{ id: string }>> {
    const id = nextId('update');
    this.keyResults = this.keyResults.map((keyResult) => keyResult.id === input.keyResultId
      ? { ...keyResult, progress: input.newProgress, status: (input.newProgress >= 100 ? 'complete' : 'on_track') as ProgressStatus }
      : keyResult);
    this.krProgressUpdates = [{
      id, krId: input.keyResultId, authorId: this.lastUserId, previousProgress: input.previousProgress,
      newProgress: input.newProgress, summary: input.summary, blocker: input.blocker, reason: input.reason,
      nextAction: input.nextAction, evidence: input.evidence, createdAt: new Date().toISOString(),
    }, ...this.krProgressUpdates];
    return { ok: true, data: { id } };
  }

  async saveOwnedRisk(input: OwnedRiskInput): Promise<RepositoryResult<{ id: string }>> {
    const id = input.id ?? nextId('risk');
    const risk: Risk = {
      id, projectId: input.projectId, keyResultId: input.keyResultId ?? undefined, objectiveId: input.objectiveId ?? undefined,
      title: input.title, description: input.reason, ownerId: this.lastUserId, probability: input.probability, impact: input.impact,
      mitigation: input.mitigation, reason: input.reason, lastReviewedAt: input.lastReviewedAt,
      status: riskStatus(input.probability, input.impact, input.resolved), classification: input.classification,
      identifiedAt: input.lastReviewedAt, resolved: input.resolved,
    };
    this.risks = [...this.risks.filter((existing) => existing.id !== id), risk];
    return { ok: true, data: { id } };
  }

  // ---- Resources (preview) ----

  async listResources(): Promise<RepositoryResult<Resource[]>> {
    return { ok: true, data: mockResources };
  }

  async getResourceDetail(resourceId: string): Promise<RepositoryResult<ResourceDetail>> {
    const detail = getMockResourceDetail(resourceId);
    return detail
      ? { ok: true, data: detail }
      : { ok: false, error: { code: 'not_found', message: '请求的资源不存在' } };
  }

  async createResource(_input: CreateResourceInput): Promise<RepositoryResult<{ id: string }>> { return unsupported<{ id: string }>(); }
  async updateResource(_input: UpdateResourceInput): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async archiveResource(_resourceId: string): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async restoreResource(_resourceId: string): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async reportResourceProblem(_input: ReportResourceProblemInput): Promise<RepositoryResult<ReportResourceProblemResult>> { return unsupported<ReportResourceProblemResult>(); }
  async resolveResourceProblem(_input: ResolveResourceProblemInput): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async retryResourceProblemNotification(_problemId: string): Promise<RepositoryResult<RetryResourceProblemNotificationResult>> { return unsupported<RetryResourceProblemNotificationResult>(); }
  async beginResourceAttachmentUpload(_input: Record<string, unknown>): Promise<RepositoryResult<import('./types').ResourceUploadTarget>> { return unsupported<import('./types').ResourceUploadTarget>(); }
  async finalizeResourceAttachmentUpload(_id: string): Promise<RepositoryResult<unknown>> { return unsupported<unknown>(); }
  async createResourceAttachmentDownload(_id: string): Promise<RepositoryResult<{ url: string }>> { return unsupported<{ url: string }>(); }
  async uploadResourceAttachment(_resourceId: string, _file: File): Promise<RepositoryResult<{ id: string }>> { return unsupported<{ id: string }>(); }

  // ---- Users (preview) ----

  async approvePendingUser(_input: ApprovePendingUserInput): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async rejectPendingUser(_userId: string): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async createPendingProfile(_displayName: string): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async updateUserProfile(_input: UpdateUserInput): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async setUserActive(_userId: string, _active: boolean): Promise<RepositoryResult<void>> { return unsupported<void>(); }

  // ---- Daily reports (preview) ----

  async createDailyReport(_input: DailyReportInput): Promise<RepositoryResult<{ id: string; revision: number }>> { return unsupported<{ id: string; revision: number }>(); }
  async createDailyReportWithAttachments(_input: DailyReportInput, _attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ id: string; revision: number }>> { return unsupported<{ id: string; revision: number }>(); }
  async updateDailyReport(_reportId: string, _expectedRevision: number, _input: DailyReportInput): Promise<RepositoryResult<{ revision: number }>> { return unsupported<{ revision: number }>(); }
  async updateDailyReportWithAttachments(_reportId: string, _expectedRevision: number, _input: DailyReportInput, _attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ revision: number }>> { return unsupported<{ revision: number }>(); }
  async listReportRevisions(_reportId: string): Promise<RepositoryResult<unknown[]>> { return unsupported<unknown[]>(); }

  // ---- Legacy / deprecated write paths ----

  async saveProgressPlan(_keyResultId: string, _points: Array<{ date: string; value: number }>): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async saveMilestones(_projectId: string, _milestones: Array<{ title: string; plannedDate: string; keyResultId?: string }>): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async saveRisk(_input: { projectId: string; title: string; probability: 1 | 2 | 3; impact: 1 | 2 | 3; reason: string; mitigation: string; lastReviewedAt: string; classification: import('../domain/types').Classification }): Promise<RepositoryResult<{ id: string }>> { return unsupported<{ id: string }>(); }
  async saveKrProgress(_input: KrProgressInput): Promise<RepositoryResult<{ snapshotId: string }>> { return unsupported<{ snapshotId: string }>(); }
  async setMyLocale(_locale: 'zh-CN' | 'en'): Promise<RepositoryResult<void>> { return unsupported<void>(); }

  // ---- Attachments (preview) ----

  async beginAttachmentUpload(_input: Record<string, unknown>): Promise<RepositoryResult<import('./types').AttachmentUploadTarget>> { return unsupported<import('./types').AttachmentUploadTarget>(); }
  async finalizeAttachmentUpload(_id: string, _checksum?: string): Promise<RepositoryResult<unknown>> { return unsupported<unknown>(); }
  async replaceAttachment(_id: string, _input: Record<string, unknown>): Promise<RepositoryResult<unknown>> { return unsupported<unknown>(); }
  async removeAttachment(_id: string): Promise<RepositoryResult<void>> { return unsupported<void>(); }
  async createAttachmentDownload(_id: string): Promise<RepositoryResult<{ url: string }>> { return unsupported<{ url: string }>(); }
}
