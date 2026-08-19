import type { DashboardData } from '../data/types';
import type { DailyReport, ProjectStatus, Role, User } from '../domain/types';
import type { ApprovePendingUserInput, AttachmentUploadTarget, AuthProfileState, ClassifiedAttachmentInput, CreateResourceInput, DailyReportInput, KeyResultCreateInput, KeyResultUpdateInput, KrProgressInput, KrProgressUpdateInput, ObjectiveCreateInput, ObjectiveUpdateInput, OkrRepository, OrganizationUser, OwnedRiskInput, ProjectCreateInput, ProjectDetail, ProjectUpdateInput, ReportResourceProblemInput, ReportResourceProblemResult, RepositoryErrorCode, RepositoryResult, ResolveResourceProblemInput, Resource, ResourceDetail, ResourceUploadTarget, RetryResourceProblemNotificationResult, SupabaseClientLike, UpdateUserInput, UpdateResourceInput } from './types';
import { sanitizeFilename, validateAttachment } from '../services/attachmentService';

interface QueryResponse<T> { data: T | null; error: { code?: string; message: string } | null }
interface ProfileQuery {
  select(columns: string): ProfileQuery;
  eq(column: string, value: string): ProfileQuery;
  maybeSingle(): Promise<QueryResponse<Record<string, unknown>>>;
}

interface TableQuery {
  select(columns: string): Promise<QueryResponse<Record<string, unknown>[]>>;
}

function failure<T>(error: { code?: string; message: string } | null): RepositoryResult<T> {
  const source = error?.code ?? '';
  const code: RepositoryErrorCode = source === '42501' || source === 'PGRST301'
    ? 'unauthorized'
    : source === '40001'
      ? 'conflict'
      : source === '23505'
        ? 'duplicate'
        : source === 'DTC01'
          ? 'date_conflict'
          : source.startsWith('22') || source === '23514' || source === '23503'
            ? 'validation'
            : error
              ? 'network'
              : 'unknown';
  return { ok: false, error: { code, message: code === 'unauthorized' ? '无权访问请求的资源' : '请求未完成，请稍后重试' } };
}

function notFound<T>(): RepositoryResult<T> {
  return { ok: false, error: { code: 'not_found', message: '请求的资源不存在' } };
}

function mapProfile(row: Record<string, unknown>): User | null {
  const roleRow = Array.isArray(row.user_roles) ? row.user_roles[0] as Record<string, unknown> | undefined : undefined;
  const role = roleRow?.role;
  const roles: readonly Role[] = ['administrator', 'management', 'project_leader', 'employee', 'hr'];
  const organization = row.organizations as Record<string, unknown> | undefined;
  if (typeof row.id !== 'string' || typeof row.display_name !== 'string' || !roles.includes(role as Role)) return null;
  return {
    id: row.id,
    name: row.display_name,
    role: role as Role,
    title: typeof row.job_title === 'string' ? row.job_title : '',
    department: typeof row.department === 'string' ? row.department : '',
    projectIds: Array.isArray(row.project_members) ? row.project_members.map((item) => String((item as Record<string, unknown>).project_id)) : [],
    preferredLocale: row.preferred_locale === 'en' ? 'en' : 'zh-CN',
    organization: typeof organization?.name === 'string' ? organization.name : undefined,
  };
}

function mapOrganizationUser(row: Record<string, unknown>): OrganizationUser | null {
  const roles: readonly Role[] = ['administrator', 'management', 'project_leader', 'employee', 'hr'];
  const roleRow = Array.isArray(row.user_roles) ? row.user_roles[0] as Record<string, unknown> | undefined : undefined;
  const role = roleRow?.role;
  if (typeof row.id !== 'string' || typeof row.display_name !== 'string') return null;
  const approvalStatus: OrganizationUser['approvalStatus'] =
    row.approval_status === 'pending' ? 'pending'
      : row.approval_status === 'rejected' ? 'rejected'
        : 'approved';
  return {
    id: row.id,
    displayName: row.display_name,
    email: typeof row.email === 'string' ? row.email : '',
    department: typeof row.department === 'string' ? row.department : '',
    jobTitle: typeof row.job_title === 'string' ? row.job_title : '',
    role: roles.includes(role as Role) ? role as Role : null,
    isActive: row.is_active === true,
    approvalStatus,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    projectIds: Array.isArray(row.project_members) ? row.project_members.map((item) => String((item as Record<string, unknown>).project_id)) : [],
  };
}

function numberValue(value: unknown): number { return typeof value === 'number' ? value : Number(value) || 0; }

