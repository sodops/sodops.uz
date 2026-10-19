## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

> **Full conventions, design tokens, architecture rules, and coding standards are in [CLAUDE.md](./CLAUDE.md).**
> Read it before making any changes to this project.

## Quick Reference

```bash
pnpm dev          # Dev server (hot reload, no Cloudflare bindings)
pnpm build        # Production build
pnpm typecheck    # astro check (TypeScript + Astro types)
pnpm lint         # ESLint
pnpm test         # Run unit tests (auth.test.ts via tsx)
pnpm format       # Prettier
npx wrangler dev  # Local Cloudflare emulation (D1, R2, KV, crons)
```

## Cloudflare Bindings (local dev)

Create `.dev.vars` (git-ignored) for local secrets:

```
ADMIN_EMAIL=me@sodops.uz
CF_ACCESS_AUD=<your-access-aud-claim>
```

Run `npx wrangler d1 execute sodops-db --local --file=schema.sql` to seed the local D1 database.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
