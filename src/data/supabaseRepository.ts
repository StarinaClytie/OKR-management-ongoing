import type { DashboardData } from '../mocks/repository';
import type { DailyReport, Role, User } from '../domain/types';
import type { AttachmentUploadTarget, ClassifiedAttachmentInput, DailyReportInput, KrProgressInput, OkrRepository, OwnedRiskInput, RepositoryErrorCode, RepositoryResult, SupabaseClientLike } from './types';
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
      : source.startsWith('22') || source === '23514'
        ? 'validation'
        : error
          ? 'network'
          : 'unknown';
  return { ok: false, error: { code, message: code === 'unauthorized' ? '无权访问请求的资源' : '请求未完成，请稍后重试' } };
}

function mapProfile(row: Record<string, unknown>): User | null {
  const roleRow = Array.isArray(row.user_roles) ? row.user_roles[0] as Record<string, unknown> | undefined : undefined;
  const role = roleRow?.role;
  const roles: readonly Role[] = ['administrator', 'management', 'project_leader', 'employee', 'hr'];
  if (typeof row.id !== 'string' || typeof row.display_name !== 'string' || !roles.includes(role as Role)) return null;
  return {
    id: row.id,
    name: row.display_name,
    role: role as Role,
    title: typeof row.title === 'string' ? row.title : '',
    department: typeof row.department === 'string' ? row.department : '',
    projectIds: Array.isArray(row.project_members) ? row.project_members.map((item) => String((item as Record<string, unknown>).project_id)) : [],
  };
}

function numberValue(value: unknown): number { return typeof value === 'number' ? value : Number(value) || 0; }
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

  async getCurrentProfile(): Promise<RepositoryResult<User | null>> {
    const session = await this.client.auth.getSession();
    if (session.error) return failure(session.error);
    if (!session.data.session) return { ok: true, data: null };
    const query = this.client.from('profiles') as ProfileQuery;
    const { data, error } = await query
      .select('id,display_name,user_roles(role),project_members(project_id)')
      .eq('id', session.data.session.user.id)
      .maybeSingle();
    if (error) return failure(error);
    return { ok: true, data: data ? mapProfile(data) : null };
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
      this.selectRows('profiles', 'id,display_name,user_roles(role),project_members(project_id)'),
      this.selectRows('projects', 'id,name,description,leader_id,classification,start_date,due_date,project_members(profile_id)'),
      this.selectRows('objectives', 'id,project_id,owner_id,title,description,progress,classification,start_date,due_date'),
      this.selectRows('key_results', 'id,objective_id,project_id,owner_id,title,progress,classification,start_date,due_date'),
      this.selectRows('progress_baselines', 'id,key_result_id,planned_for,planned_value'),
      this.selectRows('milestones', 'id,project_id,key_result_id,title,planned_date,is_complete'),
      this.selectRows('risks', 'id,project_id,key_result_id,objective_id,owner_id,title,reason,mitigation,probability,impact,classification,last_reviewed_at,resolved_at'),
      this.selectRows('progress_snapshots', 'id,key_result_id,progress,effective_date'),
    ]);
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) return failed;
    const [profileResult, projectResult, objectiveResult, keyResultResult, baselineResult, milestoneResult, riskResult, snapshotResult] = results as Array<{ ok: true; data: Record<string, unknown>[] }>;

    const users = profileResult.data.map(mapProfile).filter((user): user is User => user !== null);
    const currentUser = users.find((user) => user.id === session.data.session!.user.id);
    if (!currentUser) return failure({ code: '42501', message: 'Current profile is unavailable' });

    const objectives = objectiveResult.data
      .filter((row) => typeof row.project_id === 'string')
      .map((row) => {
        const progress = numberValue(row.progress);
        return { id: String(row.id), projectId: String(row.project_id), title: String(row.title), description: String(row.description ?? ''), ownerId: String(row.owner_id), progress, status: statusForProgress(progress), startDate: dateValue(row.start_date), dueDate: dateValue(row.due_date), classification: row.classification as import('../domain/types').Classification };
      });
    const keyResults = keyResultResult.data.map((row) => {
      const progress = numberValue(row.progress);
      return { id: String(row.id), objectiveId: String(row.objective_id), title: String(row.title), ownerId: String(row.owner_id), progress, status: statusForProgress(progress), startDate: dateValue(row.start_date), dueDate: dateValue(row.due_date), classification: row.classification as import('../domain/types').Classification };
    });
    const keyResultsById = new Map(keyResults.map((keyResult) => [keyResult.id, keyResult]));
    const projectIdByObjectiveId = new Map(objectives.map((objective) => [objective.id, objective.projectId]));
    const baselineByKeyAndDate = new Map(baselineResult.data.map((row) => [`${String(row.key_result_id)}:${dateValue(row.planned_for)}`, numberValue(row.planned_value)]));

    const projects = projectResult.data.map((row) => ({
      id: String(row.id), name: String(row.name), description: String(row.description ?? ''), leaderId: String(row.leader_id),
      memberIds: Array.isArray(row.project_members) ? row.project_members.map((member) => String((member as Record<string, unknown>).profile_id)) : [],
      classification: row.classification as import('../domain/types').Classification, startDate: dateValue(row.start_date), dueDate: dateValue(row.due_date), status: 'on_track' as const,
    }));
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

    return { ok: true, data: { currentUser, users, dailyReports: [], projects, objectives, keyResults, milestones, risks, progressSnapshots, workloads: [], attachments: [], companyObjectives, projectTasks: [] } };
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
  async setMyLocale(locale: 'zh-CN' | 'en'): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('set_my_locale', { p_locale: locale });
    return result.ok ? { ok: true, data: undefined } : result;
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
