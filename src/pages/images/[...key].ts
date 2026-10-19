import type { APIRoute } from 'astro';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { key } = params;
  if (!key) {
    return new Response('Not found', { status: 404 });
  }

  if (!env.UPLOADS_BUCKET) {
    return new Response('R2 storage is not configured', { status: 503 });
  }

  const object = await env.UPLOADS_BUCKET.get(key);
  if (!object) {
    return new Response('Image not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers as any);
  headers.set('etag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body as unknown as BodyInit, { headers });
};
