import type { APIRoute } from 'astro';
import { authenticateAdminRequest } from '../../../lib/auth';
import { savePost } from '../../../lib/db';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
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

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB binding unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const backup: any = await request.json();
    if (!backup || !Array.isArray(backup.posts)) {
      return new Response(JSON.stringify({ error: 'Invalid backup structure' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Reject malformed backups before making any database changes.
    if (backup.posts.length > 100) {
      return new Response(JSON.stringify({ error: 'Backup exceeds 100 posts' }), {
        status: 413, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!backup.posts.every((post: any) =>
      post && typeof post.title === 'string' && post.title.trim() &&
      typeof post.slug === 'string' && post.slug.trim() &&
      typeof post.content === 'string' && post.content.trim() &&
      post.content.length <= 65536 &&
      (post.tags === undefined || (Array.isArray(post.tags) && post.tags.every((tag: unknown) => typeof tag === 'string')))
    )) {
      return new Response(JSON.stringify({ error: 'Invalid post in backup' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    let importedCount = 0;
    for (const post of backup.posts) {
      if (post.title && post.slug && post.content) {
        await savePost(env.DB, {
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content,
          content_html: post.content_html,
          excerpt: post.excerpt,
          cover_image: post.cover_image,
          published: post.published,
          published_at: post.published_at,
          tags: post.tags,
        });
        importedCount++;
      }
    }

    // Invalidate cache
    try {
      const { cache } = await import('cloudflare:workers');
      if (cache && typeof cache.purge === 'function') {
        await cache.purge({ tags: ['blog', 'home'] });
      }
    } catch {
      // Ignore if cache API not available
    }

    return new Response(JSON.stringify({ success: true, count: importedCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Import failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
