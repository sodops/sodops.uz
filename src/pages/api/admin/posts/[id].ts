import type { APIRoute } from 'astro';
import { authenticateAdminRequest } from '../../../../lib/auth';
import { getPostById, savePost, deletePost } from '../../../../lib/db';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const auth = (locals as any)?.auth || await authenticateAdminRequest({
    isDev: import.meta.env.DEV,
    host: request.headers.get('host'),
    jwtAssertion: request.headers.get('Cf-Access-Jwt-Assertion'),
    adminEmails: env.ADMIN_EMAILS || env.ADMIN_EMAIL,
    expectedAud: env.CF_ACCESS_AUD,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    devBypassAuth: env.DEV_BYPASS_AUTH === 'true' || import.meta.env.DEV,
  });

  if (!auth.authenticated) {
    console.warn(`[Admin API Guard] ${auth.statusCode || 401}: ${auth.error}`);
    return new Response(JSON.stringify({ error: auth.statusCode === 403 ? 'Forbidden' : 'Unauthorized' }), {
      status: auth.statusCode || 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Post ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const post = await getPostById(env.DB, id);
  if (!post) {
    return new Response(JSON.stringify({ error: 'Post not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ post }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const auth = (locals as any)?.auth || await authenticateAdminRequest({
    isDev: import.meta.env.DEV,
    host: request.headers.get('host'),
    jwtAssertion: request.headers.get('Cf-Access-Jwt-Assertion'),
    adminEmails: env.ADMIN_EMAILS || env.ADMIN_EMAIL,
    expectedAud: env.CF_ACCESS_AUD,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    devBypassAuth: env.DEV_BYPASS_AUTH === 'true' || import.meta.env.DEV,
  });

  if (!auth.authenticated) {
    console.warn(`[Admin API Guard] ${auth.statusCode || 401}: ${auth.error}`);
    return new Response(JSON.stringify({ error: auth.statusCode === 403 ? 'Forbidden' : 'Unauthorized' }), {
      status: auth.statusCode || 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Post ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB unavailable' }), {
      status: 500,
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

    const MAX_CONTENT_BYTES = 64 * 1024; // 64 KB limit (~12,000 words)
    const contentBytes = new TextEncoder().encode(content).length;
    if (contentBytes > MAX_CONTENT_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Post content exceeds the 64 KB limit (${Math.round(contentBytes / 1024)} KB submitted). Please shorten the content or split into multiple posts.`,
        }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const saved = await savePost(env.DB, {
      id,
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
      const { cache } = await import('cloudflare:workers');
      if (cache && typeof cache.purge === 'function') {
        await cache.purge({ tags: ['blog', 'home', `post-${body.slug}`] });
      }
    } catch {
      // Ignore if cache API not available
    }

    return new Response(JSON.stringify({ post: saved }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const auth = (locals as any)?.auth || await authenticateAdminRequest({
    isDev: import.meta.env.DEV,
    host: request.headers.get('host'),
    jwtAssertion: request.headers.get('Cf-Access-Jwt-Assertion'),
    adminEmails: env.ADMIN_EMAILS || env.ADMIN_EMAIL,
    expectedAud: env.CF_ACCESS_AUD,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    devBypassAuth: env.DEV_BYPASS_AUTH === 'true' || import.meta.env.DEV,
  });

  if (!auth.authenticated) {
    console.warn(`[Admin API Guard] ${auth.statusCode || 401}: ${auth.error}`);
    return new Response(JSON.stringify({ error: auth.statusCode === 403 ? 'Forbidden' : 'Unauthorized' }), {
      status: auth.statusCode || 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Post ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const deleted = await deletePost(env.DB, id);

  // Invalidate cache
  try {
    const { cache } = await import('cloudflare:workers');
    if (cache && typeof cache.purge === 'function') {
      await cache.purge({ tags: ['blog', 'home'] });
    }
  } catch {
    // Ignore if cache API not available
  }

  return new Response(JSON.stringify({ success: deleted }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
