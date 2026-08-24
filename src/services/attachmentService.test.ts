import { describe, expect, it, vi } from 'vitest';
import { AttachmentService, sanitizeFilename, validateAttachment, validateEvidenceLink } from './attachmentService';

const allowed = [
  ['a.pdf', 'application/pdf'], ['a.doc', 'application/msword'], ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['a.xls', 'application/vnd.ms-excel'], ['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['a.csv', 'text/csv'],
  ['a.png', 'image/png'], ['a.jpg', 'image/jpeg'], ['a.jpeg', 'image/jpeg'], ['a.txt', 'text/plain'],
] as const;

describe('attachment validation', () => {
  it.each(allowed)('accepts %s with matching %s', (name, type) => expect(validateAttachment(new File(['x'], name, { type }))).toBeNull());
  it('rejects executable and extension/MIME polyglot mismatches', () => {
    expect(validateAttachment(new File(['x'], 'payload.exe', { type: 'application/x-msdownload' }))?.code).toBe('unsupported_type');
    expect(validateAttachment(new File(['x'], 'photo.png', { type: 'application/pdf' }))?.code).toBe('type_mismatch');
  });
  it('accepts exactly 100 MB and rejects zero or 100 MB plus one byte', () => {
    expect(validateAttachment(new File([new Uint8Array(100 * 1024 * 1024)], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
    expect(validateAttachment(new File([], 'a.pdf', { type: 'application/pdf' }))?.code).toBe('empty');
    expect(validateAttachment(new File([new Uint8Array(100 * 1024 * 1024 + 1)], 'a.pdf', { type: 'application/pdf' }))?.message).toBe('文件不能超过 100 MB');
  });
  it('requires HTTPS links and sanitizes path-bearing filenames', () => {
    expect(validateEvidenceLink('https://example.com/evidence')).toBeNull();
    expect(validateEvidenceLink('http://example.com')?.code).toBe('https_required');
    expect(sanitizeFilename('../机密/ evidence?.pdf')).toBe('evidence_.pdf');
  });
});

it('runs selected → pending → uploading → uploaded and reports progress', async () => {
  const repository = {
    beginAttachmentUpload: vi.fn().mockResolvedValue({ ok: true, data: { id: 'a-1', path: 'server/path.pdf' } }),
    finalizeAttachmentUpload: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    removeAttachment: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
  const upload = vi.fn(async (_path, _file, onProgress) => { onProgress(50); onProgress(100); return { ok: true }; });
  const states: string[] = [];
  const service = new AttachmentService(repository as never, { upload } as never);
  const result = await service.uploadAttachment('report-1', new File(['x'], 'evidence.pdf', { type: 'application/pdf' }), 'confidential', (state) => states.push(`${state.state}:${state.progress}`));
  expect(result.state).toBe('uploaded');
  expect(states).toEqual(expect.arrayContaining(['pending:0', 'uploading:50', 'uploading:100', 'uploaded:100']));
  expect(upload).toHaveBeenCalledWith('a-1', expect.any(File), expect.any(Function), expect.any(AbortSignal));
});

it('supports retry, replacement, removal and authorized signed downloads', async () => {
  const repository = {
    beginAttachmentUpload: vi.fn().mockResolvedValue({ ok: true, data: { id: 'a-retry', path: 'retry.pdf', bucket: 'report-attachments' } }),
    replaceAttachment: vi.fn().mockResolvedValue({ ok: true, data: { id: 'a-new', path: 'new.pdf', bucket: 'report-attachments' } }),
    finalizeAttachmentUpload: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    removeAttachment: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    createAttachmentDownload: vi.fn().mockResolvedValue({ ok: true, data: { url: 'https://storage.example/signed' } }),
  };
  const storage = { upload: vi.fn(async (_path, _file, onProgress) => { onProgress(100); return { ok: true }; }), remove: vi.fn().mockResolvedValue({ ok: true }) };
  const service = new AttachmentService(repository as never, storage as never);
  const failed = { localId: 'local', file: new File(['x'], 'a.pdf', { type: 'application/pdf' }), classification: 'internal' as const, state: 'failed' as const, progress: 0 };
  expect((await service.retryAttachment('report-1', failed, vi.fn())).state).toBe('uploaded');
  expect((await service.replaceAttachment('a-old', failed.file, 'confidential', vi.fn())).attachmentId).toBe('a-new');
  expect(await service.removeAttachment('a-new')).toEqual({ ok: true, data: undefined });
  expect(await service.createDownloadUrl('a-new')).toEqual({ ok: true, data: { url: 'https://storage.example/signed' } });
  expect(storage.remove).toHaveBeenCalledWith('a-new');
});
