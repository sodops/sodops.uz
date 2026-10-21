import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { generateRobotsTxt } from '../lib/sitemap-utils';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const siteIndexing = (
    (env as any)?.SITE_INDEXING ||
    (locals as any)?.runtime?.env?.SITE_INDEXING ||
    import.meta.env.SITE_INDEXING ||
    'off'
  ).toLowerCase();

  const siteUrl = (
    (env as any)?.SITE_URL ||
    (locals as any)?.runtime?.env?.SITE_URL ||
    import.meta.env.SITE_URL ||
    'https://sodops.uz'
  );

  const body = generateRobotsTxt(siteIndexing, siteUrl);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
};
