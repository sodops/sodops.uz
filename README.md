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
pnpm test             # Run 73 unit tests (auth, db, markdown, search, status, minecraft, upload)
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
