import type { DailyKeyResultDraft } from './dailyEntry';

export type Role = 'administrator' | 'management' | 'project_leader' | 'employee' | 'hr';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ReportStatus = 'draft' | 'submitted' | 'returned' | 'confirmed';
export type ProgressStatus = 'on_track' | 'at_risk' | 'off_track' | 'complete';

export interface User {
  id: string;
  name: string;
  role: Role;
  title: string;
  department: string;
  projectIds: string[];
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
  classification: Classification;
  hours: number;
  evidence: string[];
  evidenceClassification: Classification;
  attachmentIds: string[];
  status: ReportStatus;
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
  title: string;
  description: string;
  ownerId: string;
  probability: 1 | 2 | 3;
  impact: 1 | 2 | 3;
  mitigation: string;
  status: ProgressStatus;
  classification: Classification;
  identifiedAt: string;
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
  actual: number;
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
