import type { DailyEvidenceDraft, DailyKeyResultDraft } from './dailyEntry';

export type Role = 'administrator' | 'management' | 'project_leader' | 'employee' | 'hr';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ReportStatus = 'draft' | 'submitted' | 'returned' | 'confirmed';
export type ProgressStatus = 'on_track' | 'at_risk' | 'off_track' | 'complete';
/**
 * Project-management lifecycle for the backing `Project` record. Because an
 * Objective is a Project, `Project.lifecycle` and `Objective.okrStatus` describe
 * the same entity's lifecycle from two angles; `status`/`ProgressStatus` is the
 * single execution-health derivation both share.
 */
export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'archived';

/**
 * Lifecycle/planning status for an Objective or Key Result, kept deliberately
 * small and manually controllable (with a deterministic default). Distinct from
 * `ProgressStatus`, which is the risk/execution-health derivation used by the
 * risk matrix and dashboard.
 */
export type OkrStatus = 'not_started' | 'on_track' | 'at_risk' | 'delayed' | 'completed';
export type OkrPriority = 'low' | 'medium' | 'high';
export type KrMetricType = 'numeric' | 'percentage' | 'milestone';
export type KrAssignmentRole = 'owner' | 'collaborator';

export type ResourceCategory = 'optics' | 'chemicals' | 'vacuum' | 'tools' | 'electronics' | 'mechanical' | 'consumables' | 'safety' | 'other';
export type ResourceKind = 'durable' | 'consumable';
export type ResourceStatus = 'available' | 'in_use' | 'maintenance' | 'damaged' | 'missing' | 'out_of_stock' | 'archived';
export type ResourceProblemType = 'location_incorrect' | 'missing' | 'damaged' | 'malfunction' | 'quantity_incorrect' | 'manual_issue' | 'other';
export type ResourceProblemStatus = 'open' | 'resolved';
export type ResourceNotificationStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface User {
  id: string;
  name: string;
  role: Role;
  title: string;
  department: string;
  projectIds: string[];
  preferredLocale?: 'zh-CN' | 'en';
  organization?: string;
}

export interface OrganizationRelation {
  managerId: string;
  subordinateId: string;
  depth: number;
}

export interface ProjectMembership {
  id: string;
  projectId: string;
  userId: string;
  membershipRole: 'leader' | 'member';
}

export interface CollaborationRelation {
  viewerId: string;
  subjectUserId: string;
  projectId?: string;
  sharedResourceIds: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  memberIds: string[];
  classification: Classification;
  startDate: string;
  dueDate: string;
  status: ProgressStatus;
  lifecycle?: ProjectStatus;
  companyObjectiveId?: string;
}

export interface CompanyObjective {
  id: string;
  level: 'company';
  title: string;
  progress: number;
  status: ProgressStatus;
  classification: Classification;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  keyResultId: string;
  title: string;
  ownerId: string;
  startDate: string;
  dueDate: string;
  progress: number;
  classification: Classification;
}

export interface Objective {
  id: string;
  projectId: string;
  title: string;
  description: string;
  ownerId: string;
  progress: number;
  status: ProgressStatus;
  startDate: string;
  dueDate: string;
  classification: Classification;
  /** Stable project/objective number, e.g. `O-2026-Q3-001`. */
  number?: string;
  /** OKR cycle/quarter, e.g. `2026-Q3`. */
  quarter?: string;
  priority?: OkrPriority;
  okrStatus?: OkrStatus;
  archivedAt?: string | null;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  ownerId: string;
  progress: number;
  status: ProgressStatus;
  startDate: string;
  dueDate: string;
  classification: Classification;
  metricType?: KrMetricType;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  notes?: string;
  confidenceIndex?: number;
  priority?: OkrPriority;
  okrStatus?: OkrStatus;
}

export interface KrAssignment {
  id: string;
  krId: string;
  userId: string;
  assignmentRole: KrAssignmentRole;
}

export interface KrProgressUpdate {
  id: string;
  krId: string;
  authorId: string;
  previousProgress: number;
  newProgress: number;
  summary: string;
  blocker?: string;
  reason?: string;
  nextAction?: string;
  evidence?: string;
  createdAt: string;
}

export interface DailyOkrBlock {
  id: string;
  dailyObjective: string;
  /** The linked quarterly Key Result (an assigned KR the author owns). */
  keyResultId: string;
  hours: number;
  result: string;
  keyResults: Array<{ id: string; title: string }>;
}

export interface DailyReport {
  id: string;
  authorId: string;
  projectId: string;
  objectiveId: string;
  keyResultIds: string[];
  date: string;
  content: string;
  dailyObjective?: string;
  objectiveProgress?: number;
  dailyKeyResults?: DailyKeyResultDraft[];
  blocks?: DailyOkrBlock[];
  classification: Classification;
  hours: number;
  evidence: string[];
  evidenceItems?: DailyEvidenceDraft[];
  evidenceClassification: Classification;
  attachmentIds: string[];
  status: ReportStatus;
  currentRevision?: number;
  updatedAt?: string;
}

export interface WeeklyReport {
  id: string;
  authorId: string;
  projectId: string;
  objectiveId: string;
  keyResultIds: string[];
  weekEnding: string;
  summary: string;
  classification: Classification;
  nextWeekPlan: string;
  hours: number;
  attachmentIds: string[];
  status: ReportStatus;
}

export interface DocumentRecord {
  id: string;
  title: string;
  classification: Classification;
  ownerId: string;
  projectId?: string;
  relatedResourceId?: string;
  relatedResourceType?: 'daily_report' | 'weekly_report' | 'objective';
  kind: 'attachment' | 'document';
  uploadedAt: string;
}

export interface Risk {
  id: string;
  projectId: string;
  keyResultId?: string;
  objectiveId?: string;
  title: string;
  description: string;
  ownerId: string;
  probability: 1 | 2 | 3;
  impact: 1 | 2 | 3;
  mitigation: string;
  reason?: string;
  lastReviewedAt?: string;
  status: ProgressStatus;
  classification: Classification;
  identifiedAt: string;
  resolved: boolean;
}

export interface Milestone {
  id: string;
  projectId: string;
  objectiveId: string;
  title: string;
  dueDate: string;
  status: ProgressStatus;
  dependencyIds: string[];
  classification: Classification;
}

export interface ProgressSnapshot {
  id: string;
  projectId: string;
  keyResultId: string;
  weekOf: string;
  actual?: number;
  planned: number;
}

export interface WorkloadEntry {
  id: string;
  userId: string;
  projectId: string;
  sourceReportId: string;
  periodStart: string;
  periodEnd: string;
  plannedHours: number;
  loggedHours: number;
  capacityHours: number;
  hrVisibility: 'hours_only';
}
