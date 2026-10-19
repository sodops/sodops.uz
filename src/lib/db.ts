import {
  renderAndSanitizeMarkdown,
  sanitizeHtml,
  calculateReadingTimeMinutes,
} from './markdown';

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
    content_html?: string;
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

  // Pre-render content_html: if already pre-rendered (e.g. import), sanitize directly without full re-compilation
  const contentHtml = data.content_html
    ? await sanitizeHtml(data.content_html)
    : await renderAndSanitizeMarkdown(content);

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

// ---------------------------------------------------------------------------
// Phase 4: Projects & Live Uptime Status Functions
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  description: string;
  url: string;
  repo_url: string | null;
  status_url: string | null;
  tech_tags: string[];
  featured: number;
  sort_order: number;
  allow_iframe: number;
  screenshot_url: string | null;
  check_type?: 'http' | 'tcp' | 'minecraft';
  check_host?: string | null;
  check_port?: number | null;
}

export interface UptimeCheck {
  id: number;
  project_id: string;
  timestamp: string;
  status: 'up' | 'down' | 'degraded';
  status_code: number;
  latency_ms: number;
  metadata?: string | null;
}

export interface DayStatus {
  date: string;
  status: 'up' | 'down' | 'degraded' | 'none';
  percent: number;
  avgLatency?: number;
}

export interface ProjectWithStatus extends Project {
  current_status: 'up' | 'down' | 'degraded' | 'unknown';
  latest_latency_ms: number | null;
  latest_check_at: string | null;
  latest_metadata?: string | null;
  uptime_percentage_30d: number;
  uptime_history_30d: DayStatus[];
  has_history: boolean;
}

/**
 * Parses tech_tags safely from string or JSON array.
 */
