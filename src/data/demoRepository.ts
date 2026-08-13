import { mockRepository } from '../mocks/repository';
import type { DailyReportInput, OkrRepository, RepositoryResult } from './types';
import type { DailyReport, User } from '../domain/types';

function unsupported<T>(): RepositoryResult<T> {
  return { ok: false, error: { code: 'validation', message: '演示模式不支持此持久化操作' } };
}

export class DemoOkrRepository implements OkrRepository {
  readonly mode = 'demo' as const;

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
  async updateDailyReport(_reportId: string, _expectedRevision: number, _input: DailyReportInput) { return unsupported<{ revision: number }>(); }
  async listReportRevisions(_reportId: string) { return unsupported<unknown[]>(); }
  async saveProgressPlan(_keyResultId: string, _points: Array<{ date: string; value: number }>) { return unsupported<void>(); }
  async saveMilestones(_projectId: string, _milestones: Array<{ title: string; plannedDate: string; keyResultId?: string }>) { return unsupported<void>(); }
  async beginAttachmentUpload(_input: Record<string, unknown>) { return unsupported<unknown>(); }
  async finalizeAttachmentUpload(_id: string, _checksum?: string) { return unsupported<unknown>(); }
  async replaceAttachment(_id: string, _input: Record<string, unknown>) { return unsupported<unknown>(); }
  async removeAttachment(_id: string) { return unsupported<void>(); }
  async createAttachmentDownload(_id: string) { return unsupported<unknown>(); }
}
