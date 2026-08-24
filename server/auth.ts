import { createClient } from '@supabase/supabase-js';
import type { ServerConfig } from './config.js';
import type { AuthorizedAttachment, RpcResult } from './types.js';

type Operation = 'upload' | 'download' | 'delete';
const rpcNames: Record<Operation, string> = {
  upload: 'authorize_attachment_object_upload',
  download: 'authorize_attachment_object_download',
  delete: 'request_attachment_object_deletion',
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
    async authorize(token: string, operation: Operation, attachmentId: string): Promise<RpcResult<AuthorizedAttachment>> {
      const caller = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await caller.rpc(rpcNames[operation], { p_attachment_id: attachmentId });
      if (error) return { ok: false, status: error.code === '42501' ? 403 : 400, message: error.message };
      return { ok: true, data: data as AuthorizedAttachment };
    },
    async confirmUpload(id: string, checksum: string, mimeType: string, byteSize: number): Promise<RpcResult<void>> {
      const { error } = await service.rpc('confirm_attachment_object_upload', {
        p_attachment_id: id, p_checksum: checksum || null, p_mime_type: mimeType, p_byte_size: byteSize,
      });
      return error ? { ok: false, status: 500, message: error.message } : { ok: true };
    },
    async confirmDeletion(id: string): Promise<RpcResult<void>> {
      const { error } = await service.rpc('confirm_attachment_object_deletion', { p_attachment_id: id });
      return error ? { ok: false, status: 500, message: error.message } : { ok: true };
    },
  };
}
