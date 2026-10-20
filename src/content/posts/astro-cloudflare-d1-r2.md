---
title: 'Deploying Astro on Cloudflare Workers with D1 and R2'
slug: 'astro-cloudflare-d1-r2'
published_at: 2026-10-02T14:30:00Z
excerpt: 'Architecting a fast, serverless publishing site with edge SQLite, asset object storage, and zero cold-start rendering.'
cover_image: ''
draft: false
tags: ['astro', 'cloudflare', 'd1', 'r2', 'devops']
reading_time_minutes: 6
---

Modern web architecture often forces a false choice: static sites that require full CI/CD rebuilds to publish a single typo fix, or heavy monolithic containers running on costly always-on servers.

By pairing **Astro** with **Cloudflare Workers**, **D1** (distributed edge SQLite), and **R2** (S3-compatible object storage), we can achieve the best of both worlds: instant publishing from a web UI, ultra-fast TTFB globally, and zero server maintenance within the free tier.

## Why Astro on Cloudflare?

Astro's `@astrojs/cloudflare` adapter compiles pages into native Cloudflare Worker entrypoints. Unlike Node.js containers that may take seconds to spin up, Workers execute on V8 isolates with virtually zero cold-start overhead (< 5ms).

Furthermore, Astro's hybrid rendering allows static assets to be served directly from Cloudflare's global CDN while dynamic API and admin routes execute on-demand at the edge nearest to the user.

```
+-----------------------------------------------------------+
|                      Cloudflare Edge                      |
|                                                           |
|  Request ---> [CDN Cache / Assets] (sub-10ms response)    |
|                      |                                    |
|                   Cache Miss                              |
|                      |                                    |
|                      v                                    |
|             [Astro SSR Worker]                            |
|                 |         |                               |
|        D1 Query |         | R2 Object Get                 |
|                 v         v                               |
|          [Cloudflare D1] [Cloudflare R2]                  |
+-----------------------------------------------------------+
```

## Configuring Cloudflare D1 with TypeScript

Cloudflare D1 runs SQLite directly at the edge. To type your D1 bindings in Astro, augment the `App.Locals` interface:

```typescript
// src/env.d.ts
declare namespace App {
  interface Locals {
    runtime: {
      env: {
        DB: D1Database;
        UPLOADS_BUCKET: R2Bucket;
        SITE_URL: string;
      };
    };
  }
}
```

In your server route or Astro frontmatter, executing a query is as simple as:

```typescript
import { env } from 'cloudflare:workers';
const { results } = await env.DB.prepare(
  'SELECT id, title, slug, published_at FROM posts WHERE published = 1 ORDER BY published_at DESC LIMIT 10'
).all();
```

## Handling Image Uploads to R2

When uploading images through a private admin panel, we can stream the `FormData` file buffer directly to R2 without storing anything on disk:

```typescript
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async ({ request }) => {
  const { UPLOADS_BUCKET } = env;
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return new Response('No file provided', { status: 400 });
  }

  // Validate allowed MIME types (no SVG for security)
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
  if (!allowed.includes(file.type)) {
    return new Response('Invalid file type', { status: 415 });
  }

  const key = `posts/${Date.now()}-${file.name}`;
  await UPLOADS_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return new Response(JSON.stringify({ url: `/images/${key}` }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

## Tag-Based Cache Invalidation

Instead of having to wait for a 5-minute CDN cache TTL, Astro 7 introduces route-level cache tagging. When a post is updated in the admin panel, the API simply invalidates the `blog` tag:

```typescript
// Inside post update API handler
await Astro.cache.invalidate({ tags: ['blog'] });
```

This purges Cloudflare CDN's edge cache across every data center globally in milliseconds, giving readers instantaneous access to the new content.