function parseTechTags(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

/**
 * Retrieves all projects from D1 ordered by sort_order ASC, name ASC.
 */
export async function getAllProjects(db?: D1Database): Promise<Project[]> {
  if (!db) return [];
  const { results } = await db
    .prepare('SELECT * FROM projects ORDER BY sort_order ASC, name ASC')
    .all();

  return (results || []).map((row: any) => ({
    ...row,
    tech_tags: parseTechTags(row.tech_tags),
  }));
}

/**
 * Retrieves projects with live uptime status, recent latency, and 30-day history bars
 * read efficiently from `uptime_daily_aggregates` rather than scanning raw check logs.
 */
export async function getProjectsWithStatus(
  db?: D1Database
): Promise<ProjectWithStatus[]> {
  if (!db) return [];

  const projects = await getAllProjects(db);
  if (projects.length === 0) return [];

  // 1. Fetch latest check per project
  const latestQuery = `
    SELECT u.project_id, u.status, u.status_code, u.latency_ms, u.timestamp, u.metadata
    FROM uptime_checks u
    INNER JOIN (
      SELECT project_id, MAX(id) as max_id
      FROM uptime_checks
      GROUP BY project_id
    ) latest ON u.id = latest.max_id;
  `;
  const { results: latestResults } = await db.prepare(latestQuery).all();
  const latestMap = new Map<string, any>();
  for (const row of latestResults || []) {
    latestMap.set(row.project_id as string, row);
  }

  // 2. Fetch daily aggregates for past 30 days from uptime_daily_aggregates
  const aggQuery = `
    SELECT project_id, date, total_checks, successful_checks, avg_latency
    FROM uptime_daily_aggregates
    WHERE date >= date('now', '-29 days')
    ORDER BY date ASC;
  `;
  const { results: aggResults } = await db.prepare(aggQuery).all();

  // Group daily aggregates by project_id -> date -> aggregate row
  const projectAggMap = new Map<string, Map<string, { total_checks: number; successful_checks: number; avg_latency: number }>>();
  for (const row of aggResults || []) {
    const pid = row.project_id as string;
    const date = row.date as string;
    if (!projectAggMap.has(pid)) {
      projectAggMap.set(pid, new Map());
    }
    projectAggMap.get(pid)!.set(date, {
      total_checks: Number(row.total_checks) || 0,
      successful_checks: Number(row.successful_checks) || 0,
      avg_latency: Math.round(Number(row.avg_latency) || 0),
    });
  }

  // Generate 30-day date series ending today (UTC)
  const dateSeries: string[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    dateSeries.push(d.toISOString().split('T')[0]);
  }

  return projects.map((p) => {
    const latest = latestMap.get(p.id);
    const dateMap = projectAggMap.get(p.id);

    let totalChecks = 0;
    let upChecks = 0;

    const uptime_history_30d: DayStatus[] = dateSeries.map((date) => {
      const agg = dateMap?.get(date);
      if (!agg || agg.total_checks === 0) {
        return { date, status: 'none', percent: 100 };
      }

      totalChecks += agg.total_checks;
      upChecks += agg.successful_checks;

      let status: 'up' | 'down' | 'degraded' = 'up';
      if (agg.successful_checks === 0 && agg.total_checks > 0) {
        status = 'down';
      } else if (agg.successful_checks < agg.total_checks) {
        status = 'degraded';
      }

      const percent =
        agg.total_checks > 0
          ? Math.round((agg.successful_checks / agg.total_checks) * 100)
          : 100;

      return {
        date,
        status,
        percent,
        avgLatency: agg.avg_latency,
      };
    });

    const has_history = totalChecks > 0;
    const uptime_percentage_30d = has_history
      ? Number(((upChecks / totalChecks) * 100).toFixed(2))
      : 100;

    return {
      ...p,
      current_status: (latest?.status as any) || 'unknown',
      latest_latency_ms: latest ? Number(latest.latency_ms) : null,
      latest_check_at: (latest?.timestamp as string) || null,
      latest_metadata: (latest?.metadata as string) || null,
      uptime_percentage_30d,
      uptime_history_30d,
      has_history,
    };
  });
}

/**
 * Retrieves featured projects with their current status for the homepage.
 * Strictly reads only projects + latest check per project, completely bypassing
 * daily aggregates for minimal D1 read consumption.
 */
export async function getFeaturedProjects(
  db?: D1Database
): Promise<ProjectWithStatus[]> {
  if (!db) return [];
  const { results: rawProjects } = await db
    .prepare('SELECT * FROM projects WHERE featured = 1 ORDER BY sort_order ASC, name ASC')
    .all();
  if (!rawProjects || rawProjects.length === 0) return [];

  const projects = rawProjects.map((row: any) => ({
    ...row,
    tech_tags: parseTechTags(row.tech_tags),
  })) as Project[];

  // Fetch only the latest check per project (bypasses aggregate table scan)
  const latestQuery = `
    SELECT u.project_id, u.status, u.status_code, u.latency_ms, u.timestamp, u.metadata
    FROM uptime_checks u
    INNER JOIN (
      SELECT project_id, MAX(id) as max_id
      FROM uptime_checks
      GROUP BY project_id
    ) latest ON u.id = latest.max_id;
  `;
  const { results: latestResults } = await db.prepare(latestQuery).all();
  const latestMap = new Map<string, any>();
  for (const row of latestResults || []) {
    latestMap.set(row.project_id as string, row);
  }

  return projects.map((p) => {
    const latest = latestMap.get(p.id);
    return {
      ...p,
      current_status: (latest?.status as any) || 'unknown',
      latest_latency_ms: latest ? Number(latest.latency_ms) : null,
      latest_check_at: (latest?.timestamp as string) || null,
      latest_metadata: (latest?.metadata as string) || null,
      uptime_percentage_30d: 100,
      uptime_history_30d: [],
      has_history: false,
    };
  });
}

/**
 * Records an uptime check for a project in D1 (raw log, retained 7 days).
 */
export async function recordUptimeCheck(
  db: D1Database,
  check: {
    projectId: string;
    status: 'up' | 'down' | 'degraded';
    statusCode: number;
    latencyMs: number;
    timestamp?: string;
    metadata?: string | null;
  }
): Promise<void> {
  const now = check.timestamp || new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO uptime_checks (project_id, timestamp, status, status_code, latency_ms, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(check.projectId, now, check.status, check.statusCode, check.latencyMs, check.metadata || null)
    .run();
}

/**
 * Updates or creates daily aggregated uptime stats for a project.
 * Uses SQLite ON CONFLICT UPSERT with incremental moving average for latency.
 */
export async function recordDailyAggregate(
  db: D1Database,
  projectId: string,
  date: string, // YYYY-MM-DD
  isSuccessful: boolean,
  latencyMs: number
): Promise<void> {
  const successCount = isSuccessful ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO uptime_daily_aggregates (project_id, date, total_checks, successful_checks, avg_latency)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(project_id, date) DO UPDATE SET
         avg_latency = ((uptime_daily_aggregates.avg_latency * uptime_daily_aggregates.total_checks) + excluded.avg_latency) / (uptime_daily_aggregates.total_checks + 1),
         successful_checks = uptime_daily_aggregates.successful_checks + excluded.successful_checks,
         total_checks = uptime_daily_aggregates.total_checks + 1;`
    )
    .bind(projectId, date, successCount, latencyMs)
    .run();
}

/**
 * Purges raw uptime checks older than N days (default: 7 days) to minimize D1 storage.
 */
export async function cleanupOldUptimeChecks(
  db: D1Database,
  days = 7
): Promise<number> {
  const res = await db
    .prepare("DELETE FROM uptime_checks WHERE timestamp < datetime('now', '-' || ? || ' days')")
    .bind(days)
    .run();
  return res.meta.changes || 0;
}
