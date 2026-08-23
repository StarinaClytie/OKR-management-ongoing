import type { DashboardData } from '../data/types';
import type { Classification, DailyReport, ProjectStatus, Role, User } from '../domain/types';
import type { DailyEvidenceDraft } from '../domain/dailyEntry';
import type { ApprovePendingUserInput, AttachmentUploadTarget, AuthProfileState, ClassifiedAttachmentInput, CreateResourceInput, DailyReportAttachmentUploadInput, DailyReportInput, DailyReportUploadSession, KeyResultCreateInput, KeyResultUpdateInput, KrProgressInput, KrProgressUpdateInput, ObjectiveCreateInput, ObjectiveUpdateInput, OkrRepository, OrganizationUser, OwnedRiskInput, ProjectCreateInput, ProjectDetail, ProjectSummary, ProjectUpdateInput, ReportResourceProblemInput, ReportResourceProblemResult, RepositoryErrorCode, RepositoryResult, ResolveResourceProblemInput, Resource, ResourceDetail, ResourceUploadTarget, RetryResourceProblemNotificationResult, SupabaseClientLike, UpdateUserInput, UpdateResourceInput } from './types';
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

function failure<T>(error: { code?: string; message: string } | null): Extract<RepositoryResult<T>, { ok: false }> {
  const source = error?.code ?? '';
  const message = error?.message.toLowerCase() ?? '';
  const code: RepositoryErrorCode = source === '42501' || source === 'PGRST301'
    ? message.includes('locked')
      ? 'locked'
      : message.includes('clearance') || message.includes('classification')
        ? 'clearance'
        : 'unauthorized'
    : source === '40001'
      ? 'conflict'
      : source === '55000' && message.includes('requiring cleanup')
        ? 'cleanup_required'
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

function storageTransferFailure<T>(error: unknown): Extract<RepositoryResult<T>, { ok: false }> {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const code: RepositoryErrorCode = /network|fetch|offline|connection|timeout/.test(message) ? 'network' : 'storage';
  return { ok: false, error: { code, message: '请求未完成，请稍后重试' } };
}

function notFound<T>(): RepositoryResult<T> {
  return { ok: false, error: { code: 'not_found', message: '请求的资源不存在' } };
}

function mapProfile(row: Record<string, unknown>): User | null {
  const roleRow = Array.isArray(row.user_roles) ? row.user_roles[0] as Record<string, unknown> | undefined : undefined;
  const role = roleRow?.role;
  const roles: readonly Role[] = ['administrator', 'management', 'project_leader', 'employee', 'hr'];
  const clearances: readonly Classification[] = ['public', 'internal', 'confidential', 'restricted'];
  const clearance = row.clearance;
  const organization = row.organizations as Record<string, unknown> | undefined;
  if (typeof row.id !== 'string' || typeof row.display_name !== 'string' || !roles.includes(role as Role) || !clearances.includes(clearance as Classification)) return null;
  return {
    id: row.id,
    name: row.display_name,
    role: role as Role,
    clearance: clearance as Classification,
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

function mapReportAttachment(row: Record<string, unknown>, revisionMetadata?: Record<string, unknown>): DailyEvidenceDraft | null {
  if (typeof row.id !== 'string' || typeof row.report_id !== 'string' || row.state !== 'uploaded') return null;
  const originalName = typeof row.original_name === 'string' ? row.original_name : '';
  const displayName = typeof revisionMetadata?.display_name === 'string' && revisionMetadata.display_name.trim()
    ? revisionMetadata.display_name
    : typeof row.display_name === 'string' && row.display_name.trim() ? row.display_name : originalName;
  if (!displayName) return null;
  return {
    id: `attachment-${row.id}`,
    attachmentId: row.id,
    label: displayName,
    kind: 'file',
    classification: (revisionMetadata?.classification ?? row.classification) as import('../domain/types').Classification,
    uploadState: 'uploaded',
    uploadProgress: 100,
  };
}

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
      .select('id,display_name,clearance,preferred_locale,organizations!profiles_organization_id_fkey(name),user_roles!user_roles_profile_id_fkey(role),project_members!project_members_profile_id_fkey(project_id)')
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
      this.callRpc<Record<string, unknown>[]>('list_organization_users', {}),
      this.selectRows('profiles', 'id,clearance'),
      this.selectRows('projects', 'id,name,description,leader_id,classification,start_date,due_date,status,project_members!project_members_project_id_fkey(profile_id)'),
      this.selectRows('objectives', 'id,project_id,owner_id,title,description,progress,classification,start_date,due_date,number,quarter,priority,okr_status,archived_at'),
      this.selectRows('key_results', 'id,objective_id,project_id,owner_id,title,progress,classification,start_date,due_date,metric_type,current_value,target_value,unit,notes,confidence_index,priority,okr_status'),
      this.selectRows('progress_baselines', 'id,key_result_id,planned_for,planned_value'),
      this.selectRows('milestones', 'id,project_id,key_result_id,title,planned_date,is_complete'),
      this.selectRows('risks', 'id,project_id,key_result_id,objective_id,owner_id,title,reason,mitigation,probability,impact,classification,last_reviewed_at,resolved_at'),
      this.selectRows('progress_snapshots', 'id,key_result_id,progress,effective_date'),
      this.selectRows('kr_assignments', 'id,kr_id,profile_id,assignment_role'),
      this.selectRows('kr_progress_updates', 'id,kr_id,author_id,previous_progress,new_progress,summary,blocker,reason,next_action,evidence,created_at'),
      this.selectRows('daily_reports', 'id,author_id,project_id,objective_id,report_date,status,classification,total_hours,current_revision,updated_at'),
      this.selectRows('daily_report_revisions', 'id,report_id,revision_number'),
      this.selectRows('daily_okr_blocks', 'id,report_id,revision_id,position,daily_objective,linked_key_result_id,work_description,hours,result,key_results,evidence_links'),
      this.selectRows('report_attachments', 'id,report_id,revision_id,daily_okr_block_id,original_name,display_name,classification,state'),
      this.selectRows('report_attachment_revisions', 'report_id,revision_id,daily_okr_block_id,attachment_id,display_name,classification'),
    ]);
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) return failed;
    const [profileResult, clearanceResult, projectResult, objectiveResult, keyResultResult, baselineResult, milestoneResult, riskResult, snapshotResult, krAssignmentResult, krProgressUpdateResult, dailyReportResult, dailyRevisionResult, dailyBlockResult, attachmentResult, attachmentRevisionResult] = results as Array<{ ok: true; data: Record<string, unknown>[] }>;

    const clearancesByProfileId = new Map(
      clearanceResult.data
        .filter((row) => typeof row.id === 'string')
        .map((row) => [row.id as string, row.clearance]),
    );
    const users = profileResult.data
      .map((row) => mapProfile({
        ...row,
        clearance: typeof row.id === 'string' ? clearancesByProfileId.get(row.id) : undefined,
      }))
      .filter((user): user is User => user !== null);
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

    const currentRevisionIdByReportId = new Map<string, string>();
    for (const report of dailyReportResult.data) {
      const revision = dailyRevisionResult.data.find((candidate) => candidate.report_id === report.id && numberValue(candidate.revision_number) === numberValue(report.current_revision));
      if (typeof revision?.id === 'string') currentRevisionIdByReportId.set(String(report.id), revision.id);
    }
    const blocksByReportId = new Map<string, Array<Record<string, unknown>>>();
    for (const row of dailyBlockResult.data) {
      const reportId = String(row.report_id);
      if (row.revision_id !== currentRevisionIdByReportId.get(reportId)) continue;
      const list = blocksByReportId.get(reportId) ?? [];
      list.push(row);
      blocksByReportId.set(reportId, list);
    }
    const attachmentRowById = new Map(attachmentResult.data.map((row) => [String(row.id), row]));
    const attachmentsByBlockId = new Map<string, DailyEvidenceDraft[]>();
    const legacyAttachmentsByReportId = new Map<string, DailyEvidenceDraft[]>();
    const associatedAttachmentIds = new Set<string>();
    for (const metadata of attachmentRevisionResult.data) {
      const reportId = String(metadata.report_id);
      if (metadata.revision_id !== currentRevisionIdByReportId.get(reportId)) continue;
      const attachmentId = String(metadata.attachment_id);
      const row = attachmentRowById.get(attachmentId);
      if (!row) continue;
      const attachment = mapReportAttachment(row, metadata);
      if (!attachment) continue;
      associatedAttachmentIds.add(attachmentId);
      const blockId = typeof metadata.daily_okr_block_id === 'string' ? metadata.daily_okr_block_id : undefined;
      const collection = blockId ? attachmentsByBlockId : legacyAttachmentsByReportId;
      const key = blockId ?? reportId;
      collection.set(key, [...(collection.get(key) ?? []), attachment]);
    }
    // Backward compatibility for attachments saved before revision-scoped
    // metadata existed. Only rows belonging to the current revision qualify.
    for (const row of attachmentResult.data) {
      const reportId = String(row.report_id);
      if (associatedAttachmentIds.has(String(row.id)) || row.revision_id !== currentRevisionIdByReportId.get(reportId)) continue;
      const attachment = mapReportAttachment(row);
      if (!attachment) continue;
      const blockId = typeof row.daily_okr_block_id === 'string' ? row.daily_okr_block_id : undefined;
      const collection = blockId ? attachmentsByBlockId : legacyAttachmentsByReportId;
      const key = blockId ?? reportId;
      collection.set(key, [...(collection.get(key) ?? []), attachment]);
    }
    const dailyReports: DailyReport[] = dailyReportResult.data.map((row) => {
      const blocks = (blocksByReportId.get(String(row.id)) ?? [])
        .sort((left, right) => numberValue(left.position) - numberValue(right.position))
        .map((block) => {
          const blockId = String(block.id);
          const links: DailyEvidenceDraft[] = (Array.isArray(block.evidence_links) ? block.evidence_links : []).map((item: unknown, index: number) => ({
            id: `evidence-link-${index + 1}`,
            label: String((item as Record<string, unknown>).label ?? (item as Record<string, unknown>).url ?? ''),
            kind: 'link' as const,
            classification: ((item as Record<string, unknown>).classification ?? row.classification) as import('../domain/types').Classification,
          }));
          return {
            id: blockId,
            dailyObjective: String(block.daily_objective ?? ''),
            keyResultId: typeof block.linked_key_result_id === 'string' ? block.linked_key_result_id : '',
            workDescription: String(block.work_description ?? ''),
            hours: numberValue(block.hours),
            result: String(block.result ?? ''),
            keyResults: (Array.isArray(block.key_results) ? block.key_results : []).map((item: unknown, index: number) => ({
              id: `daily-kr-${index + 1}`,
              title: String((item as Record<string, unknown>).title ?? ''),
            })),
            evidenceItems: [...links, ...(attachmentsByBlockId.get(blockId) ?? [])],
          };
        });
      const legacyAttachments = legacyAttachmentsByReportId.get(String(row.id)) ?? [];
      if (blocks[0] && legacyAttachments.length > 0) {
        blocks[0].evidenceItems = [...(blocks[0].evidenceItems ?? []), ...legacyAttachments];
      }
      const evidenceItems = blocks.length > 0 ? blocks.flatMap((block) => block.evidenceItems ?? []) : legacyAttachments;
      const attachmentIds = evidenceItems.flatMap((item) => item.attachmentId ? [item.attachmentId] : []);
      return {
        id: String(row.id),
        authorId: String(row.author_id),
        projectId: typeof row.project_id === 'string' ? row.project_id : '',
        objectiveId: typeof row.objective_id === 'string' ? row.objective_id : '',
        keyResultIds: blocks.map((block) => block.keyResultId),
        date: dateValue(row.report_date),
        content: blocks[0]?.dailyObjective ?? '',
        dailyObjective: blocks[0]?.dailyObjective ?? '',
        blocks,
        classification: row.classification as import('../domain/types').Classification,
        hours: numberValue(row.total_hours),
        evidence: evidenceItems.map((item) => item.label),
        evidenceItems,
        evidenceClassification: evidenceItems.reduce<import('../domain/types').Classification>((highest, item) => {
          const rank = { public: 0, internal: 1, confidential: 2, restricted: 3 };
          return rank[item.classification] > rank[highest] ? item.classification : highest;
        }, 'public'),
        attachmentIds,
        status: row.status as import('../domain/types').ReportStatus,
        currentRevision: numberValue(row.current_revision),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
      };
    });

    return { ok: true, data: { currentUser, users, dailyReports, projects, objectives, keyResults, krAssignments, krProgressUpdates, milestones, risks, progressSnapshots, workloads: [], attachments: [], companyObjectives, projectTasks: [] } };
  }
  async listDailyReports(): Promise<RepositoryResult<DailyReport[]>> { return failure(null); }

  private async callRpc<T>(name: string, args: Record<string, unknown>): Promise<RepositoryResult<T>> {
    const { data, error } = await (this.client.rpc(name, args) as Promise<QueryResponse<T>>);
    if (error) return failure(error);
    return { ok: true, data: data as T };
  }

  async createDailyReport(input: DailyReportInput): Promise<RepositoryResult<{ id: string; revision: number }>> {
    const result = await this.callRpc<string>('create_daily_report', {
      p_report_date: input.reportDate,
      p_status: input.status,
      p_classification: input.classification,
      p_blocks: input.blocks,
      p_evidence_links: input.evidenceLinks,
    });
    return result.ok ? { ok: true, data: { id: result.data, revision: 1 } } : result;
  }

  async saveDailyReport(input: DailyReportInput, _attachments: ClassifiedAttachmentInput[] = []): Promise<RepositoryResult<{ id: string; revision: number }>> {
    const result = await this.callRpc<Array<{ report_id: string; revision: number }>>('save_daily_report', {
      p_report_date: input.reportDate,
      p_status: input.status,
      p_classification: input.classification,
      p_blocks: input.blocks,
      p_evidence_links: input.evidenceLinks,
    });
    if (!result.ok) return result;
    const saved = result.data[0];
    return saved
      ? { ok: true, data: { id: saved.report_id, revision: saved.revision } }
      : { ok: false, error: { code: 'unknown', message: '请求未完成，请稍后重试' } };
  }

  async beginDailyReportUploadSession(input: Pick<DailyReportInput, 'reportDate' | 'status' | 'classification'>): Promise<RepositoryResult<DailyReportUploadSession>> {
    return this.callRpc<DailyReportUploadSession>('begin_daily_report_upload_session', {
      p_report_date: input.reportDate,
      p_status: input.status,
      p_classification: input.classification,
    });
  }

  async findDailyReportUploadSession(reportDate: string): Promise<RepositoryResult<DailyReportUploadSession | null>> {
    return this.callRpc<DailyReportUploadSession | null>('find_daily_report_upload_session', {
      p_report_date: reportDate,
    });
  }

  async confirmDailyReport(reportId: string, expectedRevision: number): Promise<RepositoryResult<void>> {
    const confirmed = await this.callRpc<null>('confirm_daily_report', {
      p_report_id: reportId,
      p_expected_revision: expectedRevision,
    });
    return confirmed.ok ? { ok: true, data: undefined } : confirmed;
  }

  async adoptDailyReportAttachments(session: DailyReportUploadSession, attachmentIds: string[]): Promise<RepositoryResult<void>> {
    const adopted = await this.callRpc<null>('adopt_daily_report_revision_attachments', {
      p_report_id: session.reportId,
      p_upload_session_id: session.sessionId,
      p_attachment_ids: attachmentIds,
    });
    return adopted.ok ? { ok: true, data: undefined } : adopted;
  }

  async uploadDailyReportAttachment(input: DailyReportAttachmentUploadInput): Promise<RepositoryResult<{ attachmentId: string }>> {
    const invalid = validateAttachment(input.file);
    if (invalid) {
      const result: RepositoryResult<{ attachmentId: string }> = { ok: false, error: { code: 'validation', message: invalid.message } };
      input.onChange({ state: 'failed', progress: 0, errorCode: result.error.code, error: result.error.message });
      return result;
    }

    input.onChange({ state: 'pending', progress: 0 });
    const pending = await this.callRpc<AttachmentUploadTarget>('begin_entry_attachment_upload', {
      p_report_id: input.session.reportId,
      p_upload_session_id: input.session.sessionId,
      p_entry_position: input.entryPosition,
      p_original_name: sanitizeFilename(input.file.name),
      p_mime_type: input.file.type,
      p_byte_size: input.file.size,
      p_classification: input.classification,
      p_display_name: input.label.trim() || input.file.name,
    });
    if (!pending.ok) {
      input.onChange({ state: 'failed', progress: 0, errorCode: pending.error.code, error: pending.error.message });
      return pending;
    }

    const attachmentId = pending.data.id;
    input.onChange({ state: 'uploading', progress: 0, attachmentId });
    const session = await this.client.auth.getSession();
    if (session.error || !session.data.session?.access_token) {
      const cleanup = await this.cleanupUploadAttempt([pending.data]);
      const result: { ok: false; error: { code: RepositoryErrorCode; message: string } } = !cleanup.ok
        ? cleanup
        : session.error
          ? failure<{ attachmentId: string }>(session.error)
          : { ok: false, error: { code: 'unauthorized', message: '无权访问请求的资源' } };
      input.onChange({ state: 'failed', progress: 0, attachmentId: undefined, errorCode: result.error.code, error: result.error.message });
      return result;
    }

    try {
      // Load the transport only at call time. Its public endpoint configuration
      // lives in lib/supabase, which also constructs this repository.
      const { uploadStorageObject } = await import('../services/supabaseStorageUpload');
      await uploadStorageObject({
        bucket: pending.data.bucket,
        path: pending.data.path,
        file: input.file,
        accessToken: session.data.session.access_token,
        signal: input.signal,
        onProgress: (progress) => input.onChange({ state: 'uploading', progress, attachmentId }),
      });
    } catch (error) {
      const cleanup = await this.cleanupUploadAttempt([pending.data]);
      const result = cleanup.ok
        ? storageTransferFailure<{ attachmentId: string }>(error)
        : cleanup;
      input.onChange({ state: 'failed', progress: 0, attachmentId: undefined, errorCode: result.error.code, error: result.error.message });
      return result;
    }

    input.onChange({ state: 'verifying', progress: 100, attachmentId });
    const finalized = await this.finalizeAttachmentUpload(attachmentId);
    if (!finalized.ok) {
      const cleanup = await this.cleanupUploadAttempt([pending.data]);
      const result = cleanup.ok ? finalized : cleanup;
      input.onChange({ state: 'failed', progress: 100, attachmentId: undefined, errorCode: result.error.code, error: result.error.message });
      return result as RepositoryResult<{ attachmentId: string }>;
    }
    input.onChange({ state: 'uploaded', progress: 100, attachmentId });
    return { ok: true, data: { attachmentId } };
  }

  async abandonDailyReportUploadSession(sessionId: string): Promise<RepositoryResult<void>> {
    const cleanupTargets = await this.callRpc<Array<{ attachment_id: string }>>('list_daily_report_upload_session_cleanup', { p_upload_session_id: sessionId });
    if (!cleanupTargets.ok) return cleanupTargets;
    for (const target of cleanupTargets.data) {
      const cleaned = await this.removeAttachment(target.attachment_id, { preserveRevisionHistory: false });
      if (!cleaned.ok) return cleaned;
    }
    const abandoned = await this.callRpc<null>('abandon_daily_report_upload_session', { p_upload_session_id: sessionId });
    return abandoned.ok ? { ok: true, data: undefined } : abandoned;
  }

  async submitDailyReportSession(input: DailyReportInput, sessionId: string): Promise<RepositoryResult<{ id: string; revision: number }>> {
    const result = await this.callRpc<Array<{ report_id: string; revision: number }>>('save_daily_report', {
      p_report_date: input.reportDate,
      p_status: input.status,
      p_classification: input.classification,
      p_blocks: input.blocks,
      p_upload_session_id: sessionId,
      p_evidence_links: input.evidenceLinks,
    });
    if (!result.ok) return result;
    const saved = result.data[0];
    return saved
      ? { ok: true, data: { id: saved.report_id, revision: saved.revision } }
      : { ok: false, error: { code: 'unknown', message: '请求未完成，请稍后重试' } };
  }

  async updateDailyReport(reportId: string, expectedRevision: number, input: DailyReportInput): Promise<RepositoryResult<{ revision: number }>> {
    const result = await this.callRpc<number>('update_daily_report_with_attachments', {
      p_report_id: reportId,
      p_expected_revision: expectedRevision,
      p_status: input.status,
      p_classification: input.classification,
      p_blocks: input.blocks,
      p_evidence_links: input.evidenceLinks,
    });
    return result.ok ? { ok: true, data: { revision: result.data } } : result;
  }

  private validateAttachmentInputs(attachments: ClassifiedAttachmentInput[]): RepositoryResult<void> {
    for (const attachment of attachments) {
      const invalid = validateAttachment(attachment.file);
      if (invalid) return { ok: false, error: { code: 'validation', message: invalid.message } };
    }
    return { ok: true, data: undefined };
  }

  private async cleanupUploadAttempt(started: AttachmentUploadTarget[]): Promise<RepositoryResult<void>> {
    const cleanupOrder = [...started].reverse();
    for (const target of cleanupOrder) {
      const removed = await this.removeAttachment(target.id, { preserveRevisionHistory: false });
      if (!removed.ok) return removed;
    }
    return { ok: true, data: undefined };
  }

  private async uploadAll(reportId: string, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<AttachmentUploadTarget[]>> {
    const validation = this.validateAttachmentInputs(attachments);
    if (!validation.ok) return validation;
    const started: AttachmentUploadTarget[] = [];
    for (const attachment of attachments) {
      const pending = attachment.entryPosition === undefined
        ? await this.beginAttachmentUpload({ p_report_id: reportId, p_original_name: sanitizeFilename(attachment.file.name), p_mime_type: attachment.file.type, p_byte_size: attachment.file.size, p_classification: attachment.classification })
        : await this.callRpc<AttachmentUploadTarget>('begin_entry_attachment_upload', { p_report_id: reportId, p_entry_position: attachment.entryPosition, p_original_name: sanitizeFilename(attachment.file.name), p_mime_type: attachment.file.type, p_byte_size: attachment.file.size, p_classification: attachment.classification, p_display_name: attachment.label?.trim() || attachment.file.name });
      if (!pending.ok) {
        await this.cleanupUploadAttempt(started);
        return pending;
      }
      started.push(pending.data);
      const uploaded = await this.client.storage.from(pending.data.bucket).upload(pending.data.path, attachment.file, { contentType: attachment.file.type, upsert: false });
      if (uploaded.error) {
        await this.cleanupUploadAttempt(started);
        return failure(uploaded.error);
      }
      const finalized = await this.finalizeAttachmentUpload(pending.data.id);
      if (!finalized.ok) {
        await this.cleanupUploadAttempt(started);
        return finalized as RepositoryResult<AttachmentUploadTarget[]>;
      }
    }
    return { ok: true, data: started };
  }

  async createDailyReportWithAttachments(input: DailyReportInput, attachments: ClassifiedAttachmentInput[]): Promise<RepositoryResult<{ id: string; revision: number }>> {
    const attachmentValidation = this.validateAttachmentInputs(attachments);
    if (!attachmentValidation.ok) return attachmentValidation;
    const shell = await this.callRpc<string>('begin_daily_report_with_attachments', { p_report_date: input.reportDate, p_status: input.status, p_classification: input.classification });
    if (!shell.ok) return shell;
    const uploaded = await this.uploadAll(shell.data, attachments);
    if (!uploaded.ok) return uploaded;
    const revision = await this.updateDailyReport(shell.data, 0, input);
    if (!revision.ok) await this.cleanupUploadAttempt(uploaded.data);
    return revision.ok ? { ok: true, data: { id: shell.data, revision: revision.data.revision } } : revision;
  }

  async updateDailyReportWithAttachments(reportId: string, expectedRevision: number, input: DailyReportInput, attachments: ClassifiedAttachmentInput[]) {
    const attachmentValidation = this.validateAttachmentInputs(attachments);
    if (!attachmentValidation.ok) return attachmentValidation;
    const uploaded = await this.uploadAll(reportId, attachments);
    if (!uploaded.ok) return uploaded;
    const updated = await this.updateDailyReport(reportId, expectedRevision, input);
    if (!updated.ok) await this.cleanupUploadAttempt(uploaded.data);
    return updated;
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
      p_owner_ids: input.ownerIds,
      p_due_date: input.dueDate,
      p_metric_type: input.metricType,
      p_current_value: input.currentValue ?? null,
      p_target_value: input.targetValue ?? null,
      p_unit: input.unit ?? null,
      p_notes: input.notes ?? null,
      p_confidence_index: input.confidenceIndex ?? null,
      p_priority: input.priority ?? null,
      p_classification: input.classification,
    });
    return result.ok ? { ok: true, data: { id: result.data } } : result;
  }
  async updateKeyResult(input: KeyResultUpdateInput): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('update_key_result', {
      p_key_result_id: input.keyResultId,
      p_title: input.title,
      p_owner_ids: input.ownerIds,
      p_due_date: input.dueDate,
      p_metric_type: input.metricType,
      p_current_value: input.currentValue ?? null,
      p_target_value: input.targetValue ?? null,
      p_unit: input.unit ?? null,
      p_notes: input.notes ?? null,
      p_confidence_index: input.confidenceIndex ?? null,
      p_priority: input.priority ?? null,
      p_classification: input.classification,
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
    const result = await this.callRpc<Record<string, unknown>[]>('list_organization_users', {});
    if (!result.ok) return result;
    const users = (result.data ?? []).map(mapOrganizationUser).filter((user): user is OrganizationUser => user !== null);
    return { ok: true, data: users };
  }
  async listEligibleKrOwners(objectiveId: string): Promise<RepositoryResult<OrganizationUser[]>> {
    const result = await this.callRpc<Record<string, unknown>[]>('list_eligible_kr_owners', { p_objective_id: objectiveId });
    if (!result.ok) return result;
    const users = (result.data ?? []).map(mapOrganizationUser).filter((user): user is OrganizationUser => user !== null);
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
  async listProjects(): Promise<RepositoryResult<ProjectSummary[]>> {
    const result = await this.callRpc<Record<string, unknown>[]>('list_projects', {});
    if (!result.ok) return result;
    const projects = (result.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      leaderId: String(row.leader_id),
      leaderName: typeof row.leader_name === 'string' ? row.leader_name : '',
    }));
    return { ok: true, data: projects };
  }
  async setUserProjectMemberships(userId: string, projectIds: string[]): Promise<RepositoryResult<void>> {
    const result = await this.callRpc<null>('set_user_project_memberships', { p_target_user_id: userId, p_project_ids: projectIds });
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
  async removeAttachment(id: string, options?: { preserveRevisionHistory?: boolean }): Promise<RepositoryResult<void>> {
    if (options?.preserveRevisionHistory) {
      const authorized = await this.callRpc<null>('authorize_attachment_revision_removal', { p_attachment_id: id });
      return authorized.ok ? { ok: true, data: undefined } : authorized;
    }
    const deleted = await this.callRpc<AttachmentUploadTarget>('delete_daily_report_upload_attachment', { p_attachment_id: id });
    if (!deleted.ok) return deleted;
    const removed = await this.client.storage.from(deleted.data.bucket).remove([deleted.data.path]);
    return removed.error ? failure(removed.error) : { ok: true, data: undefined };
  }
  async createAttachmentDownload(id: string): Promise<RepositoryResult<{ url: string }>> {
    const authorized = await this.callRpc<{ bucket: string; path: string; expiresIn: number }>('create_attachment_download', { p_attachment_id: id });
    if (!authorized.ok) return authorized;
    const signed = await this.client.storage.from(authorized.data.bucket).createSignedUrl(authorized.data.path, authorized.data.expiresIn);
    return signed.error || !signed.data ? failure(signed.error) : { ok: true, data: { url: signed.data.signedUrl } };
  }
}
