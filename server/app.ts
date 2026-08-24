import express, { type Request, type Response } from 'express';
import type { AuthorizedAttachment, OssObjectStore, RpcResult } from './types.js';

type Operation = 'upload' | 'download' | 'delete';
export interface AttachmentApiDependencies {
  authenticate(header: string | undefined): Promise<{ token: string; userId: string } | null>;
  authorize(token: string, operation: Operation, attachmentId: string): Promise<RpcResult<AuthorizedAttachment>>;
  confirmUpload(id: string, checksum: string, mimeType: string, byteSize: number): Promise<RpcResult<void>>;
  confirmDeletion(id: string): Promise<RpcResult<void>>;
  oss: OssObjectStore;
}

function attachmentId(req: Request): string { return String(req.params.attachmentId || ''); }

export function createApp(deps: AttachmentApiDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  async function context(req: Request, res: Response, operation: Operation) {
    const caller = await deps.authenticate(req.header('authorization'));
    if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    const authorized = await deps.authorize(caller.token, operation, attachmentId(req));
    if (!authorized.ok || !authorized.data) {
      res.status(authorized.status || 403).json({ error: authorized.message || 'Forbidden' });
      return null;
    }
    return authorized.data;
  }

  app.post('/api/attachments/:attachmentId/upload-url', async (req, res) => {
    try {
      const target = await context(req, res, 'upload'); if (!target) return;
      const expiresIn = 300;
      const url = await deps.oss.signPut(target.path, target.mimeType, expiresIn);
      res.json({ url, method: 'PUT', contentType: target.mimeType, expiresIn });
    } catch { res.status(502).json({ error: 'OSS signing failed' }); }
  });

  app.post('/api/attachments/:attachmentId/finalize', async (req, res) => {
    try {
      const target = await context(req, res, 'upload'); if (!target) return;
      const object = await deps.oss.head(target.path);
      if (object.byteSize !== target.byteSize || (object.mimeType && object.mimeType !== target.mimeType)) {
        res.status(422).json({ error: 'Uploaded object metadata mismatch' }); return;
      }
      const confirmed = await deps.confirmUpload(target.id, object.etag, target.mimeType, target.byteSize);
      if (!confirmed.ok) { res.status(confirmed.status || 500).json({ error: confirmed.message || 'Finalization failed' }); return; }
      res.json({ id: target.id, state: 'uploaded' });
    } catch { res.status(502).json({ error: 'OSS verification failed' }); }
  });

  app.get('/api/attachments/:attachmentId/download-url', async (req, res) => {
    try {
      const target = await context(req, res, 'download'); if (!target) return;
      const expiresIn = target.expiresIn || 60;
      const url = await deps.oss.signGet(target.path, expiresIn, target.originalName);
      res.json({ url, expiresIn });
    } catch { res.status(502).json({ error: 'OSS signing failed' }); }
  });

  app.delete('/api/attachments/:attachmentId', async (req, res) => {
    try {
      const target = await context(req, res, 'delete'); if (!target) return;
      if (!target.alreadyDeleted) await deps.oss.delete(target.path);
      const confirmed = await deps.confirmDeletion(target.id);
      if (!confirmed.ok) { res.status(confirmed.status || 500).json({ error: confirmed.message || 'Deletion confirmation failed' }); return; }
      res.status(204).end();
    } catch { res.status(502).json({ error: 'OSS deletion failed' }); }
  });
  return app;
}
