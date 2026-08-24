import { describe, expect, it, vi } from 'vitest';
import { createOssAttachmentTransport } from './ossAttachmentTransport';

class FakeXhr {
  upload = { addEventListener: vi.fn((_name: string, listener: (event: ProgressEvent) => void) => { this.progress = listener; }) };
  status = 200; onload?: () => void; onerror?: () => void; onabort?: () => void;
  progress?: (event: ProgressEvent) => void;
  open = vi.fn(); setRequestHeader = vi.fn(); abort = vi.fn();
  send = vi.fn(() => { this.progress?.({ loaded: 50, total: 100 } as ProgressEvent); this.onload?.(); });
}

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: vi.fn(async () => body) } as unknown as Response;
}

describe('OSS attachment transport', () => {
  it('requests a signed URL, uploads directly with progress, then finalizes', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ url: 'https://oss.example/signed', contentType: 'application/pdf' }))
      .mockResolvedValueOnce(response({ state: 'uploaded' }));
    const xhr = new FakeXhr();
    const transport = createOssAttachmentTransport({ getAccessToken: async () => 'token', fetchImpl, createXhr: () => xhr as never });
    const progress: number[] = [];
    await transport.upload('attachment-1', new File(['data'], 'a.pdf', { type: 'application/pdf' }), (value) => progress.push(value), new AbortController().signal);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/attachments/attachment-1/upload-url', expect.objectContaining({ method: 'POST' }));
    expect(xhr.open).toHaveBeenCalledWith('PUT', 'https://oss.example/signed');
    expect(progress).toContain(50);
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/attachments/attachment-1/finalize', expect.objectContaining({ method: 'POST' }));
    expect(progress.at(-1)).toBe(100);
  });
  it('exposes signed downloads and server-coordinated deletion', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ url: 'https://oss.example/download' }))
      .mockResolvedValueOnce(response(null, true, 204));
    const transport = createOssAttachmentTransport({ getAccessToken: async () => 'token', fetchImpl });
    expect(await transport.downloadUrl('attachment-1')).toBe('https://oss.example/download');
    await transport.remove('attachment-1');
    expect(fetchImpl).toHaveBeenLastCalledWith('/api/attachments/attachment-1', expect.objectContaining({ method: 'DELETE' }));
  });
  it('rejects signing and finalize failures', async () => {
    const signingFailure = createOssAttachmentTransport({ getAccessToken: async () => 'token', fetchImpl: vi.fn(async () => response({}, false, 403)) });
    await expect(signingFailure.upload('a', new File(['x'], 'a.pdf'), vi.fn(), new AbortController().signal)).rejects.toThrow('HTTP 403');
  });
});