function mapResource(row: Record<string, unknown>): Resource | null {
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.owner_id !== 'string') return null;
  const owner = row.profiles as Record<string, unknown> | undefined;
  return {
    id: row.id,
    name: row.name,
    category: row.category as Resource['category'],
    resourceKind: row.resource_kind as Resource['resourceKind'],
    description: typeof row.description === 'string' ? row.description : '',
    ownerId: row.owner_id,
    ownerName: typeof owner?.display_name === 'string' ? owner.display_name : '',
    location: typeof row.location === 'string' ? row.location : '',
    purchaseDate: typeof row.purchase_date === 'string' ? row.purchase_date.slice(0, 10) : null,
    purchaseVendor: typeof row.purchase_vendor === 'string' ? row.purchase_vendor : null,
    purchaseReference: typeof row.purchase_reference === 'string' ? row.purchase_reference : null,
    usageNotes: typeof row.usage_notes === 'string' ? row.usage_notes : null,
    manualUrl: typeof row.manual_url === 'string' ? row.manual_url : null,
    quantity: row.quantity === null || row.quantity === undefined ? null : numberValue(row.quantity),
    unit: typeof row.unit === 'string' ? row.unit : null,
    status: row.status as Resource['status'],
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
    archivedAt: typeof row.archived_at === 'string' ? row.archived_at : null,
  };
}
function dateValue(value: unknown): string { return typeof value === 'string' ? value.slice(0, 10) : ''; }
function statusForProgress(progress: number): 'on_track' | 'complete' { return progress >= 100 ? 'complete' : 'on_track'; }
function riskStatus(probability: number, impact: number, resolved: boolean): 'on_track' | 'at_risk' | 'off_track' {
  if (resolved) return 'on_track';
  const score = probability * impact;
  return score === 9 ? 'off_track' : score >= 6 ? 'at_risk' : 'on_track';
}

export class SupabaseOkrRepository implements OkrRepository {
  readonly mode = 'supabase' as const;
  constructor(readonly client: SupabaseClientLike) {}

  async getCurrentProfile(): Promise<RepositoryResult<AuthProfileState>> {
    const session = await this.client.auth.getSession();
    if (session.error) return failure(session.error);
    if (!session.data.session) return { ok: true, data: { kind: 'error' } };
    let state = await this.callRpc<{ state: string }>('get_my_profile_state', {});
    if (!state.ok) return state;
    let resolved = state.data.state;

    if (resolved === 'missing') {
      // Recoverable partial signup: the auth account exists but no application
      // profile was created (e.g. the signup profile RPC failed transiently).
      // Idempotently create the caller's own pending profile — organization,
      // email, and display name are all derived server-side — then re-resolve.
      const created = await this.createPendingProfile('');
      if (!created.ok) return { ok: false, error: created.error };
      state = await this.callRpc<{ state: string }>('get_my_profile_state', {});
      if (!state.ok) return state;
      resolved = state.data.state;
    }

    if (resolved === 'error') return { ok: true, data: { kind: 'error' } };
    if (resolved === 'pending') return { ok: true, data: { kind: 'pending' } };
    if (resolved === 'inactive' || resolved === 'rejected') return { ok: true, data: { kind: 'inactive' } };
    const query = this.client.from('profiles') as ProfileQuery;
    const { data, error } = await query
      .select('id,display_name,preferred_locale,organizations!profiles_organization_id_fkey(name),user_roles!user_roles_profile_id_fkey(role),project_members!project_members_profile_id_fkey(project_id)')
      .eq('id', session.data.session.user.id)
      .maybeSingle();
    if (error) return failure(error);
    const user = data ? mapProfile(data) : null;
    return { ok: true, data: user ? { kind: 'active', user } : { kind: 'error' } };
  }

  private async selectRows(table: string, columns: string): Promise<RepositoryResult<Record<string, unknown>[]>> {
    const { data, error } = await (this.client.from(table) as TableQuery).select(columns);
    return error ? failure(error) : { ok: true, data: data ?? [] };
  }

