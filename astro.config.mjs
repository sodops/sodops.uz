// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';

export default defineConfig({
  site: 'https://sodops.uz',
  output: 'server',
  adapter: cloudflare(),
  integrations: [preact(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },

  // Astro route cache: Cloudflare CDN-level caching with tag-based invalidation.
  // The cacheCloudflare() provider sets `Cloudflare-CDN-Cache-Control` and
  // `Cache-Tag` headers — no manual Cache.delete() purge needed.
  // Phase 3 admin routes can call Astro.cache.invalidate({ tags: ['blog'] })
  // to bust the CDN cache immediately on post save.
  cache: {
    provider: cacheCloudflare(),
  },

  // Per-route cache rules applied at config level.
  // Astro.cache.set() inside pages can override or extend these.
  routeRules: {
    // Home page: edge-cached 60s, stale-while-revalidate 5 min
    '/': { maxAge: 60, swr: 300, tags: ['home', 'blog'] },
    // Blog list: same policy, tagged for group invalidation
    '/blog': { maxAge: 60, swr: 300, tags: ['blog'] },
    // Individual blog posts: cache longer, post-specific tag + group tag
    '/blog/[slug]': { maxAge: 300, swr: 600, tags: ['blog'] },
    // RSS feed: cache 5 min, tagged with blog
    '/feed.xml': { maxAge: 300, swr: 600, tags: ['blog'] },
  },
});
