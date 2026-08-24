import OSS from 'ali-oss';
import type { ServerConfig } from './config.js';
import type { OssObjectStore } from './types.js';

export function createOssObjectStore(config: ServerConfig): OssObjectStore {
  const client = new OSS({
    accessKeyId: config.ossAccessKeyId,
    accessKeySecret: config.ossAccessKeySecret,
    bucket: config.ossBucket,
    region: config.ossRegion,
    endpoint: config.ossEndpoint,
    secure: true,
  });
  return {
    async signPut(path, contentType, expiresIn) {
      return client.signatureUrl(path, { method: 'PUT', expires: expiresIn, 'Content-Type': contentType });
    },
    async head(path) {
      const result = await client.head(path);
      const headers = result.res.headers as Record<string, string | number | undefined>;
      return {
        byteSize: Number(headers['content-length']),
        mimeType: String(headers['content-type'] || ''),
        etag: String(headers.etag || '').replace(/^"|"$/g, ''),
      };
    },
    async signGet(path, expiresIn, filename) {
      const disposition = filename ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` : undefined;
      return client.signatureUrl(path, {
        method: 'GET', expires: expiresIn,
        ...(disposition ? { response: { 'content-disposition': disposition } } : {}),
      });
    },
    async delete(path) { await client.delete(path); },
  };
}
