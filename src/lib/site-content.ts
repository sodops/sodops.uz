/** Text-only, allowlisted CMS slots. All markup/layout stays in source control. */
export const SITE_COPY = {
  "home.greeting": "Hi, I'm Sodiq.",
  "home.intro": "I'm a DevOps-oriented developer and AI student based in Tashkent, Uzbekistan. I build and maintain infrastructure with Docker, Kubernetes (k3s), Prometheus, Grafana, and Loki.",
  "home.focus": "My work focuses on cloud and edge deployments, reliable automation, observability, and lightweight frontend delivery.",
  "home.projectsCta": "View projects",
  "home.contactCta": "Get in touch",
  "home.nowTeaser": "Improving delivery automation, observability, and this site.",
  "home.nowLinkText": "See what I am doing now",
  "home.latestPosts": "Recent Posts",
  "home.allPosts": "All posts",
  "home.featuredProjects": "Featured Projects",
  "home.allProjects": "All projects",
  "blog.title": "Writing",
  "blog.description": "Notes on DevOps, infrastructure, edge architecture, and AI.",
  "projects.title": "Projects",
  "projects.description": "Websites, infrastructure services, and tools I maintain. Infrastructure services, tools, and live availability monitors.",
  "uses.title": "Uses",
  "uses.description": "The tools and infrastructure behind my projects and experiments.",
  "now.title": "Now",
  "now.intro": "A short snapshot of the engineering work and subjects I'm focusing on.",
  "now.engineering.title": "Engineering",
  "now.engineering.body": "Improving this website's publishing workflow, operational monitoring, release automation, and accessibility. The site runs on Astro and Cloudflare Workers.",
  "now.engineering.link": "Explore the projects",
  "now.learning.title": "Learning & practice",
  "now.learning.body": "Exploring Linux, containers, CI/CD, and observability alongside AI studies. I share notes and technical lessons as I build.",
  "now.learning.link": "Read the writing",
  "now.location.title": "Location",
  "now.location.body": "Based in Tashkent, Uzbekistan.",
  "nav.blog": "Blog",
  "nav.projects": "Projects",
  "nav.uses": "Uses",
  "nav.now": "Now",
  "footer.license": "CC BY-NC-SA 4.0",
  "uses.cloud.title": "Cloud & Delivery",
  "uses.cloud.0.name": "Cloudflare Workers",
  "uses.cloud.0.description": "Edge runtime for sodops.uz and scheduled monitoring tasks.",
  "uses.cloud.1.name": "Cloudflare D1 & KV",
  "uses.cloud.1.description": "SQL-backed publishing, uptime metrics, and session storage.",
  "uses.cloud.2.name": "GitHub Actions",
  "uses.cloud.2.description": "Automated linting, tests, builds, and production release checks.",
  "uses.dev.title": "Development",
  "uses.dev.0.name": "Astro & TypeScript",
  "uses.dev.0.description": "Server-rendered pages, typed APIs, and a lightweight frontend.",
  "uses.dev.1.name": "Tailwind CSS & Preact",
  "uses.dev.1.description": "Responsive styling and focused interactive components.",
  "uses.dev.2.name": "Playwright",
  "uses.dev.2.description": "Browser-level checks for responsiveness, accessibility, and critical interactions.",
  "uses.infra.title": "Infrastructure & Observability",
  "uses.infra.0.name": "Containers",
  "uses.infra.0.description": "Docker and Kubernetes (k3s) for infrastructure experiments.",
  "uses.infra.1.name": "Monitoring",
  "uses.infra.1.description": "Prometheus, Grafana, and Loki for metrics, dashboards, and logs.",
  "uses.infra.2.name": "Linux",
  "uses.infra.2.description": "Command-line tooling, scripting, and day-to-day DevOps workflows."
} as const;

export type SiteCopyKey = keyof typeof SITE_COPY;
export const MAX_COPY_BYTES = 4000;
export function isSiteCopyKey(key: unknown): key is SiteCopyKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(SITE_COPY, key);
}
export function validateSiteCopyInput(key: unknown, value: unknown): string | null {
  if (!isSiteCopyKey(key)) return 'This field is not editable';
  if (typeof value !== 'string') return 'Content must be text';
  if (!value.trim()) return 'Content cannot be empty';
  if (new TextEncoder().encode(value).length > MAX_COPY_BYTES) return 'Content exceeds 4 KB';
  if (value.includes('\\0')) return 'Invalid text';
  return null;
}

export function getSiteCopy(locals: App.Locals, key: SiteCopyKey): string {
  const overrides = (locals as App.Locals & { siteCopy?: Record<string,string> }).siteCopy;
  return overrides?.[key] ?? SITE_COPY[key];
}

export async function loadSiteCopy(db?: D1Database): Promise<Record<string,string>> {
  if (!db) return {};
  try {
    const { results } = await db.prepare('SELECT key, value FROM site_content').all();
    const overrides: Record<string,string> = {};
    for (const row of results || []) {
      if (isSiteCopyKey(row.key) && typeof row.value === 'string') overrides[row.key] = row.value;
    }
    return overrides;
  } catch (error) {
    // First release has no table yet. It is lazily provisioned by the admin API.
    if (!String(error).includes('no such table')) console.error('[Site copy] D1 query failed', error);
    return {};
  }
}

export async function ensureSiteCopyTables(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS site_content_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, old_value TEXT,
      new_value TEXT, updated_by TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);
}

export async function setSiteCopy(db: D1Database, key: SiteCopyKey, value: string, email: string): Promise<void> {
  const error = validateSiteCopyInput(key, value);
  if (error) throw new Error(error);
  await ensureSiteCopyTables(db);
  const previous = await db.prepare('SELECT value FROM site_content WHERE key = ?').bind(key).first<{value:string}>();
  await db.batch([
    db.prepare(`INSERT INTO site_content (key,value,updated_by,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`).bind(key,value,email),
    db.prepare('INSERT INTO site_content_history (key,old_value,new_value,updated_by) VALUES (?,?,?,?)')
      .bind(key,previous?.value ?? null,value,email),
  ]);
}

export async function resetSiteCopy(db: D1Database, key: SiteCopyKey, email: string): Promise<void> {
  await ensureSiteCopyTables(db);
  const previous = await db.prepare('SELECT value FROM site_content WHERE key = ?').bind(key).first<{value:string}>();
  await db.batch([
    db.prepare('DELETE FROM site_content WHERE key = ?').bind(key),
    db.prepare('INSERT INTO site_content_history (key,old_value,new_value,updated_by) VALUES (?,?,?,?)')
      .bind(key,previous?.value ?? null,null,email),
  ]);
}
