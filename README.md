# sodops.uz

Fast, minimal, text-first personal publishing platform and infrastructure status monitor for Sodiq (DevOps Engineer & AI Student based in Tashkent, Uzbekistan).

Built with **Astro 5 / 7 (on-demand SSR mode)**, **Tailwind CSS v4**, **Preact**, and **Cloudflare Workers / D1 / KV / R2**.

---

## 1. Features & Principles

- **Text-First & Minimal**: Inspired by antfu.me, high typographic density, narrow reading column (~65ch / 720px), generous whitespace, subtle 1px dividers.
- **Terminal Emerald Accent**: Neutral zinc palette with high-contrast `#047857` (light) / `#34D399` (dark) accents ensuring WCAG AAA accessibility.
- **Instant Publishing**: Dynamic on-demand edge rendering backed by Cloudflare D1 with Astro route caching and CDN tag invalidation (`Astro.cache.set({ tags: ['blog'] })`).
- **Private Admin Dashboard**: Protected by Cloudflare Access with cryptographic RS256 JWT assertion checks, split-screen Markdown preview, and R2 image uploads.
- **Edge Status Monitoring**: Cloudflare Cron Trigger (`*/5 * * * *`) concurrently pinging owned endpoints (HTTP, TCP, and Minecraft Server List Ping) with latency telemetry and 30-day uptime bars.
- **Keyboard-First**: Global Cmd/Ctrl+K command palette with keyboard navigation, fuzzy filtering, and smooth transitions.
- **Content Safety**: Controlled by `SITE_INDEXING` env var (default: `"off"`), serving strict `noindex, nofollow`, `robots.txt Disallow: /`, and 404 for unadvertised sitemaps until public launch.

---

## 2. Essential Commands

```bash
# Dependencies
pnpm install

# Development
pnpm dev              # Astro dev server (hot reload)
astro dev --background# Run dev server in background (see AGENTS.md)
npx wrangler dev      # Local Cloudflare emulation (D1, KV, R2, crons)

# Code Quality & Tests
pnpm typecheck        # astro check (TypeScript & Astro types)
pnpm lint             # ESLint
pnpm test             # Run unit tests (auth, db, markdown, search, status, minecraft, upload)
pnpm test:e2e         # Playwright real-browser tests against headless Chromium
pnpm todos            # List all TODO(sodiq) content placeholders

# Production Build & Deployment
pnpm build            # Astro build + build-time CSP inline script hash verification
npx wrangler deploy   # Deploy worker and static assets to Cloudflare
```

---

## 3. Architecture & Cloudflare Bindings

| Binding | Type | Purpose |
| :--- | :--- | :--- |
| `env.DB` | Cloudflare D1 | SQLite database storing posts, tags, projects, and uptime telemetry |
| `env.SESSION` | Cloudflare KV | Session store required by `@astrojs/cloudflare` v14 |
| `env.IMAGES` | Cloudflare Images | Image transformation binding |
| `env.ASSETS` | Cloudflare Assets | Static client assets emitted to `dist/client` |
| `triggers.crons` | Cron Triggers | Runs status monitor every 5 minutes (`*/5 * * * *`) |
| `Access` | Cloudflare Access | Zero Trust authentication guarding `/admin/*` and `/api/admin/*` |

---

## 4. Security Architecture

1. **Defense-in-Depth Authentication**:
   - Every admin route (`/admin`, `/api/admin/*`) cryptographically verifies the `Cf-Access-Jwt-Assertion` header.
   - Validates RS256 signature against Cloudflare Access JWKS public keys, `aud` claim, `iss` claim (`https://sodops.cloudflareaccess.com`), expiration (`exp`), and allowed email addresses (`ADMIN_EMAILS`).
   - Production requests strictly fail closed (401/403) if headers, credentials, or environment variables are missing or forged.
2. **Content Security Policy (CSP)**:
   - Zero `unsafe-inline` scripts on public pages.
   - Build-time script hash verification (`scripts/verify-csp-hashes.mjs`) automatically ensures all emitted Astro island hydrators match the CSP `script-src` directive.
   - Fonts are emitted as static files (`build.assetsInlineLimit: 0`), enforcing strict `font-src 'self'` without `data:`.
   - Strict Transport Security: `Strict-Transport-Security: max-age=15552000`.
