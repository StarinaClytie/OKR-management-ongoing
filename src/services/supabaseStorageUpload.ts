import { supabaseAnonKey, supabaseUrl } from '../lib/supabase';

export interface UploadStorageObjectInput {
  bucket: string;
  path: string;
  file: File;
  accessToken: string;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}

function encodeObjectPath(bucket: string, path: string): string {
  const segments = [bucket, ...path.split('/')].map((segment) => encodeURIComponent(segment));
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${segments.join('/')}`;
}

export function uploadStorageObject(input: UploadStorageObjectInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const abortError = () => new Error('Storage upload aborted');
    const cleanup = () => input.signal?.removeEventListener('abort', onSignalAbort);
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onSignalAbort = () => {
      xhr.abort();
      fail(abortError());
    };

    xhr.open('POST', encodeObjectPath(input.bucket, input.path));
    xhr.setRequestHeader('Authorization', `Bearer ${input.accessToken}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('Content-Type', input.file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (event) => {
      if (event.total <= 0) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      // The upload stream can finish before Storage has accepted the object.
      // Reserve 100% for a successful HTTP response so a failed request never
      // leaves the UI looking complete.
      if (percent < 100) input.onProgress(percent);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(100);
        succeed();
      } else {
        fail(new Error(`Storage upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => fail(new Error('Storage upload network error'));
    xhr.onabort = () => fail(abortError());

    if (input.signal) {
      if (input.signal.aborted) {
        onSignalAbort();
        return;
      }
      input.signal.addEventListener('abort', onSignalAbort, { once: true });
    }

    xhr.send(input.file);
  });
}
