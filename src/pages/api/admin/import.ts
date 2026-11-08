import type { APIRoute } from 'astro';
import { resolveAdminAuth } from '../../../lib/admin-request-auth';
import { importPosts, type PostInput } from '../../../lib/db';

import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await resolveAdminAuth(request, locals);

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
    // Limit untrusted JSON before parsing or rendering Markdown.
    const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) {
      return Response.json({ error: 'Backup too large' }, { status: 413 });
    }
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'Backup body is required' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_IMPORT_BYTES) {
          await reader.cancel();
          return Response.json({ error: 'Backup too large' }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let backup: unknown;
    try {
      backup = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!backup || typeof backup !== 'object' || !('posts' in backup) ||
        !Array.isArray(backup.posts)) {
      return Response.json({ error: 'Invalid backup structure' }, { status: 400 });
    }

    const posts: unknown[] = backup.posts;
    if (posts.length > 100) {
      return Response.json({ error: 'Backup exceeds 100 posts' }, { status: 413 });
    }
    const isValidPost = (post: unknown): post is PostInput => {
      if (!post || typeof post !== 'object') return false;
      const p = post as Record<string, unknown>;
      const optionalString = (key: string, max: number) =>
        p[key] === undefined || (typeof p[key] === 'string' && (p[key] as string).length <= max);
      return typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= 200 &&
        typeof p.slug === 'string' && /^[a-z0-9-]{1,200}$/.test(p.slug) &&
        typeof p.content === 'string' && p.content.trim().length > 0 && p.content.length <= 65536 &&
        optionalString('id', 200) && optionalString('content_html', 512000) &&
        optionalString('excerpt', 4000) && optionalString('cover_image', 2000) &&
        optionalString('published_at', 100) &&
        (p.published === undefined || typeof p.published === 'boolean' || p.published === 0 || p.published === 1) &&
        (p.tags === undefined || (Array.isArray(p.tags) && p.tags.length <= 20 &&
          p.tags.every((tag: unknown) => typeof tag === 'string' && tag.length <= 100)));
    };
    if (!posts.every(isValidPost)) {
      return Response.json({ error: 'Invalid post in backup' }, { status: 400 });
    }
    const ids = posts.map((p) => p.id).filter(Boolean);
    const slugs = posts.map((p) => p.slug);
    if (new Set(ids).size !== ids.length || new Set(slugs).size !== slugs.length) {
      return Response.json({ error: 'Duplicate post ID or slug in backup' }, { status: 400 });
    }

    const importedCount = await importPosts(env.DB, posts);

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
