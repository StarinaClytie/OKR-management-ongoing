// @vitest-environment node
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, type AttachmentApiDependencies } from './app';

function dependencies(): AttachmentApiDependencies {
  return {
    authenticate: vi.fn(async (header) => header === 'Bearer valid' ? { token: 'valid', userId: 'user-1' } : null),
    authorize: vi.fn(async (_token, operation) => ({ ok: true, data: {
      id: 'attachment-1', path: 'organization/o/reports/r/attachment-1/file.pdf', mimeType: 'application/pdf', byteSize: 4,
      originalName: 'file.pdf', expiresIn: operation === 'download' ? 60 : undefined,
    } })),
    confirmUpload: vi.fn(async () => ({ ok: true })),
    confirmDeletion: vi.fn(async () => ({ ok: true })),
    oss: {
      signPut: vi.fn(async () => 'https://oss.example/upload'),
      head: vi.fn(async () => ({ byteSize: 4, mimeType: 'application/pdf', etag: 'etag' })),
      signGet: vi.fn(async () => 'https://oss.example/download'),
      delete: vi.fn(async () => undefined),
    },
  };
}

function resourceDependencies(): AttachmentApiDependencies {
  const deps = dependencies();
  deps.authorize = vi.fn(async (_token, operation) => ({ ok: true, data: {
    id: 'resource-attachment-1', path: 'organization/o/resources/resource-1/resource-attachment-1/manual.pdf',
    mimeType: 'application/pdf', byteSize: 4,
    fileName: 'manual.pdf', expiresIn: operation === 'download' ? 60 : undefined,
  } }));
  return deps;
}

