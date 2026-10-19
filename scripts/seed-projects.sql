-- scripts/seed-projects.sql
-- Strictly seeds ONLY user-owned projects: sodops.uz and mc.sodops.uz
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
  allow_iframe
) VALUES 
(
  'proj_sodops_uz',
  'sodops.uz',
  'Personal publishing platform, minimal blog, and edge telemetry monitor built on Astro & Cloudflare Workers.',
  'https://sodops.uz',
  'https://github.com/skarimjonoff/sodops.uz',
  'https://sodops.uz',
  '["Astro", "Cloudflare D1", "Tailwind CSS", "TypeScript"]',
  1,
  1,
  1
),
(
  'proj_mc_sodops_uz',
  'mc.sodops.uz',
  'Minecraft server status & web gateway.',
  'https://mc.sodops.uz',
  NULL,
  'https://mc.sodops.uz',
  '["Infrastructure", "Self-Hosted"]',
  1,
  2,
  0
);