3. **Upload Sanitization**:
   - Supported images: PNG, JPEG, WebP, GIF.
   - Strict magic byte validation and 5MB size limit.
   - SVG uploads are strictly rejected to eliminate stored XSS vectors.

---

## 5. Launch Checklist

Follow these operational steps before opening the site to public traffic:

- [ ] **Cloudflare Access Zero Trust Application**:
  Create an Access Application in Cloudflare Zero Trust covering `preview.sodops.uz/admin*` and `sodops.uz/admin*` under team domain `sodops.cloudflareaccess.com`.
- [ ] **Set Production Secrets**:
  - `wrangler secret put CF_ACCESS_AUD` (set to the Application Audience AUD tag claim from Cloudflare Access).
  - `wrangler secret put ADMIN_EMAILS` (comma-separated list of authorized administrator emails, e.g. primary email and GitHub account email).
- [ ] **Content Personalization**:
  Run `pnpm todos` to inspect all `TODO(sodiq)` placeholders. Fill in your hardware/software setup in `src/pages/uses.astro`, active focus areas in `src/pages/now.astro`, and project summaries in `scripts/seed-projects.sql`.
- [ ] **Minecraft Status Monitoring**:
  Ensure the DNS record for `mc.sodops.uz` is set to DNS-only (gray-clouded, unproxied) in Cloudflare DNS so direct TCP Server List Ping packets reach port 25565 without Cloudflare proxy interception. Unpause monitoring via `UPDATE projects SET status = 'active' WHERE id = 'proj_mc_sodops_uz';`.
- [ ] **Initial Content Publishing**:
  Log into `/admin` via Cloudflare Access, review seed posts, edit or write your first post, and toggle `Published`.
- [ ] **Public Search Indexing**:
  Change `"SITE_INDEXING": "off"` to `"SITE_INDEXING": "on"` in `wrangler.jsonc` and run `npx wrangler deploy`. This removes the default `noindex, nofollow` headers, enables public indexing in `robots.txt`, and advertises `sitemap.xml`.

---

## 6. Post-Launch Backlog (Deferred Features)

The following features were intentionally deferred to maintain strict edge CPU budgets, security isolation, and sub-100ms response times:

1. **Dynamic Per-Post OG Images**: Dynamic canvas/SVG generation at request time is deferred to avoid exceeding Free-plan Worker CPU budgets. Static high-resolution brand cards (`/og.png`, `/og.svg`) are currently served.
2. **ZIP Bulk Archive Export & Import**: Single-click archive ZIP packaging of all posts and uploaded media from `/admin` is deferred to a future maintenance milestone.
3. **Third-Party Monitoring Allowlist**: Monitoring targets are strictly restricted to `sodops.uz` and its verified subdomains. Third-party HTTP/TCP endpoints are deferred to avoid edge SSRF concerns.
4. **Phase 7 3D Visualizations**: Three.js / WebGL canvas interactive components are deferred to preserve the lightweight, zero-bloat, text-first reading experience.

---

## 7. Cloudflare Access Configuration & Troubleshooting

### One Application, Multiple Destinations
Configure **exactly ONE** Self-hosted Access Application in Cloudflare Zero Trust to protect all administrative routes across environments:
- **Application Type**: Self-hosted
- **Application Name**: `sodops-admin`
- **Application Domain / Destinations**:
  1. Domain: `sodops.uz`, Path: `admin*`
  2. Domain: `preview.sodops.uz`, Path: `admin*`
- **Session Duration**: 24 hours (or per operational policy)

> [!IMPORTANT]
> Never create separate Access applications for production and preview if they share the same codebase secrets. Using one application ensures a single Application Audience (`CF_ACCESS_AUD`) tag covers both environments.

### How to Retrieve the Application Audience (AUD) Tag
1. Log into the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Navigate to **Access** -> **Applications**.
3. Select your admin application (`sodops-admin`) and click **Edit**.
4. In the **Overview** tab, find the **Application Audience (AUD)** tag (a 64-character hexadecimal string).
5. Provision this value as a Worker secret:
   ```bash
   npx wrangler secret put CF_ACCESS_AUD
   ```

