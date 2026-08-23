import type {
  Classification,
  CompanyObjective,
  DailyReport,
  DocumentRecord,
  KeyResult,
  KrAssignment,
  KrMetricType,
  KrProgressUpdate,
  Milestone,
  Objective,
  OkrPriority,
  ProgressSnapshot,
  Project,
  ProjectStatus,
  ProjectTask,
  ReportStatus,
  ResourceCategory,
  ResourceKind,
  ResourceNotificationStatus,
  ResourceProblemStatus,
  ResourceProblemType,
  ResourceStatus,
  Risk,
  Role,
  User,
  WeeklyReport,
  WorkloadEntry,
} from '../domain/types';

/**
 * The aggregate dataset every business page and dashboard widget consumes.
 * This is the shared production data contract — defined here, not in the demo
 * mocks — so real (Supabase) and demo repositories return the same shape.
 */
export interface DashboardData {
  currentUser: User;
  users: User[];
  dailyReports: DailyReport[];
  weeklyReports?: WeeklyReport[];
  projects: Project[];
  objectives: Objective[];
  keyResults: KeyResult[];
  krAssignments: KrAssignment[];
  krProgressUpdates: KrProgressUpdate[];
  milestones: Milestone[];
  risks: Risk[];
  progressSnapshots: ProgressSnapshot[];
  workloads: WorkloadEntry[];
  attachments: DocumentRecord[];
  companyObjectives: CompanyObjective[];
  projectTasks: ProjectTask[];
}

export type AppMode = 'demo' | 'supabase';
export type RepositoryErrorCode = 'unauthorized' | 'not_found' | 'validation' | 'conflict' | 'duplicate' | 'date_conflict' | 'locked' | 'clearance' | 'cleanup_required' | 'storage' | 'network' | 'unknown';

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: RepositoryErrorCode; message: string } };

export interface SessionLike {
  user: { id: string; email?: string; email_confirmed_at?: string | null };
  access_token?: string;
}

export interface AuthSubscriptionLike {
  unsubscribe(): void;
}

