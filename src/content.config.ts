import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Define the posts collection schema.
// Fields align 1:1 with the D1 schema planned for Phase 3 (posts, tags, post_tags tables)
// to make migration from Markdown files to D1 seamless.
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    published_at: z.coerce.date(),
    excerpt: z.string(),
    cover_image: z.string().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    reading_time_minutes: z.number().int().positive().default(1),
  }),
});

export const collections = { posts };
