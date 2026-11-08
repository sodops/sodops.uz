/**
 * One-time, non-destructive migration of a legacy Minecraft status monitor.
 *
 * The Minecraft game server is not provisioned yet. Keep its historical
 * downtime checks as an archived/paused project, then monitor the live
 * True Survival HTTPS landing page as a *new* project with clean history.
 *
 * A conditional D1 batch ensures the two changes are committed atomically.
 * This runs from the existing production Cron Worker with the DB binding,
 * avoiding any extra Cloudflare API token scopes.
 */
const LEGACY_ID = 'proj_mc_sodops_uz';
const LANDING_ID = 'proj_true_survival_landing';
const LANDING_URL = 'https://mc.sodops.uz';

export async function ensureTrueSurvivalLandingMonitor(db: D1Database): Promise<boolean> {
  const legacy = await db.prepare(
    'SELECT id, name, status, check_type, url FROM projects WHERE id = ?'
  ).bind(LEGACY_ID).first<{
    id: string;
    name: string;
    status: string;
    check_type: string;
    url: string;
  }>();

  // Never rewrite an unrelated project or override a future reconfiguration.
  if (!legacy || legacy.check_type !== 'minecraft' || legacy.url.replace(/\/$/, '') !== LANDING_URL) {
    return false;
  }

  const landing = await db.prepare(
    'SELECT id FROM projects WHERE id = ?'
  ).bind(LANDING_ID).first<{ id: string }>();

  const statements = [];
  if (legacy.status !== 'paused' || legacy.name === 'mc.sodops.uz') {
    statements.push(db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, status = 'paused', featured = 0, sort_order = 3
      WHERE id = ? AND check_type = 'minecraft'
    `).bind(
      'True Survival Minecraft Server',
      'Coming soon. The game server has not been provisioned; no VDS is running yet.',
      LEGACY_ID
    ));
  }

  if (!landing) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO projects
        (id, name, description, url, repo_url, status_url, tech_tags,
         featured, sort_order, allow_iframe, check_type, check_host, check_port, status)
      VALUES (?, ?, ?, ?, NULL, ?, ?, 1, 2, 0, 'http', ?, 443, 'active')
    `).bind(
      LANDING_ID,
      'True Survival Landing Page',
      'Minecraft community landing page is live. The game server itself is coming soon.',
      LANDING_URL,
      LANDING_URL,
      JSON.stringify(['Cloudflare Workers', 'Landing Page', 'Minecraft']),
      'mc.sodops.uz'
    ));
  }

  if (!statements.length) return false;
  await db.batch(statements);
  return true;
}
