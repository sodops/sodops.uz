import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getPublishedPosts } from '../../lib/db';
import { buildSearchIndex } from '../../lib/search';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const db = (env as any)?.DB || (locals as any)?.runtime?.env?.DB;
  let posts: any[] = [];
  try {
    if (db) {
      posts = await getPublishedPosts(db);
    }
  } catch (err) {
    console.error('[Search API] Failed to fetch published posts:', err);
  }

  const items = buildSearchIndex(posts);

  return new Response(JSON.stringify(items), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      'Cloudflare-CDN-Cache-Control': 'max-age=60',
      'Cache-Tag': 'blog,search',
    },
  });
};