export interface SupabaseClientLike {
  auth: {
    /**
     * Authoritative initialization outcome. Resolves once Supabase has finished
     * processing any auth callback present in the URL (or recovered a stored
     * session). `{ error: null }` means a detected callback succeeded (or no
     * callback was present); a non-null `error` means the callback failed
     * (invalid / expired / reused / forged) while preserving any existing
     * session and emitting no SIGNED_IN. Optional so unrelated client stubs
     * don't have to model it.
     */
    initialize?(): Promise<{ error: { message: string } | null }>;
    getSession(): Promise<{ data: { session: SessionLike | null }; error: { message: string } | null }>;
    onAuthStateChange(callback: (event: string, session: SessionLike | null) => void): {
      data: { subscription: AuthSubscriptionLike };
    };
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { session: SessionLike | null };
      error: { message: string } | null;
    }>;
    signUp(credentials: { email: string; password: string; options?: { data?: Record<string, unknown> } }): Promise<{
      data: { session: SessionLike | null };
      error: { message: string } | null;
    }>;
    updateUser(attributes: { password: string }): Promise<{
      data: { user: SessionLike['user'] | null };
      error: { message: string } | null;
    }>;
    signOut(): Promise<{ error: { message: string } | null }>;
  };
  from(table: string): unknown;
  rpc(functionName: string, args?: Record<string, unknown>): unknown;
  functions?: {
    invoke(name: string, options?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  storage: {
    from(bucket: string): {
      upload(path: string, file: File, options?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
      remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

export interface AttachmentUploadTarget { id: string; path: string; bucket: 'report-attachments' }
export interface ResourceUploadTarget { id: string; path: string; bucket: 'resource-documents' }

export interface DailyReportUploadSession { reportId: string; sessionId: string }

export type DailyReportAttachmentUploadUpdate = {
  state: 'pending' | 'uploading' | 'verifying' | 'uploaded' | 'failed';
  progress: number;
  attachmentId?: string;
  errorCode?: RepositoryErrorCode;
  error?: string;
};

export interface DailyReportAttachmentUploadInput extends ClassifiedAttachmentInput {
  session: DailyReportUploadSession;
  entryPosition: number;
  label: string;
  onChange(update: DailyReportAttachmentUploadUpdate): void;
  signal?: AbortSignal;
}

export interface DailyOkrBlockInput {
  dailyObjective: string;
  linkedKeyResultId: string;
  workDescription: string;
  hours: number;
  result: string;
  evidenceLinks: unknown[];
  attachments?: Array<{
    attachmentId: string;
    displayName: string;
    classification: Classification;
  }>;
}

export interface DailyReportInput {
  reportDate: string;
  status: ReportStatus;
  classification: Classification;
  blocks: DailyOkrBlockInput[];
  evidenceLinks: unknown[];
}

export interface ClassifiedAttachmentInput { file: File; classification: Classification; entryPosition?: number; label?: string }

export interface KrProgressInput {
  keyResultId: string;
  progress: number;
  effectiveDate: string;
  note: string;
}

export interface OwnedRiskInput {
  id?: string;
  projectId: string;
  keyResultId?: string | null;
  objectiveId?: string | null;
  title: string;
  probability: 1 | 2 | 3;
  impact: 1 | 2 | 3;
  reason: string;
  mitigation: string;
  lastReviewedAt: string;
  classification: Classification;
  resolved: boolean;
}

export type AuthProfileState =
  | { kind: 'active'; user: User }
  | { kind: 'pending' }
  | { kind: 'inactive' }
  | { kind: 'error' };

export interface OrganizationUser {
  id: string;
  displayName: string;
  email: string;
  department: string;
  jobTitle: string;
  role: Role | null;
  isActive: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  projectIds: string[];
}

export interface ProjectCreateInput {
  name: string;
  description: string;
  leaderId: string;
  startDate: string;
  dueDate: string;
  classification: Classification;
  status: ProjectStatus;
  memberIds: string[];
}

export interface ProjectUpdateInput {
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  dueDate: string;
  classification: Classification;
  status: ProjectStatus;
}

export interface ProjectMemberInfo {
  id: string;
  name: string;
  role: Role;
  department: string;
  jobTitle: string;
  isActive: boolean;
  onboardingCompleted: boolean;
  isLeader: boolean;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  leaderName: string;
  classification: Classification;
  startDate: string;
  dueDate: string;
  status: ProjectStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMemberInfo[];
}

/** Lightweight project summary for membership editing and project selectors. */
export interface ProjectSummary {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string;
}

export interface ApprovePendingUserInput {
  userId: string;
  role: Role;
  department: string;
  jobTitle: string;
}

export interface Resource {
  id: string;
  name: string;
  category: ResourceCategory;
  resourceKind: ResourceKind;
  description: string;
  ownerId: string;
  ownerName: string;
  location: string;
  purchaseDate: string | null;
  purchaseVendor: string | null;
  purchaseReference: string | null;
  usageNotes: string | null;
  manualUrl: string | null;
  quantity: number | null;
  unit: string | null;
  status: ResourceStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ResourceAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ResourceProblem {
  id: string;
  problemType: ResourceProblemType;
  description: string;
  status: ResourceProblemStatus;
  reporterId: string;
  reporterName: string;
  reportedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  notificationStatus: ResourceNotificationStatus;
  notificationErrorCode: string | null;
}

export interface ResourceDetail extends Resource {
  attachments: ResourceAttachment[];
  problems: ResourceProblem[];
}

export interface CreateResourceInput {
  name: string;
  category: ResourceCategory;
  resourceKind: ResourceKind;
  description: string;
  location: string;
  purchaseDate: string | null;
  purchaseVendor: string;
  purchaseReference: string;
  usageNotes: string;
  manualUrl: string;
  quantity: number | null;
  unit: string;
}

export interface UpdateResourceInput {
  resourceId: string;
  name: string;
  category: ResourceCategory;
  resourceKind: ResourceKind;
  description: string;
  location: string;
  purchaseDate: string | null;
  purchaseVendor: string;
  purchaseReference: string;
  usageNotes: string;
  manualUrl: string;
  quantity: number | null;
  unit: string;
  status: ResourceStatus;
}

export interface ReportResourceProblemInput {
  resourceId: string;
  problemType: ResourceProblemType;
  description: string;
}

export interface ReportResourceProblemResult {
  problemId: string;
  notificationId: string;
}

export interface ResolveResourceProblemInput {
  problemId: string;
  resolutionNote: string;
}

export interface RetryResourceProblemNotificationResult {
  problemId: string;
  notificationId: string;
  status: ResourceNotificationStatus;
  errorCode: string | null;
}

export interface UpdateUserInput {
  userId: string;
  displayName: string;
  email: string;
  department: string;
  jobTitle: string;
  role: Role;
}

export interface ObjectiveCreateInput {
  name: string;
  number?: string;
  leaderId: string;
  quarter: string;
  startDate: string;
  dueDate: string;
  priority: OkrPriority;
  description: string;
  classification: Classification;
}

export interface ObjectiveUpdateInput extends ObjectiveCreateInput {
  objectiveId: string;
}

export interface KeyResultCreateInput {
  objectiveId: string;
  title: string;
  ownerIds: string[];
  dueDate: string;
  metricType: KrMetricType;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  notes?: string;
  confidenceIndex?: number;
  priority?: OkrPriority;
  classification: Classification;
}

export interface KeyResultUpdateInput extends KeyResultCreateInput {
  keyResultId: string;
}

export interface KrProgressUpdateInput {
  keyResultId: string;
  previousProgress: number;
  newProgress: number;
  summary: string;
  blocker?: string;
  reason?: string;
  nextAction?: string;
  evidence?: string;
}

export interface OkrRepository {
  readonly mode: AppMode;
  getCachedDashboardData?(userId: string): DashboardData | undefined;
  getCurrentProfile(): Promise<RepositoryResult<AuthProfileState>>;
  getDashboardData(userId?: string): Promise<RepositoryResult<DashboardData>>;
  listOrganizationUsers(): Promise<RepositoryResult<OrganizationUser[]>>;
  listEligibleKrOwners(objectiveId: string): Promise<RepositoryResult<OrganizationUser[]>>;
  createProject(input: ProjectCreateInput): Promise<RepositoryResult<{ id: string }>>;
  updateProject(input: ProjectUpdateInput): Promise<RepositoryResult<void>>;
  setProjectLeader(projectId: string, leaderId: string): Promise<RepositoryResult<void>>;
  setProjectMembers(projectId: string, memberIds: string[]): Promise<RepositoryResult<void>>;
  listProjects(): Promise<RepositoryResult<ProjectSummary[]>>;
  setUserProjectMemberships(userId: string, projectIds: string[]): Promise<RepositoryResult<void>>;
  setProjectStatus(projectId: string, status: ProjectStatus): Promise<RepositoryResult<void>>;
  archiveProject(projectId: string): Promise<RepositoryResult<void>>;
  restoreProject(projectId: string): Promise<RepositoryResult<void>>;
  getProjectDetail(projectId: string): Promise<RepositoryResult<ProjectDetail>>;
  listResources(): Promise<RepositoryResult<Resource[]>>;
  getResourceDetail(resourceId: string): Promise<RepositoryResult<ResourceDetail>>;
  createResource(input: CreateResourceInput): Promise<RepositoryResult<{ id: string }>>;
  updateResource(input: UpdateResourceInput): Promise<RepositoryResult<void>>;
  archiveResource(resourceId: string): Promise<RepositoryResult<void>>;
  restoreResource(resourceId: string): Promise<RepositoryResult<void>>;
  reportResourceProblem(input: ReportResourceProblemInput): Promise<RepositoryResult<ReportResourceProblemResult>>;
  resolveResourceProblem(input: ResolveResourceProblemInput): Promise<RepositoryResult<void>>;
  retryResourceProblemNotification(problemId: string): Promise<RepositoryResult<RetryResourceProblemNotificationResult>>;
  beginResourceAttachmentUpload(input: Record<string, unknown>): Promise<RepositoryResult<ResourceUploadTarget>>;
  finalizeResourceAttachmentUpload(id: string): Promise<RepositoryResult<unknown>>;
  createResourceAttachmentDownload(id: string): Promise<RepositoryResult<{ url: string }>>;
  uploadResourceAttachment(resourceId: string, file: File): Promise<RepositoryResult<{ id: string }>>;
  approvePendingUser(input: ApprovePendingUserInput): Promise<RepositoryResult<void>>;
  rejectPendingUser(userId: string): Promise<RepositoryResult<void>>;
  createPendingProfile(displayName: string): Promise<RepositoryResult<void>>;
  updateUserProfile(input: UpdateUserInput): Promise<RepositoryResult<void>>;
  setUserActive(userId: string, active: boolean): Promise<RepositoryResult<void>>;
  listDailyReports(): Promise<RepositoryResult<DailyReport[]>>;
  saveDailyReport(input: DailyReportInput, attachments?: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ id: string; revision: number }>>;
  beginDailyReportUploadSession?(input: Pick<DailyReportInput, 'reportDate' | 'status' | 'classification'>): Promise<RepositoryResult<DailyReportUploadSession>>;
  findDailyReportUploadSession?(reportDate: string): Promise<RepositoryResult<DailyReportUploadSession | null>>;
  adoptDailyReportAttachments?(session: DailyReportUploadSession, attachmentIds: string[]): Promise<RepositoryResult<void>>;
  uploadDailyReportAttachment?(input: DailyReportAttachmentUploadInput): Promise<RepositoryResult<{ attachmentId: string }>>;
  abandonDailyReportUploadSession?(sessionId: string): Promise<RepositoryResult<void>>;
  submitDailyReportSession?(input: DailyReportInput, sessionId: string): Promise<RepositoryResult<{ id: string; revision: number }>>;
  confirmDailyReport?(reportId: string, expectedRevision: number): Promise<RepositoryResult<void>>;
  createDailyReport(input: DailyReportInput): Promise<RepositoryResult<{ id: string; revision: number }>>;
  createDailyReportWithAttachments(input: DailyReportInput, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ id: string; revision: number }>>;
  updateDailyReport(reportId: string, expectedRevision: number, input: DailyReportInput): Promise<RepositoryResult<{ revision: number }>>;
  updateDailyReportWithAttachments(reportId: string, expectedRevision: number, input: DailyReportInput, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ revision: number }>>;
  listReportRevisions(reportId: string): Promise<RepositoryResult<unknown[]>>;
  saveProgressPlan(keyResultId: string, points: Array<{ date: string; value: number }>): Promise<RepositoryResult<void>>;
  saveMilestones(projectId: string, milestones: Array<{ title: string; plannedDate: string; keyResultId?: string }>): Promise<RepositoryResult<void>>;
  saveRisk(input: { projectId: string; title: string; probability: 1 | 2 | 3; impact: 1 | 2 | 3; reason: string; mitigation: string; lastReviewedAt: string; classification: Classification }): Promise<RepositoryResult<{ id: string }>>;
  saveKrProgress(input: KrProgressInput): Promise<RepositoryResult<{ snapshotId: string }>>;
  saveOwnedRisk(input: OwnedRiskInput): Promise<RepositoryResult<{ id: string }>>;
  createObjective(input: ObjectiveCreateInput): Promise<RepositoryResult<{ id: string }>>;
  updateObjective(input: ObjectiveUpdateInput): Promise<RepositoryResult<void>>;
  archiveObjective(objectiveId: string): Promise<RepositoryResult<void>>;
  restoreObjective(objectiveId: string): Promise<RepositoryResult<void>>;
  createKeyResult(input: KeyResultCreateInput): Promise<RepositoryResult<{ id: string }>>;
  updateKeyResult(input: KeyResultUpdateInput): Promise<RepositoryResult<void>>;
  saveKrProgressUpdate(input: KrProgressUpdateInput): Promise<RepositoryResult<{ id: string }>>;
  setMyLocale(locale: 'zh-CN' | 'en'): Promise<RepositoryResult<void>>;
  beginAttachmentUpload(input: Record<string, unknown>): Promise<RepositoryResult<AttachmentUploadTarget>>;
  finalizeAttachmentUpload(id: string, checksum?: string): Promise<RepositoryResult<unknown>>;
  replaceAttachment(id: string, input: Record<string, unknown>): Promise<RepositoryResult<unknown>>;
  removeAttachment(id: string, options?: { preserveRevisionHistory?: boolean }): Promise<RepositoryResult<void>>;
  createAttachmentDownload(id: string): Promise<RepositoryResult<{ url: string }>>;
}
