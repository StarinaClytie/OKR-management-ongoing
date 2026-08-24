export interface OssAttachmentTransportOptions {
  getAccessToken(): Promise<string | null>;
  attachmentApiBasePath?: string;
  fetchImpl?: typeof fetch;
  createXhr?: () => XMLHttpRequest;
}

async function jsonRequest<T>(fetchImpl: typeof fetch, token: string, path: string, method: string): Promise<T> {
  const response = await fetchImpl(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) throw new Error(`Attachment API failed (HTTP ${response.status})`);
  return response.status === 204 ? undefined as T : await response.json() as T;
}

function putFile(createXhr: () => XMLHttpRequest, url: string, contentType: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = createXhr();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => { xhr.abort(); finish(new Error('OSS upload aborted')); };
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.total > 0) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? finish() : finish(new Error(`OSS upload failed (HTTP ${xhr.status})`));
    xhr.onerror = () => finish(new Error('OSS upload network error'));
    xhr.onabort = () => finish(new Error('OSS upload aborted'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}

export function createOssAttachmentTransport(options: OssAttachmentTransportOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const createXhr = options.createXhr ?? (() => new XMLHttpRequest());
  const attachmentApiBasePath = options.attachmentApiBasePath ?? '/api/attachments';
  async function token() {
    const value = await options.getAccessToken();
    if (!value) throw new Error('Authentication required');
    return value;
  }
  return {
    async upload(attachmentId: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
      const accessToken = await token();
      const signed = await jsonRequest<{ url: string; contentType: string }>(fetchImpl, accessToken, `${attachmentApiBasePath}/${encodeURIComponent(attachmentId)}/upload-url`, 'POST');
      await putFile(createXhr, signed.url, signed.contentType, file, onProgress, signal);
      await jsonRequest(fetchImpl, accessToken, `${attachmentApiBasePath}/${encodeURIComponent(attachmentId)}/finalize`, 'POST');
      onProgress(100);
    },
    async downloadUrl(attachmentId: string) {
      const accessToken = await token();
      const result = await jsonRequest<{ url: string }>(fetchImpl, accessToken, `${attachmentApiBasePath}/${encodeURIComponent(attachmentId)}/download-url`, 'GET');
      return result.url;
    },
    async remove(attachmentId: string) {
      const accessToken = await token();
      await jsonRequest(fetchImpl, accessToken, `${attachmentApiBasePath}/${encodeURIComponent(attachmentId)}`, 'DELETE');
    },
  };
}

export type OssAttachmentTransport = ReturnType<typeof createOssAttachmentTransport>;
