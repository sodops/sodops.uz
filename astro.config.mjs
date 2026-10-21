// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';

import fs from 'node:fs';
import path from 'node:path';

function checkPublicSafetyGuards() {
  // Check both process.env and wrangler.jsonc for SITE_INDEXING
  let isIndexingOn = (process.env.SITE_INDEXING || '').toLowerCase() === 'on';
  try {
    const wranglerConfig = fs.readFileSync(path.resolve('wrangler.jsonc'), 'utf-8');
    if (/"SITE_INDEXING"\s*:\s*"on"/i.test(wranglerConfig)) {
      isIndexingOn = true;
    }
  } catch {}

  if (!isIndexingOn) return;

  const targets = [
    'public/.well-known/security.txt',
    'src/pages/index.astro',
    'src/pages/uses.astro',
    'src/pages/now.astro',
    'src/pages/projects.astro',
    'src/pages/404.astro',
    'src/pages/blog/index.astro',
    'src/pages/blog/[slug].astro',
  ];

  /** @type {Array<{ file: string; line: number; text: string }>} */
  const violations = [];
  for (const relPath of targets) {
    const fullPath = path.resolve(relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('TODO(sodiq)')) {
        violations.push({ file: relPath, line: idx + 1, text: line.trim() });
      }
    });
  }

  if (violations.length > 0) {
    const details = violations.map((v) => `  - ${v.file}:${v.line} -> ${v.text}`).join('\n');
    throw new Error(
      `\n\n[FATAL SAFETY GUARD] Production build aborted!\n` +
      `SITE_INDEXING is set to 'on', but ${violations.length} unresolved TODO(sodiq) placeholder(s) were found:\n` +
      `${details}\n\n` +
      `You must finalize all personal copy and RFC 9116 security.txt Contact before launching search indexing.\n`
    );
  }
}

export default defineConfig({
  site: 'https://sodops.uz',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    preact(),
    {
      name: 'site-indexing-safety',
      hooks: {
        'astro:config:setup': () => {
          checkPublicSafetyGuards();
        },
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      assetsInlineLimit: 0,
    },
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
    '/': { maxAge: 60, swr: 300, tags: ['home', 'blog', 'projects'] },
    // Blog list: same policy, tagged for group invalidation
    '/blog': { maxAge: 60, swr: 300, tags: ['blog'] },
    // Individual blog posts: cache longer, post-specific tag + group tag
    '/blog/[slug]': { maxAge: 300, swr: 600, tags: ['blog'] },
    // Projects & Status: edge-cached 60s, tagged for cron invalidation
    '/projects': { maxAge: 60, swr: 300, tags: ['projects'] },
    // RSS feed: cache 5 min, tagged with blog
    '/feed.xml': { maxAge: 300, swr: 600, tags: ['blog'] },
    // Dynamic sitemap: cache 1 hour, tagged with blog
    '/sitemap.xml': { maxAge: 3600, swr: 86400, tags: ['blog'] },
  },
});
