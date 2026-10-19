import type { APIRoute } from 'astro';
import { authenticateAdminRequest } from '../../../lib/auth';
import { validateImageUpload } from '../../../lib/upload';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateAdminRequest({
    isDev: import.meta.env.DEV,
    host: request.headers.get('host'),
    jwtAssertion: request.headers.get('Cf-Access-Jwt-Assertion'),
    adminEmail: env.ADMIN_EMAIL || 'me@sodops.uz',
    expectedAud: env.CF_ACCESS_AUD,
    devBypassAuth: env.DEV_BYPASS_AUTH === 'true' || import.meta.env.DEV,
  });

  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const validation = validateImageUpload(buffer, file.type);

    if (!validation.valid || !validation.mimeType || !validation.extension) {
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid image file' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedBase = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .toLowerCase();
    const key = `posts/${Date.now()}-${sanitizedBase}.${validation.extension}`;

    if (env.UPLOADS_BUCKET) {
      await env.UPLOADS_BUCKET.put(key, buffer, {
        httpMetadata: {
          contentType: validation.mimeType,
        },
      });
    }

    const publicUrl = `/images/${key}`;
    return new Response(
      JSON.stringify({
        url: publicUrl,
        key,
        mimeType: validation.mimeType,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Upload failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
