import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadStorageObject } from './supabaseStorageUpload';

vi.mock('../lib/supabase', () => ({
  supabaseUrl: 'https://project.supabase.test/',
  supabaseAnonKey: 'public-anon-key',
}));

type ProgressHandler = (event: ProgressEvent<EventTarget>) => void;

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | undefined;

  readonly upload = {
    addEventListener: vi.fn((type: string, listener: ProgressHandler) => {
      if (type === 'progress') this.progressHandler = listener;
    }),
  };
  readonly open = vi.fn();
  readonly setRequestHeader = vi.fn();
  readonly send = vi.fn();
  readonly abort = vi.fn(() => this.emitAbort());
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  requestBody: BodyInit | null = null;
  private progressHandler: ProgressHandler | undefined;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  emitProgress(loaded: number, total: number) {
    this.progressHandler?.({ lengthComputable: true, loaded, total } as ProgressEvent<EventTarget>);
  }

  succeed(status: number) {
    this.status = status;
    this.onload?.();
  }

  emitError() {
    this.onerror?.();
  }

  emitAbort() {
    this.onabort?.();
  }
}

describe('uploadStorageObject', () => {
  const originalXhr = globalThis.XMLHttpRequest;

  beforeEach(() => {
    FakeXMLHttpRequest.latest = undefined;
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXhr;
  });

  it('sends authenticated binary data to an encoded Supabase object URL', async () => {
    const file = new File(['evidence'], 'evidence.pdf', { type: 'application/pdf' });
    const promise = uploadStorageObject({
      bucket: 'report-attachments',
      path: 'org/report/folder name/evidence+1.pdf',
      file,
      accessToken: 'access-token',
      onProgress: vi.fn(),
    });
    const xhr = FakeXMLHttpRequest.latest!;

    expect(xhr.open).toHaveBeenCalledWith(
      'POST',
      'https://project.supabase.test/storage/v1/object/report-attachments/org/report/folder%20name/evidence%2B1.pdf',
    );
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer access-token');
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('apikey', 'public-anon-key');
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(xhr.send).toHaveBeenCalledWith(file);

    xhr.succeed(201);
    await expect(promise).resolves.toBeUndefined();
  });

  it('reports rounded upload progress but waits to report 100 until 2xx succeeds', async () => {
    const onProgress = vi.fn();
    const promise = uploadStorageObject({
      bucket: 'bucket',
      path: 'nested/object.bin',
      file: new File(['123'], 'object.bin', { type: 'application/octet-stream' }),
      accessToken: 'token',
      onProgress,
    });
    const xhr = FakeXMLHttpRequest.latest!;

    xhr.emitProgress(1, 3);
    xhr.emitProgress(3, 3);
    expect(onProgress).toHaveBeenCalledWith(33);
    expect(onProgress).not.toHaveBeenCalledWith(100);

    xhr.succeed(204);
    await expect(promise).resolves.toBeUndefined();
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it.each([199, 300, 500])('rejects for HTTP status %s', async (status) => {
    const promise = uploadStorageObject({
      bucket: 'bucket',
      path: 'object.bin',
      file: new File(['123'], 'object.bin', { type: 'application/octet-stream' }),
      accessToken: 'token',
      onProgress: vi.fn(),
    });
    FakeXMLHttpRequest.latest!.succeed(status);

    await expect(promise).rejects.toThrow(`Storage upload failed (HTTP ${status})`);
  });

  it('rejects network and XHR abort failures', async () => {
    const networkPromise = uploadStorageObject({
      bucket: 'bucket',
      path: 'network.bin',
      file: new File(['123'], 'network.bin', { type: 'application/octet-stream' }),
      accessToken: 'token',
      onProgress: vi.fn(),
    });
    FakeXMLHttpRequest.latest!.emitError();
    await expect(networkPromise).rejects.toThrow('Storage upload network error');

    const abortPromise = uploadStorageObject({
      bucket: 'bucket',
      path: 'abort.bin',
      file: new File(['123'], 'abort.bin', { type: 'application/octet-stream' }),
      accessToken: 'token',
      onProgress: vi.fn(),
    });
    FakeXMLHttpRequest.latest!.emitAbort();
    await expect(abortPromise).rejects.toThrow('Storage upload aborted');
  });

  it('aborts and rejects when the caller signal is cancelled', async () => {
    const controller = new AbortController();
    const promise = uploadStorageObject({
      bucket: 'bucket',
      path: 'cancelled.bin',
      file: new File(['123'], 'cancelled.bin', { type: 'application/octet-stream' }),
      accessToken: 'token',
      onProgress: vi.fn(),
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow('Storage upload aborted');
    expect(FakeXMLHttpRequest.latest!.abort).toHaveBeenCalledTimes(1);
  });
});
