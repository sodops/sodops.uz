-- scripts/seed-projects.sql
-- Strictly seeds ONLY user-owned projects: sodops.uz and True Survival landing / future game server
-- Real status measurement only: history starts completely empty.

-- 1. Clean up any existing projects, raw checks, and aggregates
DELETE FROM uptime_checks;
DELETE FROM uptime_daily_aggregates;
DELETE FROM projects;

-- 2. Insert verified owned projects
INSERT INTO projects (
  id,
  name,
  description,
  url,
  repo_url,
  status_url,
  tech_tags,
  featured,
  sort_order,
  allow_iframe,
  check_type,
  check_host,
  check_port,
  status
) VALUES 
(
  'proj_sodops_uz',
  'sodops.uz',
  'TODO(sodiq)',
  'https://sodops.uz',
  'https://github.com/skarimjonoff/sodops.uz',
  'https://sodops.uz/api/health',
  '["Astro", "Cloudflare D1", "Tailwind CSS", "TypeScript"]',
  1,
  1,
  1,
  'http',
  'sodops.uz',
  443,
  'active'
),
(
  'proj_mc_sodops_uz',
  'True Survival Minecraft Server',
  'Coming soon. The game server has not been provisioned; no VDS is running yet.',
  'https://mc.sodops.uz',
  NULL,
  NULL,
  '["Minecraft", "Coming Soon"]',
  0,
  3,
  0,
  'minecraft',
  'mc.sodops.uz',
  25565,
  'paused'
),
(
  'proj_true_survival_landing',
  'True Survival Landing Page',
  'Minecraft community landing page is live. The game server itself is coming soon.',
  'https://mc.sodops.uz',
  NULL,
  'https://mc.sodops.uz',
  '["Cloudflare Workers", "Landing Page", "Minecraft"]',
  1,
  2,
  0,
  'http',
  'mc.sodops.uz',
  443,
  'active'
);
