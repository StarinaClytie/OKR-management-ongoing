import { mockRepository } from '../mocks/repository';
import { getMockResourceDetail, mockResources } from '../mocks/resources';
import type { ApprovePendingUserInput, AuthProfileState, ClassifiedAttachmentInput, CreateResourceInput, DailyReportInput, KrProgressInput, OkrRepository, OrganizationUser, OwnedRiskInput, ProjectCreateInput, ProjectDetail, ProjectUpdateInput, ReportResourceProblemInput, ReportResourceProblemResult, RepositoryResult, ResolveResourceProblemInput, Resource, ResourceDetail, RetryResourceProblemNotificationResult, UpdateResourceInput, UpdateUserInput } from './types';
import type { DailyReport, ProjectStatus } from '../domain/types';

function unsupported<T>(): RepositoryResult<T> {
  return { ok: false, error: { code: 'validation', message: '当前环境不支持此持久化操作' } };
}

export class DemoOkrRepository implements OkrRepository {
  readonly mode = 'demo' as const;

  getCachedDashboardData(userId: string) {
    return mockRepository.getDashboardData(userId);
  }

  async getCurrentProfile(): Promise<RepositoryResult<AuthProfileState>> {
    return { ok: true, data: { kind: 'error' } };
  }

  async getDashboardData(userId = 'user-employee') {
    return { ok: true as const, data: mockRepository.getDashboardData(userId) };
  }

  async listDailyReports(): Promise<RepositoryResult<DailyReport[]>> {
    return { ok: true, data: mockRepository.getDashboardData('user-employee').dailyReports };
  }

  async listOrganizationUsers(): Promise<RepositoryResult<OrganizationUser[]>> {
    return {
      ok: true,
      data: mockRepository.getDashboardData('user-administrator').users.map((user) => ({
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

  async createProject(_input: ProjectCreateInput) { return unsupported<{ id: string }>(); }
  async updateProject(_input: ProjectUpdateInput) { return unsupported<void>(); }
  async setProjectLeader(_projectId: string, _leaderId: string) { return unsupported<void>(); }
  async setProjectMembers(_projectId: string, _memberIds: string[]) { return unsupported<void>(); }
  async setProjectStatus(_projectId: string, _status: ProjectStatus) { return unsupported<void>(); }
  async archiveProject(_projectId: string) { return unsupported<void>(); }
  async restoreProject(_projectId: string) { return unsupported<void>(); }
  async getProjectDetail(_projectId: string) { return unsupported<ProjectDetail>(); }

  async listResources(): Promise<RepositoryResult<Resource[]>> {
    return { ok: true, data: mockResources };
  }

  async getResourceDetail(resourceId: string): Promise<RepositoryResult<ResourceDetail>> {
    const detail = getMockResourceDetail(resourceId);
    return detail
      ? { ok: true, data: detail }
      : { ok: false, error: { code: 'not_found', message: '请求的资源不存在' } };
  }

  async createResource(_input: CreateResourceInput) { return unsupported<{ id: string }>(); }
  async updateResource(_input: UpdateResourceInput) { return unsupported<void>(); }
  async archiveResource(_resourceId: string) { return unsupported<void>(); }
  async restoreResource(_resourceId: string) { return unsupported<void>(); }
  async reportResourceProblem(_input: ReportResourceProblemInput) { return unsupported<ReportResourceProblemResult>(); }
  async resolveResourceProblem(_input: ResolveResourceProblemInput) { return unsupported<void>(); }
  async retryResourceProblemNotification(_problemId: string) { return unsupported<RetryResourceProblemNotificationResult>(); }
  async beginResourceAttachmentUpload(_input: Record<string, unknown>) { return unsupported<import('./types').ResourceUploadTarget>(); }
  async finalizeResourceAttachmentUpload(_id: string) { return unsupported<unknown>(); }
  async createResourceAttachmentDownload(_id: string) { return unsupported<{ url: string }>(); }
  async uploadResourceAttachment(_resourceId: string, _file: File) { return unsupported<{ id: string }>(); }

  async approvePendingUser(_input: ApprovePendingUserInput) { return unsupported<void>(); }
  async rejectPendingUser(_userId: string) { return unsupported<void>(); }
  async createPendingProfile(_displayName: string) { return unsupported<void>(); }
  async updateUserProfile(_input: UpdateUserInput) { return unsupported<void>(); }
  async setUserActive(_userId: string, _active: boolean) { return unsupported<void>(); }

  async createDailyReport(_input: DailyReportInput) { return unsupported<{ id: string; revision: number }>(); }
  async createDailyReportWithAttachments(_input: DailyReportInput, _attachments: ClassifiedAttachmentInput[]) { return unsupported<{ id: string; revision: number }>(); }
  async updateDailyReport(_reportId: string, _expectedRevision: number, _input: DailyReportInput) { return unsupported<{ revision: number }>(); }
  async updateDailyReportWithAttachments(_reportId: string, _expectedRevision: number, _input: DailyReportInput, _attachments: ClassifiedAttachmentInput[]) { return unsupported<{ revision: number }>(); }
  async listReportRevisions(_reportId: string) { return unsupported<unknown[]>(); }
  async saveProgressPlan(_keyResultId: string, _points: Array<{ date: string; value: number }>) { return unsupported<void>(); }
  async saveMilestones(_projectId: string, _milestones: Array<{ title: string; plannedDate: string; keyResultId?: string }>) { return unsupported<void>(); }
  async saveRisk(_input: { projectId: string; title: string; probability: 1 | 2 | 3; impact: 1 | 2 | 3; reason: string; mitigation: string; lastReviewedAt: string; classification: import('../domain/types').Classification }) { return unsupported<{ id: string }>(); }
  async saveKrProgress(_input: KrProgressInput) { return unsupported<{ snapshotId: string }>(); }
  async saveOwnedRisk(_input: OwnedRiskInput) { return unsupported<{ id: string }>(); }
  async setMyLocale(_locale: 'zh-CN' | 'en') { return unsupported<void>(); }
  async beginAttachmentUpload(_input: Record<string, unknown>) { return unsupported<import('./types').AttachmentUploadTarget>(); }
  async finalizeAttachmentUpload(_id: string, _checksum?: string) { return unsupported<unknown>(); }
  async replaceAttachment(_id: string, _input: Record<string, unknown>) { return unsupported<unknown>(); }
  async removeAttachment(_id: string) { return unsupported<void>(); }
  async createAttachmentDownload(_id: string) { return unsupported<{ url: string }>(); }
}
