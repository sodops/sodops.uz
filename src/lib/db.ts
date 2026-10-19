import { renderAndSanitizeMarkdown, calculateReadingTimeMinutes } from './markdown';

type D1Database = import('@cloudflare/workers-types').D1Database;

export interface Post {
  id: string;
  slug: string;
  title: string;
  content: string;
  content_html: string;
  excerpt: string;
  cover_image: string;
  published: number; // 0 = draft, 1 = published
  published_at: string;
  created_at: string;
  updated_at: string;
  reading_time_minutes: number;
}

export interface PostWithTags extends Post {
  tags: string[];
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

/**
 * Retrieves all published posts ordered by published_at DESC.
 * Runs in < 2ms on Cloudflare D1.
 */
export async function getPublishedPosts(db?: D1Database): Promise<PostWithTags[]> {
  if (!db) return [];

  const query = `
    SELECT 
      p.id, p.slug, p.title, p.content, p.content_html, p.excerpt, 
      p.cover_image, p.published, p.published_at, p.created_at, p.updated_at, 
      p.reading_time_minutes,
      GROUP_CONCAT(t.name) as tags_str
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.published = 1
    GROUP BY p.id
    ORDER BY p.published_at DESC;
  `;

  const { results } = await db.prepare(query).all();
  return (results || []).map((row: any) => ({
    ...row,
    tags: row.tags_str ? row.tags_str.split(',') : [],
  }));
}

/**
 * Retrieves all posts (including drafts) for the admin dashboard.
 */
export async function getAllPosts(db?: D1Database): Promise<PostWithTags[]> {
  if (!db) return [];

  const query = `
    SELECT 
      p.id, p.slug, p.title, p.content, p.content_html, p.excerpt, 
      p.cover_image, p.published, p.published_at, p.created_at, p.updated_at, 
      p.reading_time_minutes,
      GROUP_CONCAT(t.name) as tags_str
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC;
  `;

  const { results } = await db.prepare(query).all();
  return (results || []).map((row: any) => ({
    ...row,
    tags: row.tags_str ? row.tags_str.split(',') : [],
  }));
}

/**
 * Retrieves a single published post by slug.
 */
export async function getPostBySlug(
  db: D1Database | undefined,
  slug: string,
  includeDraft = false
): Promise<PostWithTags | null> {
  if (!db) return null;

  const whereClause = includeDraft ? 'p.slug = ?' : 'p.slug = ? AND p.published = 1';

  const query = `
    SELECT 
      p.id, p.slug, p.title, p.content, p.content_html, p.excerpt, 
      p.cover_image, p.published, p.published_at, p.created_at, p.updated_at, 
      p.reading_time_minutes,
      GROUP_CONCAT(t.name) as tags_str
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE ${whereClause}
    GROUP BY p.id
    LIMIT 1;
  `;

  const row: any = await db.prepare(query).bind(slug).first();
  if (!row) return null;

  return {
    ...row,
    tags: row.tags_str ? row.tags_str.split(',') : [],
  };
}

/**
 * Retrieves a single post by id.
 */
export async function getPostById(
  db: D1Database | undefined,
  id: string
): Promise<PostWithTags | null> {
  if (!db) return null;

  const query = `
    SELECT 
      p.id, p.slug, p.title, p.content, p.content_html, p.excerpt, 
      p.cover_image, p.published, p.published_at, p.created_at, p.updated_at, 
      p.reading_time_minutes,
      GROUP_CONCAT(t.name) as tags_str
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.id = ?
    GROUP BY p.id
    LIMIT 1;
  `;

  const row: any = await db.prepare(query).bind(id).first();
  if (!row) return null;

  return {
    ...row,
    tags: row.tags_str ? row.tags_str.split(',') : [],
  };
}

/**
 * Saves (creates or updates) a post in D1.
 * Pre-renders content_html at save time so request time uses < 1ms CPU.
 */
export async function savePost(
  db: D1Database,
  data: {
    id?: string;
    title: string;
    slug: string;
    content: string;
    excerpt?: string;
    cover_image?: string;
    published?: boolean | number;
    published_at?: string;
    tags?: string[];
  }
): Promise<PostWithTags> {
  const slug = data.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  const title = data.title.trim();
  const content = data.content;
  const excerpt =
    data.excerpt ||
    content
      .slice(0, 160)
      .replace(/[#*_`]/g, '')
      .trim();
  const coverImage = data.cover_image || '';
  const published = data.published ? 1 : 0;
  const now = new Date().toISOString();
  const publishedAt = data.published_at || (published ? now : '');
  const readingTime = calculateReadingTimeMinutes(content);

  // Pre-render content_html using shared pipeline to save runtime CPU on Workers
  const contentHtml = await renderAndSanitizeMarkdown(content);

  let id = data.id;
  if (!id) {
    id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // Insert or Replace post
  await db
    .prepare(
      `INSERT INTO posts (id, slug, title, content, content_html, excerpt, cover_image, published, published_at, updated_at, reading_time_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         slug = excluded.slug,
         title = excluded.title,
         content = excluded.content,
         content_html = excluded.content_html,
         excerpt = excluded.excerpt,
         cover_image = excluded.cover_image,
         published = excluded.published,
         published_at = CASE WHEN excluded.published = 1 AND posts.published_at IS NULL THEN excluded.published_at ELSE posts.published_at END,
         updated_at = excluded.updated_at,
         reading_time_minutes = excluded.reading_time_minutes;`
    )
    .bind(
      id,
      slug,
      title,
      content,
      contentHtml,
      excerpt,
      coverImage,
      published,
      publishedAt,
      now,
      readingTime
    )
    .run();

  // Update tags
  if (data.tags) {
    // Delete existing post_tags
    await db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();

    for (const rawTag of data.tags) {
      const tagName = rawTag.trim();
      if (!tagName) continue;
      const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const tagId = `tag_${tagSlug.replace(/-/g, '_')}`;

      // Insert tag if not exists
      await db
        .prepare('INSERT OR IGNORE INTO tags (id, name, slug) VALUES (?, ?, ?)')
        .bind(tagId, tagName, tagSlug)
        .run();

      // Link post_tags
      await db
        .prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)')
        .bind(id, tagId)
        .run();
    }
  }

  const saved = await getPostById(db, id);
  if (!saved) throw new Error('Failed to retrieve post after save');
  return saved;
}

/**
 * Deletes a post from D1.
 */
export async function deletePost(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return (res.meta.changes || 0) > 0;
}
