-- Seed projects for sodops.uz Phase 4
INSERT OR REPLACE INTO projects (id, name, description, url, repo_url, status_url, tech_tags, featured, sort_order, allow_iframe)
VALUES 
(
  'proj_sodops_uz',
  'sodops.uz',
  'Personal publishing platform, minimal blog, and edge status monitor built on Astro & Cloudflare Workers.',
  'https://sodops.uz',
  'https://github.com/skarimjonoff',
  'https://sodops-uz.skarimjonoff.workers.dev/feed.xml',
  '["Astro", "Cloudflare D1", "Tailwind CSS", "TypeScript"]',
  1,
  1,
  1
),
(
  'proj_k3s_homelab',
  'Homelab k3s Cluster',
  'Lightweight multi-node Kubernetes cluster running local services, automated DNS, and distributed storage.',
  'https://github.com/skarimjonoff',
  'https://github.com/skarimjonoff',
  'https://github.com',
  '["k3s", "Docker", "Prometheus", "Grafana"]',
  1,
  2,
  0
),
(
  'proj_telemetry_pipeline',
  'Centralized Telemetry Stack',
  'High-throughput observability pipeline aggregating container logs, host metrics, and Grafana alerting.',
  'https://github.com/skarimjonoff',
  'https://github.com/skarimjonoff',
  'https://github.com',
  '["Prometheus", "Grafana", "Loki", "Vector"]',
  0,
  3,
  0
),
(
  'proj_edge_gateway',
  'Cloudflare Edge Worker Gateway',
  'Serverless reverse proxy with distributed KV rate-limiting, edge caching, and strict defense-in-depth CSP.',
  'https://github.com/skarimjonoff',
  'https://github.com/skarimjonoff',
  'https://sodops-uz.skarimjonoff.workers.dev/feed.xml',
  '["Cloudflare Workers", "TypeScript", "KV"]',
  0,
  4,
  0
),
(
  'proj_ai_lab',
  'Local AI Agent Lab',
  'Experimental autonomous agent sandbox for code generation, model tool-calling, and local LLM evaluation.',
  'https://github.com/skarimjonoff',
  'https://github.com/skarimjonoff',
  'https://github.com',
  '["Python", "Ollama", "PyTorch", "Docker"]',
  0,
  5,
  0
);

-- Seed initial 30-day uptime checks for each project
WITH RECURSIVE days(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM days WHERE n < 29
)
INSERT INTO uptime_checks (project_id, timestamp, status, status_code, latency_ms)
SELECT 'proj_sodops_uz', datetime('now', '-' || n || ' days'), 'up', 200, 35 + (n * 3 % 20)
FROM days;

WITH RECURSIVE days(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM days WHERE n < 29
)
INSERT INTO uptime_checks (project_id, timestamp, status, status_code, latency_ms)
SELECT 'proj_k3s_homelab', datetime('now', '-' || n || ' days'), CASE WHEN n = 12 THEN 'degraded' ELSE 'up' END, 200, 42 + (n * 2 % 15)
FROM days;

WITH RECURSIVE days(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM days WHERE n < 29
)
INSERT INTO uptime_checks (project_id, timestamp, status, status_code, latency_ms)
SELECT 'proj_telemetry_pipeline', datetime('now', '-' || n || ' days'), 'up', 200, 50 + (n * 4 % 25)
FROM days;

WITH RECURSIVE days(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM days WHERE n < 29
)
INSERT INTO uptime_checks (project_id, timestamp, status, status_code, latency_ms)
SELECT 'proj_edge_gateway', datetime('now', '-' || n || ' days'), 'up', 200, 22 + (n * 3 % 10)
FROM days;

WITH RECURSIVE days(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM days WHERE n < 29
)
INSERT INTO uptime_checks (project_id, timestamp, status, status_code, latency_ms)
SELECT 'proj_ai_lab', datetime('now', '-' || n || ' days'), 'up', 200, 68 + (n * 5 % 30)
FROM days;
