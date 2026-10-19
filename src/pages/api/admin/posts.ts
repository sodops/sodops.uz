import type { APIRoute } from 'astro';
import { authenticateAdminRequest } from '../../../lib/auth';
import { getAllPosts, savePost } from '../../../lib/db';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateAdminRequest({
    isDev: import.meta.env.DEV,
    host: request.headers.get('host'),
    jwtAssertion: request.headers.get('Cf-Access-Jwt-Assertion'),
    adminEmails: env.ADMIN_EMAILS || env.ADMIN_EMAIL || 'me@sodops.uz',
    expectedAud: env.CF_ACCESS_AUD,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    devBypassAuth: env.DEV_BYPASS_AUTH === 'true' || import.meta.env.DEV,
  });

  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const posts = await getAllPosts(env.DB);
  return new Response(JSON.stringify({ posts }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateAdminRequest({
    isDev: import.meta.env.DEV,
    host: request.headers.get('host'),
    jwtAssertion: request.headers.get('Cf-Access-Jwt-Assertion'),
    adminEmails: env.ADMIN_EMAILS || env.ADMIN_EMAIL || 'me@sodops.uz',
    expectedAud: env.CF_ACCESS_AUD,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    devBypassAuth: env.DEV_BYPASS_AUTH === 'true' || import.meta.env.DEV,
  });

  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: any = await request.json();
    const content = body.content ?? body.content_markdown;
    if (!body.title || !content || !body.slug) {
      return new Response(
        JSON.stringify({ error: 'Title, content, and slug are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: 'D1 database binding (DB) is not available' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const saved = await savePost(env.DB, {
      title: body.title,
      slug: body.slug,
      content,
      excerpt: body.excerpt,
      cover_image: body.cover_image,
      published: body.published,
      published_at: body.published_at,
      tags: body.tags,
    });

    // Invalidate edge cache tags immediately for instant publishing
    try {
      // Invalidate tags via Cloudflare Worker cache API
      const { cache } = await import('cloudflare:workers');
      if (cache && typeof cache.purge === 'function') {
        await cache.purge({ tags: ['blog', 'home'] });
      }
    } catch {
      // Ignore if cache API not available in local test environment
    }

    return new Response(JSON.stringify({ post: saved }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
