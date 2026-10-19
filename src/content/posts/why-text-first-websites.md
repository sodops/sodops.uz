---
title: 'Why I Prefer Text-First Personal Websites'
slug: 'why-text-first-websites'
published_at: 2026-09-20T11:00:00Z
excerpt: 'Ditching heavy hero banners, complex design patterns, and bloated client JavaScript for clean typography and high information density.'
cover_image: ''
draft: false
tags: ['design', 'web', 'philosophy']
reading_time_minutes: 3
---

Most personal developer websites today look like landing pages for venture-backed SaaS startups: giant 3D canvas hero banners, full-viewport stock graphics, scroll-jacking animations, and dozens of third-party trackers.

When you strip all of that away, you realize something fundamental: **the web is a hyperlinked document medium**. When someone visits a developer's site, they usually want one of three things:

1. To understand who you are and what you build.
2. To read your thoughts on a technical challenge they are currently solving.
3. To find a quick way to inspect your code or get in touch.

## High Information Density

Text-first design prioritizes the reading experience. By setting a narrow reading column (~65ch to 720px wide), choosing an uncompromisingly legible typeface like **Inter**, and using monospace fonts for code and system badges, the page respects the visitor's time.

There are no popups asking you to subscribe to a newsletter, no cookie consent banners (because there is no tracking), and no layout shifts while web fonts and hero assets trickle in over a spotty mobile network.

## The antfu.me Inspiration

Sites like Anthony Fu's [antfu.me](https://antfu.me) demonstrate the enduring beauty of this philosophy. A short, honest prose introduction with inline links immediately invites exploration. The navigation is featherweight; dark mode transitions seamlessly without flash; and interactions (like a keyboard command palette) are subtle aids rather than distracting spectacles.

```
+----------------------------------------------------+
| ~ sodops.uz       Blog  Projects  Uses  Now  [RSS] |
+----------------------------------------------------+
|                                                    |
| Hi, I'm Sodiq.                                     |
|                                                    |
| I'm a DevOps-oriented developer based in Tashkent. |
| I build minimal, resilient systems...              |
|                                                    |
| Recent Writing                                     |
| - Minimal Observability on k3s         2026-10-15  |
| - Deploying Astro on Cloudflare        2026-10-02  |
|                                                    |
+----------------------------------------------------+
```

## Performance as a Design Feature

When your homepage transfers less than 20 kilobytes of compressed assets and executes zero bloated runtime libraries, it renders almost instantaneously anywhere in the world.

Speed is not just an engineering metric; it is a sign of respect for your readers.
