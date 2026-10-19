import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getPublishedPosts } from '../../lib/db';

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

  const items = [
    // Standard Pages
    {
      type: 'page',
      title: 'Home',
      description: 'Personal site, bio, and latest updates',
      url: '/',
      keywords: 'home index bio sodiq about',
    },
    {
      type: 'page',
      title: 'Blog',
      description: 'Essays, engineering notes, and tutorials',
      url: '/blog',
      keywords: 'blog posts articles notes writing',
    },
    {
      type: 'page',
      title: 'Projects & Status',
      description: 'Active projects with real-time edge telemetry',
      url: '/projects',
      keywords: 'projects status uptime monitoring minecraft telemetry homelab',
    },
    {
      type: 'page',
      title: 'Uses',
      description: 'Tools, software, hardware, and dev environment',
      url: '/uses',
      keywords: 'uses tools setup gear linux k3s neovim hardware software',
    },
    {
      type: 'page',
      title: 'Now',
      description: 'What I am currently focusing on and building',
      url: '/now',
      keywords: 'now focus current activity studying devops ai',
    },
    // Published Posts
    ...posts.map((post) => ({
      type: 'post',
      title: post.title,
      description: post.excerpt || '',
      url: `/blog/${post.slug}`,
      keywords: `${post.title} ${post.excerpt || ''} ${(post.tags || []).join(' ')}`,
      date: post.published_at ? post.published_at.split('T')[0] : undefined,
    })),
  ];

  return new Response(JSON.stringify(items), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      'Cloudflare-CDN-Cache-Control': 'max-age=60',
      'Cache-Tag': 'blog,search',
    },
  });
};
