/**
 * Pure utilities for generating sitemap.xml and robots.txt.
 * Isolated from virtual modules (astro:content, cloudflare:workers)
 * for testability in Node unit test runners.
 */

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  priority?: string;
}

export function generateSitemapXml(
  staticPages: SitemapEntry[],
  postUrls: SitemapEntry[]
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${page.loc}</loc>
    ${page.priority ? `<priority>${page.priority}</priority>` : ''}
  </url>`
  )
  .join('\n')}
${postUrls
  .map(
    (post) => `  <url>
    <loc>${post.loc}</loc>
    ${post.lastmod ? `<lastmod>${post.lastmod}</lastmod>` : ''}
    <priority>0.7</priority>
  </url>`
  )
  .join('\n')}
</urlset>`.trim();
}

export function generateRobotsTxt(siteIndexing: string, siteUrl: string): string {
  const isIndexingOn = siteIndexing.toLowerCase() === 'on';
  const cleanUrl = siteUrl.replace(/\/$/, '');

  if (!isIndexingOn) {
    return 'User-agent: *\nDisallow: /\n';
  }

  return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/admin/\n\nSitemap: ${cleanUrl}/sitemap.xml\n`;
}
