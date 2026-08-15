import type { DashboardData } from '../mocks/repository';
import type { Classification, DailyReport, ReportStatus, User } from '../domain/types';

export type AppMode = 'demo' | 'supabase';
export type RepositoryErrorCode = 'unauthorized' | 'validation' | 'conflict' | 'network' | 'unknown';

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: RepositoryErrorCode; message: string } };

export interface SessionLike {
  user: { id: string };
}

export interface AuthSubscriptionLike {
  unsubscribe(): void;
}

export interface SupabaseClientLike {
  auth: {
    getSession(): Promise<{ data: { session: SessionLike | null }; error: { message: string } | null }>;
    onAuthStateChange(callback: (event: string, session: SessionLike | null) => void): {
      data: { subscription: AuthSubscriptionLike };
    };
    signOut(): Promise<{ error: { message: string } | null }>;
  };
  from(table: string): unknown;
  rpc(functionName: string, args?: Record<string, unknown>): unknown;
  storage: {
    from(bucket: string): {
      upload(path: string, file: File, options?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
      remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

export interface AttachmentUploadTarget { id: string; path: string; bucket: 'report-attachments' }

export interface DailyReportInput {
  projectId: string;
  objectiveId: string;
  reportDate: string;
  status: ReportStatus;
  classification: Classification;
  totalHours: number;
  dailyObjective: string;
  objectiveProgress: number;
  keyResults: unknown[];
  evidenceLinks: unknown[];
}

export interface ClassifiedAttachmentInput { file: File; classification: Classification }

export interface OkrRepository {
  readonly mode: AppMode;
  getCurrentProfile(): Promise<RepositoryResult<User | null>>;
  getDashboardData(userId?: string): Promise<RepositoryResult<DashboardData>>;
  listDailyReports(): Promise<RepositoryResult<DailyReport[]>>;
  createDailyReport(input: DailyReportInput): Promise<RepositoryResult<{ id: string; revision: number }>>;
  createDailyReportWithAttachments(input: DailyReportInput, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ id: string; revision: number }>>;
  updateDailyReport(reportId: string, expectedRevision: number, input: DailyReportInput): Promise<RepositoryResult<{ revision: number }>>;
  updateDailyReportWithAttachments(reportId: string, expectedRevision: number, input: DailyReportInput, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ revision: number }>>;
  listReportRevisions(reportId: string): Promise<RepositoryResult<unknown[]>>;
  saveProgressPlan(keyResultId: string, points: Array<{ date: string; value: number }>): Promise<RepositoryResult<void>>;
  saveMilestones(projectId: string, milestones: Array<{ title: string; plannedDate: string; keyResultId?: string }>): Promise<RepositoryResult<void>>;
  saveRisk(input: { projectId: string; title: string; probability: 1 | 2 | 3; impact: 1 | 2 | 3; reason: string; mitigation: string; lastReviewedAt: string; classification: Classification }): Promise<RepositoryResult<{ id: string }>>;
  beginAttachmentUpload(input: Record<string, unknown>): Promise<RepositoryResult<AttachmentUploadTarget>>;
  finalizeAttachmentUpload(id: string, checksum?: string): Promise<RepositoryResult<unknown>>;
  replaceAttachment(id: string, input: Record<string, unknown>): Promise<RepositoryResult<unknown>>;
  removeAttachment(id: string): Promise<RepositoryResult<void>>;
  createAttachmentDownload(id: string): Promise<RepositoryResult<{ url: string }>>;
}