### Common Errors & Diagnostics

| Error / Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **Whole-domain 302 redirect on public pages (`/`, `/api/health`, `/blog`)** | The Access Application destination was created with Domain: `sodops.uz` but Path was left blank or set to `*`. This places Zero Trust authentication in front of the entire website. | Edit the Access Application destination. Set Domain to `sodops.uz` and explicitly set Path to `admin*`. Public visitors and cron health checks must never hit an Access login redirect. |
| **`401 Unauthorized` (Audience mismatch)** | The Worker's `CF_ACCESS_AUD` secret does not match the `aud` claim in the incoming `Cf-Access-Jwt-Assertion` token. Workers Logs will log `[Admin Auth Guard] 401 Unauthorized: Audience mismatch: expected ... got ...`. | Verify the AUD tag in Cloudflare Zero Trust -> Access -> Applications -> Edit -> Overview, then run `npx wrangler secret put CF_ACCESS_AUD` to update the secret. |
| **`403 Forbidden` (Unauthorized email)** | The user passed Cloudflare Access authentication, but the email in their JWT payload is not present in the Worker's `ADMIN_EMAILS` secret list. Workers Logs will log `[Admin Auth Guard] 403 Forbidden: Unauthorized email address: user@example.com`. | Update the `ADMIN_EMAILS` secret with a comma-separated list of authorized email addresses: `npx wrangler secret put ADMIN_EMAILS`. |
| **`401 Unauthorized` (Missing token or misconfigured team domain)** | Request reached `/admin` without going through Cloudflare Access, or `CF_ACCESS_TEAM_DOMAIN` secret/env is missing or invalid. Workers Logs will log `[Admin Auth Guard] 401 Unauthorized: Missing Cf-Access-Jwt-Assertion header` or `CF_ACCESS_TEAM_DOMAIN is required`. | Ensure access is routed through the Access domain, and verify `CF_ACCESS_TEAM_DOMAIN` is set to `sodops.cloudflareaccess.com` in `wrangler.jsonc` or secrets. |

---

## 8. Backup, Restore, Release & Rollback Procedures

### 8.1 Cloudflare D1 Database Backups

```bash
# Export remote production database to an SQL dump
npx wrangler d1 export sodops-db --remote --output=backups/backup-$(date +%F).sql

# Export local development database
npx wrangler d1 export sodops-db --local --output=backups/local-backup-$(date +%F).sql
```

### 8.2 D1 Point-in-Time Restore (Time Travel & SQL Import)

Cloudflare D1 includes native **Time Travel**, maintaining a continuous transaction log for up to 30 days:

```bash
# 1. Inspect database bookmarks and restore points
npx wrangler d1 time-travel info sodops-db

# 2. Restore production database to a specific UTC timestamp
npx wrangler d1 time-travel restore sodops-db --timestamp="2026-10-20T10:00:00Z"

# 3. Alternatively, restore from a verified SQL backup file
npx wrangler d1 execute sodops-db --remote --file=backups/backup-2026-10-20.sql
```

### 8.3 Release Procedure

1. **Verify Local Quality Suite**:
   ```bash
   pnpm qa
   ```
2. **Review Pending Content Placeholders**:
   ```bash
   pnpm todos
   ```
3. **Build & Verify CSP Inline Script Hashes**:
   ```bash
   pnpm build
   ```
4. **Deploy to Cloudflare Workers**:
   ```bash
   npx wrangler deploy
   ```
5. **Verify Live Production Deployment**:
   ```bash
   pnpm qa:prod
   ```

### 8.4 Rollback Procedure

- **Worker Code & Assets Rollback**:
  ```bash
  # List recent deployments
  npx wrangler deployments list

  # Instant rollback to previous known-good deployment
  npx wrangler rollback [deployment-id]
  ```
- **Database Rollback**:
  If a deployment corrupted or dropped D1 tables, immediately roll back database state using Time Travel:
  ```bash
  npx wrangler d1 time-travel restore sodops-db --timestamp="<pre-deploy-iso-timestamp>"
  ```

