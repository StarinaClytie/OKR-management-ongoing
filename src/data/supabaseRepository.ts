import type { DashboardData } from '../mocks/repository';
import type { DailyReport, Role, User } from '../domain/types';
import type { DailyReportInput, OkrRepository, RepositoryErrorCode, RepositoryResult, SupabaseClientLike } from './types';

interface QueryResponse<T> { data: T | null; error: { code?: string; message: string } | null }
interface ProfileQuery {
  select(columns: string): ProfileQuery;
  eq(column: string, value: string): ProfileQuery;
  maybeSingle(): Promise<QueryResponse<Record<string, unknown>>>;
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

  async getDashboardData(_userId?: string): Promise<RepositoryResult<DashboardData>> { return failure(null); }
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
    const result = await this.callRpc<number>('update_daily_report', {
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

  async listReportRevisions(reportId: string): Promise<RepositoryResult<unknown[]>> {
    return this.callRpc<unknown[]>('list_report_revisions', { p_report_id: reportId });
  }
  async saveProgressPlan(keyResultId: string, points: Array<{ date: string; value: number }>): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('save_progress_plan', { p_key_result_id: keyResultId, p_points: points });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async saveMilestones(projectId: string, milestones: Array<{ title: string; plannedDate: string; keyResultId?: string }>): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('save_milestones', { p_project_id: projectId, p_milestones: milestones });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  async beginAttachmentUpload(input: Record<string, unknown>): Promise<RepositoryResult<unknown>> {
    return this.callRpc('begin_attachment_upload', input);
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
  async createAttachmentDownload(id: string): Promise<RepositoryResult<unknown>> {
    return this.callRpc('create_attachment_download', { p_attachment_id: id });
  }
}
