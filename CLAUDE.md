# CLAUDE.md: Project Reference & Development Rules (sodops.uz)

Personal website and publishing platform for Sodiq (DevOps-oriented developer and AI student based in Tashkent, Uzbekistan).

---

## 1. Tech Stack

- **Framework**: Astro (latest stable 7.x) in hybrid/on-demand SSR mode (`output: 'server'`) with `@astrojs/cloudflare` adapter.
- **Language**: TypeScript (strict mode enabled).
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` and `@import "tailwindcss";` in `src/styles/global.css`.
- **UI Islands**: Preact (`@astrojs/preact`) used strictly for interactive islands (Cmd+K palette, Markdown split editor, project live status).
- **Edge & Cloud**:
  - Cloudflare Pages / Workers
  - Cloudflare D1 (SQLite at the edge for blog posts, tags, uptime history)
  - Cloudflare R2 (image uploads)
  - Cloudflare Cron Triggers (`scheduled()` handler in custom worker entrypoint)
  - Cloudflare Access (`Cf-Access-Jwt-Assertion` cryptographic verification defense-in-depth)
- **Typography**: Inter (body/UI) & JetBrains Mono (code/status) self-hosted via `@fontsource`.
- **Package Manager**: `pnpm`.

---

## 2. Essential Commands

```bash
# Development
pnpm dev             # Start local Astro dev server
pnpm preview         # Build and preview locally with Astro
pnpm build           # Build for production / Cloudflare

# Local Cloudflare emulation
pnpm wrangler dev    # Run with local workerd runtime & D1/R2 emulation

# Code Quality & Tests
pnpm typecheck       # astro check / tsc --noEmit
pnpm lint            # eslint . --ext .js,.ts,.astro
pnpm format          # prettier --write .
pnpm test            # Run unit tests (auth, db, markdown, search, status, minecraft, upload)
pnpm test:e2e        # Run Playwright real-browser tests (Chromium, CSP, console, network)
pnpm todos           # List all TODO(sodiq) placeholders across the codebase
```

---

## 3. Design Tokens & Visual Principles

- **Aesthetic**: Minimal, text-first (inspired by antfu.me). Narrow reading column (~65ch / 720px), generous whitespace, subtle 1px dividers.
- **Accent Color**: **Terminal Emerald**
  - Light mode: `#059669` (accent) / `#ECFDF5` (subtle)
  - Dark mode: `#34D399` (accent) / `#064E3B` (subtle)
- **Neutrals**: Slate/Zinc (`neutral-50` to `neutral-950`).
- **Theme Handling**:
  - Default: System preference via `@media (prefers-color-scheme: dark)`.
  - Manual toggle: Persisted in `localStorage.getItem('theme')`.
  - Anti-FOUC: Inline `<script is:inline>` in `<head>` executes before rendering.
  - Reduced Motion: Respect `prefers-reduced-motion: reduce` everywhere.

---

## 4. Architecture & Key Rules

1. **Rendering & Caching**:
   - All pages (`/`, `/blog`, `/projects`, `/uses`, `/now`, `/404`) are rendered on-demand (`export const prerender = false`) through Cloudflare Workers.
   - Caching uses Astro's route cache via `cacheCloudflare()` provider configured in `astro.config.mjs` and `Astro.cache.set({ maxAge, swr, tags })`.
   - Tags like `['home', 'blog', 'projects', 'pages']` are used so that admin can call `Astro.cache.invalidate({ tags: ['blog'] })` for instant CDN purging.
   - Vite `build.assetsInlineLimit: 0` ensures fonts and assets are emitted as external files, allowing strict `font-src 'self'` without `data:`.
2. **Session KV Namespace**:
   - The `SESSION` KV namespace in `wrangler.jsonc` is automatically used by `@astrojs/cloudflare` v14 to store Astro sessions. It must be kept configured.
3. **Cron Triggers (Status Checks) & Limits**:
   - Wired via `wrangler.jsonc` (`triggers.crons: ["*/5 * * * *"]`).
   - Implemented via custom worker entrypoint (`src/worker.ts`) exporting `scheduled()` that calls `src/lib/status.ts` directly.
   - Cloudflare Workers Free allows 10 ms CPU per request and 5 Cron Triggers per account.
   - Cloudflare Workers Paid provides default 30 s CPU per request (max 5 minutes) and 250 Cron Triggers per account.
   - Paused projects (`status: 'paused'`) are strictly skipped by the cron, show "coming soon" in UI, and are excluded from overall banner and uptime math.
   - Status checks for `sodops.uz` probe `/api/health` (no-store, lightweight D1 SELECT 1) to prevent self-inflicted cache misses.
4. **Public Content Safety & Indexing**:
   - Controlled by `SITE_INDEXING` environment variable (default: `"off"`).
   - While `SITE_INDEXING` is `"off"`: `X-Robots-Tag: noindex, nofollow` is sent on all hosts, `robots.txt` serves `Disallow: /`, `<meta name="robots" content="noindex, nofollow">` is rendered, and `sitemap.xml` returns 404 + noindex.
   - Never write invented facts about Sodiq. Any unstated facts must use `TODO(sodiq)` placeholders, listed via `pnpm todos`.
5. **Admin Security & Authentication**:
   - `/admin/*` and `/api/admin/*` are protected by Cloudflare Access under team domain `sodops.cloudflareaccess.com` (team name `sodops`).
   - Must be accessed via custom domain (`preview.sodops.uz`, later adding apex `sodops.uz`); does not work on ephemeral `*.workers.dev`.
   - API endpoints verify `Cf-Access-Jwt-Assertion` cryptographic RS256 signature against Access JWKS certs, `aud` claim, `iss` claim (`https://sodops.cloudflareaccess.com`), future `exp`, and email matching.
   - Allowed emails are loaded from `ADMIN_EMAILS` (comma-separated, allowing primary email + GitHub OAuth).
   - `DEV_BYPASS_AUTH` is honored **only** when `import.meta.env.DEV === true` AND `host === 'localhost' | '127.0.0.1'`. Otherwise, fail closed.
6. **R2 Uploads & Images**:
   - Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/avif`, `image/gif`.
   - **`image/svg+xml` is strictly forbidden** to prevent stored XSS.
   - Max file size: 5MB. Magic bytes validated.
   - Served with correct `Content-Type` and `X-Content-Type-Options: nosniff`.
7. **Content Security Policy (CSP) & Defense in Depth**:
   - Strict XSS protection via `rehype-sanitize` AST schema for rendered Markdown (never regex-based sanitization).
   - Public pages enforce strict CSP (`script-src 'self' <hashes>`) with **zero** `unsafe-inline` scripts. Build-time hash verification via `scripts/verify-csp-hashes.mjs` enforces hash synchronization.
   - `Strict-Transport-Security: max-age=15552000` is enforced on all responses.
   - `frame-src` allows `self` and Sodiq's project domains (`https://sodops.uz`, `https://*.sodops.uz`) for safe iframe previews.
8. **Deferred Features & Out of Scope**:
   - Dynamic per-post OG image generation is deferred ("later").
   - Full archive zip export is deferred ("later").
   - 3D interactive graphics (Three.js / WebGL) are explicitly out of scope for this minimal text-first platform.
9. **Code Conventions & Placeholders**:
   - Keep all UI strings in `src/lib/strings.ts` for future Uzbek (`uz`) localization.
   - Mark incomplete copy or data with `TODO(sodiq)`. Run `pnpm todos` to inspect.
   - Agent runtime instructions are in `AGENTS.md`. Both files cross-reference each other.
