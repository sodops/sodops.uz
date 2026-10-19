import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { strings } from '../lib/strings';
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  posts.sort((a, b) => b.data.published_at.getTime() - a.data.published_at.getTime());

  return rss({
    title: strings.site.title,
    description: strings.site.description,
    site: context.site || 'https://sodops.uz',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.published_at,
      description: post.data.excerpt,
      link: `/blog/${post.data.slug}`,
      categories: post.data.tags,
    })),
    customData: `<language>en-us</language>`,
  });
};
