import type { APIRoute } from 'astro';
import { authenticateAdminRequest } from '../../../lib/auth';
import { getAllPosts } from '../../../lib/db';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
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
