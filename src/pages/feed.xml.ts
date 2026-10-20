import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { strings } from '../lib/strings';
import { getPublishedPosts } from '../lib/db';
import type { APIRoute } from 'astro';

export const prerender = false;

import { env } from 'cloudflare:workers';

export const GET: APIRoute = async (context) => {
  let items: Array<{
    title: string;
    pubDate: Date;
    description: string;
    link: string;
    categories: string[];
  }> = [];

  if (env?.DB) {
    const d1Posts = await getPublishedPosts(env.DB);
    if (d1Posts.length > 0) {
      items = d1Posts.map((post) => ({
        title: post.title,
        pubDate: new Date(post.published_at || post.created_at),
        description: post.excerpt,
        link: `/blog/${post.slug}`,
        categories: post.tags,
      }));
    }
  }

  if (items.length === 0) {
    const posts = await getCollection('posts', ({ data }) => !data.draft);
    posts.sort((a, b) => b.data.published_at.getTime() - a.data.published_at.getTime());
    items = posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.published_at,
      description: post.data.excerpt,
      link: `/blog/${post.data.slug}`,
      categories: post.data.tags,
    }));
  }

  return rss({
    title: strings.site.title,
    description: strings.site.description,
    site: (env?.SITE_URL || context.site?.toString() || 'https://sodops.uz').replace(/\/$/, ''),
    items,
    customData: `<language>en-us</language>`,
  });
};
