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

# Code Quality
pnpm typecheck       # astro check / tsc --noEmit
pnpm lint            # eslint . --ext .js,.ts,.astro
pnpm format          # prettier --write .
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
   - Home page (`/`) and Blog pages (`/blog`, `/blog/[slug]`) are rendered on-demand (`export const prerender = false`) backed by D1.
   - All public on-demand routes must set:
     `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`.
   - Truly static shells (`/uses`, `/now`, `/404`) use `export const prerender = true`.
2. **Cron Triggers (Status Checks)**:
   - Wired via `wrangler.jsonc` (`triggers.crons: ["*/5 * * * *"]`).
   - Implemented via custom worker entrypoint (`src/worker.ts`) exporting `scheduled()` that calls `src/lib/status.ts` directly.
   - No public unauthenticated cron endpoints.
3. **Admin Security & Authentication**:
   - `/admin/*` and `/api/admin/*` are protected by Cloudflare Access.
   - API endpoints verify `Cf-Access-Jwt-Assertion` signature, `aud`, `exp`, and email.
   - `ADMIN_EMAIL` is loaded from environment variables (never hardcoded).
   - `DEV_BYPASS_AUTH` is honored **only** when `import.meta.env.DEV === true` AND `host === 'localhost'`. Otherwise, fail closed.
4. **R2 Uploads & Images**:
   - Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/avif`, `image/gif`.
   - **`image/svg+xml` is strictly forbidden** to prevent stored XSS.
   - Max file size: 5MB. Magic bytes validated.
   - Served with correct `Content-Type` and `X-Content-Type-Options: nosniff`.
5. **Content Security Policy (CSP)**:
   - `frame-src` must whitelist Sodiq's own project domains for safe iframe previews.
   - Strict XSS protection via `rehype-sanitize` for rendered Markdown.
6. **Code Conventions & Placeholders**:
   - Keep all UI strings in `src/lib/strings.ts` for future Uzbek (`uz`) localization.
   - Mark incomplete copy or data with `TODO(sodiq)`.
   - After each phase: run build, typecheck, lint; test thoroughly; report clear summary.
