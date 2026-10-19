# sodops.uz

Fast, minimal, text-first personal site and publishing platform for Sodiq (DevOps Engineer & AI Student based in Tashkent, Uzbekistan).

Built with **Astro (v7)**, **Tailwind CSS (v4)**, **Preact**, and **Cloudflare Workers / D1 / R2**.

---

## Features

- **Text-First & Minimal**: Inspired by antfu.me, high typographic density, narrow reading column (~65ch / 720px), generous whitespace, subtle dividers.
- **Terminal Emerald Accent**: Neutral zinc palette with high-contrast `#10B981` (light) / `#34D399` (dark) accents.
- **Immediate Publishing**: Dynamic on-demand edge rendering backed by Cloudflare D1 with edge cache headers (`Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`).
- **Private Admin Panel**: Protected by Cloudflare Access with defense-in-depth JWT assertion checks, split-screen live Markdown preview, and R2 image uploads.
- **Live Status Monitoring**: Cloudflare Cron Trigger pinging endpoints every 5 minutes with latency tracking and 30-day uptime bars.
- **Keyboard-First**: Cmd/Ctrl+K interactive command palette.

---

## Development

```bash
# Install dependencies
pnpm install

# Start local dev server
pnpm dev

# Run unit tests
pnpm test

# Typecheck and lint
pnpm typecheck
pnpm lint
pnpm format

# Build for Cloudflare
pnpm build
```

---

## Manual Cloudflare Deployment Steps

Detailed setup for Cloudflare D1, R2, and Access will be documented as each component is provisioned.
