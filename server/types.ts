export type AttachmentKind = 'daily' | 'resource';
export type AttachmentOperation = 'upload' | 'download' | 'delete';

export interface AuthorizedAttachment {
  id: string;
  path: string;
  mimeType: string;
  byteSize: number;
  originalName?: string;
  fileName?: string;
  expiresIn?: number;
  alreadyDeleted?: boolean;
}

export interface RpcResult<T> {
  ok: boolean;
  data?: T;
  status?: number;
  message?: string;
}

export interface OssObjectStore {
  signPut(path: string, contentType: string, expiresIn: number): Promise<string>;
  head(path: string): Promise<{ byteSize: number; mimeType: string; etag: string }>;
  signGet(path: string, expiresIn: number, filename?: string): Promise<string>;
  delete(path: string): Promise<void>;
}
