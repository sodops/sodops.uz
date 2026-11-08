import type { APIRoute } from 'astro';
import { resolveAdminAuth } from '../../../lib/admin-request-auth';
import { getAllPosts } from '../../../lib/db';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await resolveAdminAuth(request, locals);

  if (!auth.authenticated) {
    console.warn(`[Admin API Guard] ${auth.statusCode || 401}: ${auth.error}`);
    return new Response(JSON.stringify({ error: auth.statusCode === 403 ? 'Forbidden' : 'Unauthorized' }), {
      status: auth.statusCode || 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const posts = await getAllPosts(env.DB);
  const backup = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    site: 'sodops.uz',
    count: posts.length,
    posts,
  };

  const filename = `sodops-backup-${new Date().toISOString().split('T')[0]}.json`;

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