  async getDashboardData(_userId?: string): Promise<RepositoryResult<DashboardData>> {
    const session = await this.client.auth.getSession();
    if (session.error) return failure(session.error);
    if (!session.data.session) return failure({ code: '42501', message: 'No active session' });

    const results = await Promise.all([
      this.selectRows('profiles', 'id,display_name,department,job_title,preferred_locale,organizations!profiles_organization_id_fkey(name),user_roles!user_roles_profile_id_fkey(role),project_members!project_members_profile_id_fkey(project_id)'),
      this.selectRows('projects', 'id,name,description,leader_id,classification,start_date,due_date,status,project_members!project_members_project_id_fkey(profile_id)'),
      this.selectRows('objectives', 'id,project_id,owner_id,title,description,progress,classification,start_date,due_date,number,quarter,priority,okr_status,archived_at'),
      this.selectRows('key_results', 'id,objective_id,project_id,owner_id,title,progress,classification,start_date,due_date,metric_type,current_value,target_value,unit,notes,confidence_index,priority,okr_status'),
      this.selectRows('progress_baselines', 'id,key_result_id,planned_for,planned_value'),
      this.selectRows('milestones', 'id,project_id,key_result_id,title,planned_date,is_complete'),
      this.selectRows('risks', 'id,project_id,key_result_id,objective_id,owner_id,title,reason,mitigation,probability,impact,classification,last_reviewed_at,resolved_at'),
      this.selectRows('progress_snapshots', 'id,key_result_id,progress,effective_date'),
      this.selectRows('kr_assignments', 'id,kr_id,profile_id,assignment_role'),
      this.selectRows('kr_progress_updates', 'id,kr_id,author_id,previous_progress,new_progress,summary,blocker,reason,next_action,evidence,created_at'),
    ]);
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) return failed;
    const [profileResult, projectResult, objectiveResult, keyResultResult, baselineResult, milestoneResult, riskResult, snapshotResult, krAssignmentResult, krProgressUpdateResult] = results as Array<{ ok: true; data: Record<string, unknown>[] }>;

    const users = profileResult.data.map(mapProfile).filter((user): user is User => user !== null);
    const currentUser = users.find((user) => user.id === session.data.session!.user.id);
    if (!currentUser) return failure({ code: '42501', message: 'Current profile is unavailable' });

    const objectives = objectiveResult.data
      .filter((row) => typeof row.project_id === 'string')
      .map((row) => {
        const progress = numberValue(row.progress);
        return {
          id: String(row.id), projectId: String(row.project_id), title: String(row.title), description: String(row.description ?? ''), ownerId: String(row.owner_id), progress, status: statusForProgress(progress), startDate: dateValue(row.start_date), dueDate: dateValue(row.due_date),
          classification: row.classification as import('../domain/types').Classification,
          number: typeof row.number === 'string' ? row.number : undefined,
          quarter: typeof row.quarter === 'string' ? row.quarter : undefined,
          priority: row.priority as import('../domain/types').OkrPriority,
          okrStatus: row.okr_status as import('../domain/types').OkrStatus,
          archivedAt: typeof row.archived_at === 'string' ? row.archived_at : null,
        };
      });
    const keyResults = keyResultResult.data.map((row) => {
      const progress = numberValue(row.progress);
      return {
        id: String(row.id), objectiveId: String(row.objective_id), title: String(row.title), ownerId: String(row.owner_id), progress, status: statusForProgress(progress), startDate: dateValue(row.start_date), dueDate: dateValue(row.due_date),
        classification: row.classification as import('../domain/types').Classification,
        metricType: row.metric_type as import('../domain/types').KrMetricType,
        currentValue: row.current_value === null || row.current_value === undefined ? undefined : numberValue(row.current_value),
        targetValue: row.target_value === null || row.target_value === undefined ? undefined : numberValue(row.target_value),
        unit: typeof row.unit === 'string' ? row.unit : undefined,
        notes: typeof row.notes === 'string' ? row.notes : undefined,
        confidenceIndex: row.confidence_index === null || row.confidence_index === undefined ? undefined : numberValue(row.confidence_index),
        priority: row.priority as import('../domain/types').OkrPriority,
        okrStatus: row.okr_status as import('../domain/types').OkrStatus,
      };
    });
    const keyResultsById = new Map(keyResults.map((keyResult) => [keyResult.id, keyResult]));
    const projectIdByObjectiveId = new Map(objectives.map((objective) => [objective.id, objective.projectId]));
    const baselineByKeyAndDate = new Map(baselineResult.data.map((row) => [`${String(row.key_result_id)}:${dateValue(row.planned_for)}`, numberValue(row.planned_value)]));

