import { mockRepository } from '../mocks/repository';
import type { ClassifiedAttachmentInput, DailyReportInput, KrProgressInput, OkrRepository, OwnedRiskInput, RepositoryResult } from './types';
import type { DailyReport, User } from '../domain/types';

function unsupported<T>(): RepositoryResult<T> {
  return { ok: false, error: { code: 'validation', message: '当前环境不支持此持久化操作' } };
}

export class DemoOkrRepository implements OkrRepository {
  readonly mode = 'demo' as const;

  getCachedDashboardData(userId: string) {
    return mockRepository.getDashboardData(userId);
  }

  async getCurrentProfile(): Promise<RepositoryResult<User | null>> {
    return { ok: true, data: null };
  }

  async getDashboardData(userId = 'user-employee') {
    return { ok: true as const, data: mockRepository.getDashboardData(userId) };
  }

  async listDailyReports(): Promise<RepositoryResult<DailyReport[]>> {
    return { ok: true, data: mockRepository.getDashboardData('user-employee').dailyReports };
  }

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
