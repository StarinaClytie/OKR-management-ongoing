import type { Classification } from '../domain/types';
import type { OkrRepository } from '../data/types';

const MAX_BYTES = 100 * 1024 * 1024;
const allowedTypes: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain',
};
export interface ValidationError { code: 'empty' | 'too_large' | 'unsupported_type' | 'type_mismatch' | 'https_required' | 'invalid_url'; message: string }

export function sanitizeFilename(name: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').at(-1) ?? '';
  return leaf.normalize('NFKD').replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\.{2,}/g, '.').replace(/^[ .-]+|[ .-]+$/g, '').slice(0, 180);
}
export function validateAttachment(file: File): ValidationError | null {
  if (file.size === 0) return { code: 'empty', message: '文件不能为空' };
  if (file.size > MAX_BYTES) return { code: 'too_large', message: '文件不能超过 100 MB' };
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const expected = allowedTypes[extension];
  if (!expected) return { code: 'unsupported_type', message: '不支持此文件类型' };
  if (file.type !== expected) return { code: 'type_mismatch', message: '文件扩展名与内容类型不一致' };
  return null;
}
export function validateEvidenceLink(value: string): ValidationError | null {
  try { const url = new URL(value); return url.protocol === 'https:' ? null : { code: 'https_required', message: '链接必须使用 HTTPS' }; }
  catch { return { code: 'invalid_url', message: '请输入有效链接' }; }
}

export type UploadState = 'selected' | 'pending' | 'uploading' | 'uploaded' | 'failed' | 'deleting';
export interface AttachmentUploadState { localId: string; attachmentId?: string; file: File; classification: Classification; state: UploadState; progress: number; error?: string }
export interface StorageTransport {
  upload(attachmentId: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal): Promise<{ ok: boolean; error?: string }>;
  remove?(attachmentId: string): Promise<{ ok: boolean; error?: string }>;
  downloadUrl?(attachmentId: string): Promise<string>;
}

export class AttachmentService {
  constructor(private repository: OkrRepository, private storage: StorageTransport) {}
  async uploadAttachment(reportId: string, file: File, classification: Classification, onState: (state: AttachmentUploadState) => void, signal = new AbortController().signal): Promise<AttachmentUploadState> {
    let state: AttachmentUploadState = { localId: crypto.randomUUID(), file, classification, state: 'selected', progress: 0 };
    const emit = (patch: Partial<AttachmentUploadState>) => { state = { ...state, ...patch }; onState(state); };
    const invalid = validateAttachment(file);
    if (invalid) { emit({ state: 'failed', error: invalid.message }); return state; }
    emit({ state: 'pending' });
    const pending = await this.repository.beginAttachmentUpload({ p_report_id: reportId, p_original_name: sanitizeFilename(file.name), p_mime_type: file.type, p_byte_size: file.size, p_classification: classification });
    if (!pending.ok) { emit({ state: 'failed', error: pending.error.message }); return state; }
    const metadata = pending.data;
    emit({ attachmentId: metadata.id, state: 'uploading' });
    const uploaded = await this.storage.upload(metadata.id, file, (progress) => emit({ state: 'uploading', progress }), signal);
    if (!uploaded.ok) { await this.repository.removeAttachment(metadata.id); emit({ state: 'failed', error: uploaded.error ?? '上传失败' }); return state; }
    emit({ state: 'uploaded', progress: 100 });
    return state;
  }

  retryAttachment(reportId: string, state: AttachmentUploadState, onState: (state: AttachmentUploadState) => void, signal?: AbortSignal) {
    return this.uploadAttachment(reportId, state.file, state.classification, onState, signal);
  }

  async replaceAttachment(attachmentId: string, file: File, classification: Classification, onState: (state: AttachmentUploadState) => void, signal = new AbortController().signal) {
    let state: AttachmentUploadState = { localId: crypto.randomUUID(), file, classification, state: 'selected', progress: 0 };
    const emit = (patch: Partial<AttachmentUploadState>) => { state = { ...state, ...patch }; onState(state); };
    const invalid = validateAttachment(file);
    if (invalid) { emit({ state: 'failed', error: invalid.message }); return state; }
    emit({ state: 'pending' });
    const pending = await this.repository.replaceAttachment(attachmentId, { p_original_name: sanitizeFilename(file.name), p_mime_type: file.type, p_byte_size: file.size, p_classification: classification });
    if (!pending.ok) { emit({ state: 'failed', error: pending.error.message }); return state; }
    const metadata = pending.data as { id: string; path: string };
    emit({ attachmentId: metadata.id, state: 'uploading' });
    const uploaded = await this.storage.upload(metadata.id, file, (progress) => emit({ progress }), signal);
    if (!uploaded.ok) { await this.repository.removeAttachment(metadata.id); emit({ state: 'failed', error: uploaded.error ?? '上传失败' }); return state; }
    emit({ state: 'uploaded', progress: 100 });
    return state;
  }

  async removeAttachment(attachmentId: string) {
    if (this.storage.remove) {
      const object = await this.storage.remove(attachmentId);
      if (!object.ok) return { ok: false as const, error: { code: 'unknown' as const, message: object.error ?? '附件对象删除失败' } };
      return { ok: true as const, data: undefined };
    }
    return this.repository.removeAttachment(attachmentId);
  }

  async createDownloadUrl(attachmentId: string) {
    if (!this.storage.downloadUrl) return this.repository.createAttachmentDownload(attachmentId);
    try { return { ok: true as const, data: { url: await this.storage.downloadUrl(attachmentId) } }; }
    catch { return { ok: false as const, error: { code: 'storage' as const, message: '请求未完成，请稍后重试' } }; }
  }
}