    const projects = projectResult.data.map((row) => {
      // Objective = Project: derive execution-health from the objective (single
      // source of truth) rather than hard-coding it. `lifecycle` still carries
      // the project-management lifecycle from the DB.
      const objective = objectives.find((candidate) => candidate.projectId === String(row.id));
      return {
        id: String(row.id), name: String(row.name), description: String(row.description ?? ''), leaderId: String(row.leader_id),
        memberIds: Array.isArray(row.project_members) ? row.project_members.map((member) => String((member as Record<string, unknown>).profile_id)) : [],
        classification: row.classification as import('../domain/types').Classification, startDate: dateValue(row.start_date), dueDate: dateValue(row.due_date),
        status: objective?.status ?? 'on_track',
        lifecycle: (row.status as ProjectStatus) ?? 'active',
      };
    });
    const milestones = milestoneResult.data.flatMap((row) => {
      const keyResult = typeof row.key_result_id === 'string' ? keyResultsById.get(row.key_result_id) : undefined;
      if (!keyResult) return [];
      return [{ id: String(row.id), projectId: String(row.project_id), objectiveId: keyResult.objectiveId, title: String(row.title), dueDate: dateValue(row.planned_date), status: row.is_complete === true ? 'complete' as const : 'on_track' as const, dependencyIds: [keyResult.id], classification: keyResult.classification }];
    });
    const risks = riskResult.data.map((row) => {
      const probability = numberValue(row.probability) as 1 | 2 | 3;
      const impact = numberValue(row.impact) as 1 | 2 | 3;
      const resolved = row.resolved_at !== null && row.resolved_at !== undefined;
      return {
        id: String(row.id), projectId: String(row.project_id), title: String(row.title), description: String(row.reason), ownerId: String(row.owner_id), probability, impact,
        mitigation: String(row.mitigation), reason: String(row.reason), lastReviewedAt: dateValue(row.last_reviewed_at), status: riskStatus(probability, impact, resolved),
        classification: row.classification as import('../domain/types').Classification, identifiedAt: dateValue(row.last_reviewed_at),
        keyResultId: typeof row.key_result_id === 'string' ? row.key_result_id : undefined, objectiveId: typeof row.objective_id === 'string' ? row.objective_id : undefined, resolved,
      };
    });
    const projectIdForKeyResult = (keyResultId: string) => projectIdByObjectiveId.get(keyResultsById.get(keyResultId)?.objectiveId ?? '') ?? '';
    const actualSnapshotKeys = new Set(snapshotResult.data.map((row) => `${String(row.key_result_id)}:${dateValue(row.effective_date)}`));
    const progressSnapshots: DashboardData['progressSnapshots'] = [
      ...snapshotResult.data.map((row) => {
        const keyResultId = String(row.key_result_id);
        const weekOf = dateValue(row.effective_date);
        return { id: String(row.id), projectId: projectIdForKeyResult(keyResultId), keyResultId, weekOf, actual: numberValue(row.progress), planned: baselineByKeyAndDate.get(`${keyResultId}:${weekOf}`) ?? 0 };
      }),
      ...baselineResult.data
        .filter((row) => !actualSnapshotKeys.has(`${String(row.key_result_id)}:${dateValue(row.planned_for)}`))
        .map((row) => {
          const keyResultId = String(row.key_result_id);
          return { id: String(row.id), projectId: projectIdForKeyResult(keyResultId), keyResultId, weekOf: dateValue(row.planned_for), actual: undefined, planned: numberValue(row.planned_value) };
        }),
    ];
    const companyObjectives = objectiveResult.data
      .filter((row) => row.project_id === null)
      .map((row) => { const progress = numberValue(row.progress); return { id: String(row.id), level: 'company' as const, title: String(row.title), progress, status: statusForProgress(progress), classification: row.classification as import('../domain/types').Classification }; });

    const krAssignments = krAssignmentResult.data.map((row) => ({
      id: String(row.id),
      krId: String(row.kr_id),
      userId: String(row.profile_id),
      assignmentRole: row.assignment_role as import('../domain/types').KrAssignmentRole,
    }));
    const krProgressUpdates = krProgressUpdateResult.data.map((row) => ({
      id: String(row.id),
      krId: String(row.kr_id),
      authorId: String(row.author_id),
      previousProgress: numberValue(row.previous_progress),
      newProgress: numberValue(row.new_progress),
      summary: String(row.summary ?? ''),
      blocker: typeof row.blocker === 'string' ? row.blocker : undefined,
      reason: typeof row.reason === 'string' ? row.reason : undefined,
      nextAction: typeof row.next_action === 'string' ? row.next_action : undefined,
      evidence: typeof row.evidence === 'string' ? row.evidence : undefined,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    }));