describe('attachment API', () => {
  it('rejects missing and invalid bearer tokens', async () => {
    const app = createApp(dependencies());
    expect((await request(app).post('/api/attachments/attachment-1/upload-url')).status).toBe(401);
    expect((await request(app).post('/api/attachments/attachment-1/upload-url').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });
  it('signs only the database-authorized upload path', async () => {
    const deps = dependencies();
    const response = await request(createApp(deps)).post('/api/attachments/attachment-1/upload-url')
      .set('Authorization', 'Bearer valid').send({ path: 'attacker/path' });
    expect(response.body).toEqual({ url: 'https://oss.example/upload', method: 'PUT', contentType: 'application/pdf', expiresIn: 300 });
    expect(deps.oss.signPut).toHaveBeenCalledWith('organization/o/reports/r/attachment-1/file.pdf', 'application/pdf', 300);
  });
  it('verifies HEAD metadata before confirming upload', async () => {
    const deps = dependencies();
    expect((await request(createApp(deps)).post('/api/attachments/attachment-1/finalize').set('Authorization', 'Bearer valid')).status).toBe(200);
    expect(deps.confirmUpload).toHaveBeenCalledWith('attachment-1', 'etag', 'application/pdf', 4, 'daily');
  });
  it('rejects byte-size mismatches without confirming', async () => {
    const deps = dependencies();
    deps.oss.head = vi.fn(async () => ({ byteSize: 3, mimeType: 'application/pdf', etag: 'etag' }));
    expect((await request(createApp(deps)).post('/api/attachments/attachment-1/finalize').set('Authorization', 'Bearer valid')).status).toBe(422);
    expect(deps.confirmUpload).not.toHaveBeenCalled();
  });
  it('signs authorized downloads and confirms deletion only after OSS succeeds', async () => {
    const deps = dependencies();
    expect((await request(createApp(deps)).get('/api/attachments/attachment-1/download-url').set('Authorization', 'Bearer valid')).body.url).toBe('https://oss.example/download');
    expect((await request(createApp(deps)).delete('/api/attachments/attachment-1').set('Authorization', 'Bearer valid')).status).toBe(204);
    expect(deps.confirmDeletion).toHaveBeenCalledWith('attachment-1', 'daily');
  });
  it('does not confirm deletion when OSS fails', async () => {
    const deps = dependencies();
    deps.oss.delete = vi.fn(async () => { throw new Error('OSS unavailable'); });
    expect((await request(createApp(deps)).delete('/api/attachments/attachment-1').set('Authorization', 'Bearer valid')).status).toBe(502);
    expect(deps.confirmDeletion).not.toHaveBeenCalled();
  });
});

describe('resource attachment API', () => {
  it('rejects missing and invalid bearer tokens', async () => {
    const app = createApp(resourceDependencies());
    expect((await request(app).post('/api/resource-attachments/resource-attachment-1/upload-url')).status).toBe(401);
    expect((await request(app).post('/api/resource-attachments/resource-attachment-1/upload-url').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });

  it('signs only the database-authorized resource path', async () => {
    const deps = resourceDependencies();
    const response = await request(createApp(deps)).post('/api/resource-attachments/resource-attachment-1/upload-url')
      .set('Authorization', 'Bearer valid').send({ path: 'attacker/path' });

    expect(response.body).toEqual({ url: 'https://oss.example/upload', method: 'PUT', contentType: 'application/pdf', expiresIn: 300 });
    expect(deps.oss.signPut).toHaveBeenCalledWith('organization/o/resources/resource-1/resource-attachment-1/manual.pdf', 'application/pdf', 300);
    expect(deps.authorize).toHaveBeenCalledWith('valid', 'upload', 'resource-attachment-1', 'resource');
  });

  it.each([
    [{ byteSize: 3, mimeType: 'application/pdf', etag: 'etag' }, 'byte size'],
    [{ byteSize: 4, mimeType: 'text/plain', etag: 'etag' }, 'MIME type'],
  ])('rejects a resource upload when the OSS HEAD %s mismatches', async (object) => {
    const deps = resourceDependencies();
    deps.oss.head = vi.fn(async () => object);

    expect((await request(createApp(deps)).post('/api/resource-attachments/resource-attachment-1/finalize')
      .set('Authorization', 'Bearer valid')).status).toBe(422);
    expect(deps.confirmUpload).not.toHaveBeenCalled();
  });

  it('confirms a verified resource upload with the resource RPC family', async () => {
    const deps = resourceDependencies();

    expect((await request(createApp(deps)).post('/api/resource-attachments/resource-attachment-1/finalize')
      .set('Authorization', 'Bearer valid')).status).toBe(200);
    expect(deps.confirmUpload).toHaveBeenCalledWith('resource-attachment-1', 'etag', 'application/pdf', 4, 'resource');
  });

  it('signs authorized resource downloads', async () => {
    const deps = resourceDependencies();
    const response = await request(createApp(deps)).get('/api/resource-attachments/resource-attachment-1/download-url')
      .set('Authorization', 'Bearer valid');

    expect(response.body).toEqual({ url: 'https://oss.example/download', expiresIn: 60 });
    expect(deps.oss.signGet).toHaveBeenCalledWith('organization/o/resources/resource-1/resource-attachment-1/manual.pdf', 60, 'manual.pdf');
    expect(deps.authorize).toHaveBeenCalledWith('valid', 'download', 'resource-attachment-1', 'resource');
  });

  it('confirms resource deletion after OSS deletion succeeds', async () => {
    const deps = resourceDependencies();
    expect((await request(createApp(deps)).delete('/api/resource-attachments/resource-attachment-1')
      .set('Authorization', 'Bearer valid')).status).toBe(204);
    expect(deps.confirmDeletion).toHaveBeenCalledWith('resource-attachment-1', 'resource');
  });

  it('does not confirm resource deletion when OSS deletion fails', async () => {
    const deps = resourceDependencies();
    deps.oss.delete = vi.fn(async () => { throw new Error('OSS unavailable'); });

    expect((await request(createApp(deps)).delete('/api/resource-attachments/resource-attachment-1')
      .set('Authorization', 'Bearer valid')).status).toBe(502);
    expect(deps.confirmDeletion).not.toHaveBeenCalled();
  });
});
