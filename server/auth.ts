import { createClient } from '@supabase/supabase-js';
import type { ServerConfig } from './config.js';
import type { AttachmentKind, AttachmentOperation, AuthorizedAttachment, RpcResult } from './types.js';

const rpcNames: Record<AttachmentKind, Record<AttachmentOperation, string>> = {
  daily: {
    upload: 'authorize_attachment_object_upload',
    download: 'authorize_attachment_object_download',
    delete: 'request_attachment_object_deletion',
  },
  resource: {
    upload: 'authorize_resource_attachment_object_upload',
    download: 'authorize_resource_attachment_object_download',
    delete: 'request_resource_attachment_object_deletion',
  },
};

const confirmUploadRpcNames: Record<AttachmentKind, string> = {
  daily: 'confirm_attachment_object_upload',
  resource: 'confirm_resource_attachment_object_upload',
};

const confirmDeletionRpcNames: Record<AttachmentKind, string> = {
  daily: 'confirm_attachment_object_deletion',
  resource: 'confirm_resource_attachment_object_deletion',
};

export function createDatabaseGateway(config: ServerConfig) {
  const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const service = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(header: string | undefined) {
      const match = /^Bearer\s+(.+)$/i.exec(header || '');
      if (!match) return null;
      const { data, error } = await anon.auth.getUser(match[1]);
      return error || !data.user ? null : { token: match[1], userId: data.user.id };
    },
    async authorize(token: string, operation: AttachmentOperation, attachmentId: string, kind: AttachmentKind): Promise<RpcResult<AuthorizedAttachment>> {
      const caller = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await caller.rpc(rpcNames[kind][operation], { p_attachment_id: attachmentId });
      if (error) return { ok: false, status: error.code === '42501' ? 403 : 400, message: error.message };
      return { ok: true, data: data as AuthorizedAttachment };
    },
    async confirmUpload(id: string, checksum: string, mimeType: string, byteSize: number, kind: AttachmentKind): Promise<RpcResult<void>> {
      const { error } = await service.rpc(confirmUploadRpcNames[kind], {
        p_attachment_id: id, p_checksum: checksum || null, p_mime_type: mimeType, p_byte_size: byteSize,
      });
      return error ? { ok: false, status: 500, message: error.message } : { ok: true };
    },
    async confirmDeletion(id: string, kind: AttachmentKind): Promise<RpcResult<void>> {
      const { error } = await service.rpc(confirmDeletionRpcNames[kind], { p_attachment_id: id });
      return error ? { ok: false, status: 500, message: error.message } : { ok: true };
    },
  };
}
