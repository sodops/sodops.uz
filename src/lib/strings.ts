// Centralized UI strings for sodops.uz
// Structured to easily allow adding Uzbek (uz) translations in the future.

export const strings = {
  site: {
    name: 'sodops.uz',
    author: 'Sodiq',
    title: 'Sodiq - DevOps Engineer & AI Student',
    description:
      'DevOps-oriented developer and AI student based in Tashkent, Uzbekistan. Building fast, minimal infrastructure and systems.',
    location: 'Tashkent, Uzbekistan',
    domain: 'sodops.uz',
    email: 'admin@example.com',
    github: 'https://github.com/sodops',
  },
  nav: {
    blog: 'Blog',
    projects: 'Projects',
    uses: 'Uses',
    now: 'Now',
    admin: 'Admin',
    commandPalette: 'Command palette (Ctrl+K)',
    toggleTheme: 'Toggle theme',
    rss: 'RSS Feed',
  },
  home: {
    greeting: "Hi, I'm Sodiq.",
    bioLine1: 'DevOps-oriented developer and AI student based in Tashkent, Uzbekistan.',
    bioLine2:
      'I build and automate systems with Docker, Kubernetes (k3s), Prometheus, Grafana, Loki, Cloudflare, and DigitalOcean.',
    bioLine3:
      'Passionate about minimal, fast web architecture, edge compute, and reliable observability.',
    nowTeaser: 'Currently exploring local LLM agents and containerized microservices.',
    nowLinkText: 'See what I am doing now',
    latestPosts: 'Recent Posts',
    allPosts: 'All posts',
    featuredProjects: 'Featured Projects',
    allProjects: 'All projects',
  },
  blog: {
    title: 'Writing',
    description: 'Notes on DevOps, infrastructure, edge architecture, and AI.',
    readingTime: 'min read',
    publishedOn: 'Published on',
    tags: 'Tags',
    tableOfContents: 'Table of Contents',
    sharePost: 'Share post',
    copiedLink: 'Link copied!',
    prevPost: 'Previous',
    nextPost: 'Next',
    backToBlog: '← Back to all posts',
    noPostsYet: 'No published posts yet. Check back soon!',
  },
  projects: {
    title: 'Projects',
    description: 'Websites, infrastructure services, and tools I maintain.',
    liveStatus: 'Live Status',
    uptime30d: '30-day uptime',
    latency: 'Latency',
    statusUp: 'Operational',
    statusDegraded: 'Degraded',
    statusDown: 'Outage',
    viewSite: 'Visit site',
    viewSource: 'Source code',
  },
  uses: {
    title: 'Uses',
    description: 'Hardware, software, devops tooling, and homelab setup I use daily.',
  },
  now: {
    title: 'Now',
    description: 'What I am focused on right now.',
    updated: 'Last updated',
  },
  footer: {
    license: 'CC BY-NC-SA 4.0',
    allRightsReserved: 'All rights reserved.',
  },
  common: {
    loading: 'Loading...',
    error: 'Something went wrong.',
    notFound: 'Page not found',
    backHome: '← Back to home',
  },
} as const;

export type Strings = typeof strings;