    return { ok: true, data: { currentUser, users, dailyReports: [], projects, objectives, keyResults, krAssignments, krProgressUpdates, milestones, risks, progressSnapshots, workloads: [], attachments: [], companyObjectives, projectTasks: [] } };
  }
  async listDailyReports(): Promise<RepositoryResult<DailyReport[]>> { return failure(null); }

  private async callRpc<T>(name: string, args: Record<string, unknown>): Promise<RepositoryResult<T>> {
    const { data, error } = await (this.client.rpc(name, args) as Promise<QueryResponse<T>>);
    if (error) return failure(error);
    return { ok: true, data: data as T };
  }

  async createDailyReport(input: DailyReportInput): Promise<RepositoryResult<{ id: string; revision: number }>> {
    const result = await this.callRpc<string>('create_daily_report', {
      p_project_id: input.projectId,
      p_objective_id: input.objectiveId,
      p_report_date: input.reportDate,
      p_status: input.status,
      p_classification: input.classification,
      p_total_hours: input.totalHours,
      p_daily_objective: input.dailyObjective,
      p_objective_progress: input.objectiveProgress,
      p_krs: input.keyResults,
      p_evidence_links: input.evidenceLinks,
    });
    return result.ok ? { ok: true, data: { id: result.data, revision: 1 } } : result;
  }

  async updateDailyReport(reportId: string, expectedRevision: number, input: DailyReportInput): Promise<RepositoryResult<{ revision: number }>> {
    const result = await this.callRpc<number>('update_daily_report_with_attachments', {
      p_report_id: reportId,
      p_expected_revision: expectedRevision,
      p_status: input.status,
      p_classification: input.classification,
      p_total_hours: input.totalHours,
      p_daily_objective: input.dailyObjective,
      p_objective_progress: input.objectiveProgress,
      p_krs: input.keyResults,
      p_evidence_links: input.evidenceLinks,
    });
    return result.ok ? { ok: true, data: { revision: result.data } } : result;
  }

  private async uploadAll(reportId: string, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<void>> {
    for (const attachment of attachments) {
      const invalid = validateAttachment(attachment.file);
      if (invalid) return { ok: false, error: { code: 'validation', message: invalid.message } };
      const pending = await this.beginAttachmentUpload({ p_report_id: reportId, p_original_name: sanitizeFilename(attachment.file.name), p_mime_type: attachment.file.type, p_byte_size: attachment.file.size, p_classification: attachment.classification });
      if (!pending.ok) return pending;
      const uploaded = await this.client.storage.from(pending.data.bucket).upload(pending.data.path, attachment.file, { contentType: attachment.file.type, upsert: false });
      if (uploaded.error) { await this.removeAttachment(pending.data.id); return failure(uploaded.error); }
      const finalized = await this.finalizeAttachmentUpload(pending.data.id);
      if (!finalized.ok) return finalized as RepositoryResult<void>;
    }
    return { ok: true, data: undefined };
  }

  async createDailyReportWithAttachments(input: DailyReportInput, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ id: string; revision: number }>> {
    const shell = await this.callRpc<string>('begin_daily_report_with_attachments', { p_project_id: input.projectId, p_objective_id: input.objectiveId, p_report_date: input.reportDate, p_status: input.status, p_classification: input.classification, p_total_hours: input.totalHours });
    if (!shell.ok) return shell;
    const uploaded = await this.uploadAll(shell.data, attachments);
    if (!uploaded.ok) return uploaded;
    const revision = await this.updateDailyReport(shell.data, 0, input);
    return revision.ok ? { ok: true, data: { id: shell.data, revision: revision.data.revision } } : revision;
  }

  async updateDailyReportWithAttachments(reportId: string, expectedRevision: number, input: DailyReportInput, attachments: ClassifiedAttachmentInput[]) {
    const uploaded = await this.uploadAll(reportId, attachments);
    return uploaded.ok ? this.updateDailyReport(reportId, expectedRevision, input) : uploaded;
  }

  async listReportRevisions(reportId: string): Promise<RepositoryResult<unknown[]>> {
    const result = await this.callRpc<Array<{ revision: number; created_at: string; editor_name: string }>>('list_report_revisions', { p_report_id: reportId });
    return result.ok ? { ok: true, data: result.data.map((item) => ({ revision: item.revision, createdAt: item.created_at, editorName: item.editor_name })) } : result;
  }
  async saveProgressPlan(keyResultId: string, points: Array<{ date: string; value: number }>): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('save_progress_plan', { p_key_result_id: keyResultId, p_points: points });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async saveMilestones(projectId: string, milestones: Array<{ title: string; plannedDate: string; keyResultId?: string }>): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('save_milestones', { p_project_id: projectId, p_milestones: milestones });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async saveRisk(input: { projectId: string; title: string; probability: 1 | 2 | 3; impact: 1 | 2 | 3; reason: string; mitigation: string; lastReviewedAt: string; classification: import('../domain/types').Classification }): Promise<RepositoryResult<{ id: string }>> {
    const result = await this.callRpc<string>('save_risk', {
      p_project_id: input.projectId, p_title: input.title, p_probability: input.probability,
      p_impact: input.impact, p_reason: input.reason, p_mitigation: input.mitigation,
      p_last_reviewed_at: input.lastReviewedAt, p_classification: input.classification,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }
  async saveKrProgress(input: KrProgressInput): Promise<RepositoryResult<{ snapshotId: string }>> {
    const result = await this.callRpc<string>('save_kr_progress', { p_key_result_id: input.keyResultId, p_progress: input.progress, p_effective_date: input.effectiveDate, p_note: input.note });
    return result.ok ? { ok: true, data: { snapshotId: result.data } } : result;
  }
  async saveOwnedRisk(input: OwnedRiskInput): Promise<RepositoryResult<{ id: string }>> {
    const result = await this.callRpc<string>('save_owned_risk', {
      p_risk_id: input.id ?? null, p_project_id: input.projectId, p_key_result_id: input.keyResultId ?? null, p_objective_id: input.objectiveId ?? null,
      p_title: input.title, p_probability: input.probability, p_impact: input.impact, p_reason: input.reason, p_mitigation: input.mitigation,
      p_last_reviewed_at: input.lastReviewedAt, p_classification: input.classification, p_resolved: input.resolved,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }
  async createObjective(input: ObjectiveCreateInput): Promise<RepositoryResult<{ id: string }>> {
    const result = await this.callRpc<string>('create_objective', {
      p_name: input.name,
      p_number: input.number ?? null,
      p_leader_id: input.leaderId,
      p_quarter: input.quarter,
      p_start_date: input.startDate,
      p_due_date: input.dueDate,
      p_priority: input.priority,
      p_description: input.description,
      p_classification: input.classification,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }
  async updateObjective(input: ObjectiveUpdateInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('update_objective', {
      p_objective_id: input.objectiveId,
      p_name: input.name,
      p_number: input.number ?? null,
      p_leader_id: input.leaderId,
      p_quarter: input.quarter,
      p_start_date: input.startDate,
      p_due_date: input.dueDate,
      p_priority: input.priority,
      p_description: input.description,
      p_classification: input.classification,
    });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async archiveObjective(objectiveId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('archive_objective', { p_objective_id: objectiveId });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async restoreObjective(objectiveId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('restore_objective', { p_objective_id: objectiveId });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async createKeyResult(input: KeyResultCreateInput): Promise<RepositoryResult<{ id: string }>> {
    const result = await this.callRpc<string>('create_key_result', {
      p_objective_id: input.objectiveId,
      p_title: input.title,
      p_owner_id: input.ownerId,
      p_due_date: input.dueDate,
      p_metric_type: input.metricType,
      p_current_value: input.currentValue ?? null,
      p_target_value: input.targetValue ?? null,
      p_unit: input.unit ?? null,
      p_notes: input.notes ?? null,
      p_confidence_index: input.confidenceIndex ?? null,
      p_priority: input.priority ?? null,
      p_classification: input.classification,
      p_collaborator_ids: input.collaboratorIds,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }
  async updateKeyResult(input: KeyResultUpdateInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('update_key_result', {
      p_key_result_id: input.keyResultId,
      p_title: input.title,
      p_owner_id: input.ownerId,
      p_due_date: input.dueDate,
      p_metric_type: input.metricType,
      p_current_value: input.currentValue ?? null,
      p_target_value: input.targetValue ?? null,
      p_unit: input.unit ?? null,
      p_notes: input.notes ?? null,
      p_confidence_index: input.confidenceIndex ?? null,
      p_priority: input.priority ?? null,
      p_classification: input.classification,
      p_collaborator_ids: input.collaboratorIds,
    });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async saveKrProgressUpdate(input: KrProgressUpdateInput): Promise<RepositoryResult<{ id: string }>> {
    const result = await this.callRpc<string>('save_kr_progress_update', {
      p_key_result_id: input.keyResultId,
      p_previous_progress: input.previousProgress,
      p_new_progress: input.newProgress,
      p_summary: input.summary,
      p_blocker: input.blocker ?? null,
      p_reason: input.reason ?? null,
      p_next_action: input.nextAction ?? null,
      p_evidence: input.evidence ?? null,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }
  async setMyLocale(locale: 'zh-CN' | 'en'): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('set_my_locale', { p_locale: locale });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async listOrganizationUsers(): Promise<RepositoryResult<OrganizationUser[]>> {
    const result = await this.selectRows('profiles', 'id,display_name,email,department,job_title,is_active,approval_status,created_at,user_roles!user_roles_profile_id_fkey(role),project_members!project_members_profile_id_fkey(project_id)');
    if (!result.ok) return result;
    const users = result.data.map(mapOrganizationUser).filter((user): user is OrganizationUser => user !== null);
    return { ok: true, data: users };
  }
  async approvePendingUser(input: ApprovePendingUserInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('approve_pending_user', {
      p_target_user_id: input.userId,
      p_role: input.role,
      p_department: input.department,
      p_job_title: input.jobTitle,
    });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async rejectPendingUser(userId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('reject_pending_user', { p_target_user_id: userId });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async createPendingProfile(displayName: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('create_pending_profile', { p_display_name: displayName });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async updateUserProfile(input: UpdateUserInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('update_user_profile', {
      p_target_user_id: input.userId,
      p_display_name: input.displayName,
      p_email: input.email,
      p_department: input.department,
      p_job_title: input.jobTitle,
      p_role: input.role,
    });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async setUserActive(userId: string, active: boolean): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('set_user_active', { p_target_user_id: userId, p_is_active: active });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async createProject(input: ProjectCreateInput): Promise<RepositoryResult<{ id: string }>> {
    const result = await this.callRpc<string>('create_project', {
      p_name: input.name,
      p_description: input.description,
      p_leader_id: input.leaderId,
      p_start_date: input.startDate,
      p_due_date: input.dueDate,
      p_classification: input.classification,
      p_status: input.status,
      p_member_ids: input.memberIds,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }
  async updateProject(input: ProjectUpdateInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('update_project', {
      p_project_id: input.projectId,
      p_name: input.name,
      p_description: input.description,
      p_start_date: input.startDate,
      p_due_date: input.dueDate,
      p_classification: input.classification,
      p_status: input.status,
    });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async setProjectLeader(projectId: string, leaderId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('set_project_leader', { p_project_id: projectId, p_leader_id: leaderId });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async setProjectMembers(projectId: string, memberIds: string[]): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('set_project_members', { p_project_id: projectId, p_member_ids: memberIds });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async setProjectStatus(projectId: string, status: ProjectStatus): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('set_project_status', { p_project_id: projectId, p_status: status });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async archiveProject(projectId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('archive_project', { p_project_id: projectId });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async restoreProject(projectId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('restore_project', { p_project_id: projectId });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async getProjectDetail(projectId: string): Promise<RepositoryResult<ProjectDetail>> {
    const result = await this.callRpc<ProjectDetail | null>('get_project_detail', { p_project_id: projectId });
    if (!result.ok) return result;
    return result.data === null ? notFound() : { ok: true, data: result.data };
  }
  async listResources(): Promise<RepositoryResult<Resource[]>> {
    const result = await this.selectRows(
      'resources',
      'id,name,category,resource_kind,description,owner_id,location,purchase_date,purchase_vendor,purchase_reference,usage_notes,manual_url,quantity,unit,status,created_at,updated_at,archived_at,profiles!resources_owner_id_fkey(display_name)',
    );
    if (!result.ok) return result;
    const resources = result.data.map(mapResource).filter((resource): resource is Resource => resource !== null);
    return { ok: true, data: resources };
  }

  async getResourceDetail(resourceId: string): Promise<RepositoryResult<ResourceDetail>> {
    const result = await this.callRpc<ResourceDetail | null>('get_resource_detail', { p_resource_id: resourceId });
    if (!result.ok) return result;
    return result.data === null ? notFound() : { ok: true, data: result.data };
  }

  async createResource(input: CreateResourceInput): Promise<RepositoryResult<{ id: string }>> {
    const result = await this.callRpc<string>('create_resource', {
      p_name: input.name,
      p_category: input.category,
      p_resource_kind: input.resourceKind,
      p_description: input.description,
      p_location: input.location,
      p_purchase_date: input.purchaseDate ?? null,
      p_purchase_vendor: input.purchaseVendor,
      p_purchase_reference: input.purchaseReference,
      p_usage_notes: input.usageNotes,
      p_manual_url: input.manualUrl,
      p_quantity: input.quantity,
      p_unit: input.unit,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }

  async updateResource(input: UpdateResourceInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('update_resource', {
      p_resource_id: input.resourceId,
      p_name: input.name,
      p_category: input.category,
      p_resource_kind: input.resourceKind,
      p_description: input.description,
      p_location: input.location,
      p_purchase_date: input.purchaseDate ?? null,
      p_purchase_vendor: input.purchaseVendor,
      p_purchase_reference: input.purchaseReference,
      p_usage_notes: input.usageNotes,
      p_manual_url: input.manualUrl,
      p_quantity: input.quantity,
      p_unit: input.unit,
      p_status: input.status,
    });
    return result.ok ? { ok: true, data: undefined } : result;
  }

  async archiveResource(resourceId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('archive_resource', { p_resource_id: resourceId });
    return result.ok ? { ok: true, data: undefined } : result;
  }

  async restoreResource(resourceId: string): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('restore_resource', { p_resource_id: resourceId });
    return result.ok ? { ok: true, data: undefined } : result;
  }

  async reportResourceProblem(input: ReportResourceProblemInput): Promise<RepositoryResult<ReportResourceProblemResult>> {
    const result = await this.callRpc<ReportResourceProblemResult>('report_resource_problem', {
      p_resource_id: input.resourceId,
      p_problem_type: input.problemType,
      p_description: input.description,
    });
    return result.ok ? { ok: true, data: result.data } : result;
  }

  async resolveResourceProblem(input: ResolveResourceProblemInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('resolve_resource_problem', {
      p_problem_id: input.problemId,
      p_resolution_note: input.resolutionNote,
    });
    return result.ok ? { ok: true, data: undefined } : result;
  }

  async retryResourceProblemNotification(problemId: string): Promise<RepositoryResult<RetryResourceProblemNotificationResult>> {
    return this.callRpc<RetryResourceProblemNotificationResult>('retry_resource_problem_notification', { p_problem_id: problemId });
  }

  async beginResourceAttachmentUpload(input: Record<string, unknown>): Promise<RepositoryResult<ResourceUploadTarget>> {
    return this.callRpc<ResourceUploadTarget>('begin_resource_attachment_upload', input);
  }

  async finalizeResourceAttachmentUpload(id: string): Promise<RepositoryResult<unknown>> {
    return this.callRpc('finalize_resource_attachment_upload', { p_attachment_id: id });
  }

  async createResourceAttachmentDownload(id: string): Promise<RepositoryResult<{ url: string }>> {
    const authorized = await this.callRpc<{ bucket: string; path: string; expiresIn: number }>('create_resource_attachment_download', { p_attachment_id: id });
    if (!authorized.ok) return authorized;
    const signed = await this.client.storage.from(authorized.data.bucket).createSignedUrl(authorized.data.path, authorized.data.expiresIn);
    return signed.error || !signed.data ? failure(signed.error) : { ok: true, data: { url: signed.data.signedUrl } };
  }

  async uploadResourceAttachment(resourceId: string, file: File): Promise<RepositoryResult<{ id: string }>> {
    const invalid = validateAttachment(file);
    if (invalid) return { ok: false, error: { code: 'validation', message: invalid.message } };
    const pending = await this.beginResourceAttachmentUpload({ p_resource_id: resourceId, p_original_name: sanitizeFilename(file.name), p_mime_type: file.type, p_byte_size: file.size });
    if (!pending.ok) return pending;
    const uploaded = await this.client.storage.from(pending.data.bucket).upload(pending.data.path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) return failure(uploaded.error);
    const finalized = await this.finalizeResourceAttachmentUpload(pending.data.id);
    return finalized.ok ? { ok: true, data: { id: pending.data.id } } : (finalized as RepositoryResult<{ id: string }>);
  }

  async beginAttachmentUpload(input: Record<string, unknown>): Promise<RepositoryResult<AttachmentUploadTarget>> {
    return this.callRpc<AttachmentUploadTarget>('begin_attachment_upload', input);
  }
  async finalizeAttachmentUpload(id: string, checksum?: string): Promise<RepositoryResult<unknown>> {
    return this.callRpc('finalize_attachment_upload', { p_attachment_id: id, p_checksum: checksum ?? null });
  }
  async replaceAttachment(id: string, input: Record<string, unknown>): Promise<RepositoryResult<unknown>> {
    return this.callRpc('replace_attachment', { p_attachment_id: id, ...input });
  }
  async removeAttachment(id: string): Promise<RepositoryResult<void>> {
    return this.callRpc('soft_delete_attachment', { p_attachment_id: id });
  }
  async createAttachmentDownload(id: string): Promise<RepositoryResult<{ url: string }>> {
    const authorized = await this.callRpc<{ bucket: string; path: string; expiresIn: number }>('create_attachment_download', { p_attachment_id: id });
    if (!authorized.ok) return authorized;
    const signed = await this.client.storage.from(authorized.data.bucket).createSignedUrl(authorized.data.path, authorized.data.expiresIn);
    return signed.error || !signed.data ? failure(signed.error) : { ok: true, data: { url: signed.data.signedUrl } };
  }
}
