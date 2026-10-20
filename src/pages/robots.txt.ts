import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

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
  ).replace(/\/$/, '');

  let body = '';
  if (siteIndexing !== 'on') {
    body = 'User-agent: *\nDisallow: /\n';
  } else {
    body = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/admin/\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
};
