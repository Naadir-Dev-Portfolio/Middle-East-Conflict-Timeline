import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** The same data file is served by both dev and production preview; it is never baked into a bundle. */
export function timelineFileMiddleware(filePath) {
  return async (request, response, next) => {
    if (request.url?.split('?')[0] !== '/timeline.json') return next();
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405).end();
      return;
    }
    try {
      const contents = await readFile(filePath);
      const etag = '"' + createHash('sha256').update(contents).digest('hex') + '"';
      response.setHeader('ETag', etag);
      if (request.headers['if-none-match'] === etag) {
        response.writeHead(304).end();
        return;
      }
      response.setHeader('Content-Length', contents.length);
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : contents);
    } catch {
      response.writeHead(503).end(JSON.stringify({ error: 'data/timeline.json is unavailable. Restore it in the data folder.' }));
    }
  };
}
