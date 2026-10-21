import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../lib/db';
import { getCollection } from 'astro:content';
import { generateSitemapXml } from '../lib/sitemap-utils';

export const prerender = false;

import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ locals }) => {
  const siteIndexing = (
    (env as any)?.SITE_INDEXING ||
    (locals as any)?.runtime?.env?.SITE_INDEXING ||
    import.meta.env.SITE_INDEXING ||
    'off'
  ).toLowerCase();

  // If site indexing is disabled, do not advertise or serve sitemap
  if (siteIndexing !== 'on') {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const baseUrl = (env?.SITE_URL || 'https://sodops.uz').replace(/\/$/, '');

  let postUrls: Array<{ loc: string; lastmod?: string }> = [];

  if (env?.DB) {
    const d1Posts = await getPublishedPosts(env.DB);
    if (d1Posts.length > 0) {
      postUrls = d1Posts.map((p) => ({
        loc: `${baseUrl}/blog/${p.slug}`,
        lastmod: (p.updated_at || p.published_at || '').split('T')[0],
      }));
    }
  }

  if (postUrls.length === 0) {
    const collectionPosts = await getCollection('posts', ({ data }) => !data.draft);
    postUrls = collectionPosts.map((p) => ({
      loc: `${baseUrl}/blog/${p.data.slug}`,
      lastmod: p.data.published_at.toISOString().split('T')[0],
    }));
  }

  const staticPages = [
    { loc: `${baseUrl}/`, priority: '1.0' },
    { loc: `${baseUrl}/blog`, priority: '0.8' },
    { loc: `${baseUrl}/projects`, priority: '0.8' },
    { loc: `${baseUrl}/uses`, priority: '0.5' },
    { loc: `${baseUrl}/now`, priority: '0.5' },
  ];

  const sitemapXml = generateSitemapXml(staticPages, postUrls);

  return new Response(sitemapXml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
