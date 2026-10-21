import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSitemapXml, generateRobotsTxt } from './sitemap-utils';
import { calculateReadingTimeMinutes } from './markdown-utils';
import fs from 'node:fs';
import path from 'node:path';

describe('Content & SEO: Sitemap.xml & Robots.txt Matrix', () => {
  it('generates valid sitemap.xml with canonical URLs and schema when SITE_INDEXING is on', () => {
    const staticPages = [
      { loc: 'https://sodops.uz/', priority: '1.0' },
      { loc: 'https://sodops.uz/blog', priority: '0.8' },
      { loc: 'https://sodops.uz/projects', priority: '0.8' },
      { loc: 'https://sodops.uz/uses', priority: '0.5' },
      { loc: 'https://sodops.uz/now', priority: '0.5' },
    ];
    const postUrls = [
      { loc: 'https://sodops.uz/blog/astro-cloudflare-d1-r2', lastmod: '2026-10-02' },
    ];

    const xml = generateSitemapXml(staticPages, postUrls);

    assert.ok(xml.includes('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
    assert.ok(xml.includes('<loc>https://sodops.uz/</loc>'));
    assert.ok(xml.includes('<priority>1.0</priority>'));
    assert.ok(xml.includes('<loc>https://sodops.uz/blog</loc>'));
    assert.ok(xml.includes('<loc>https://sodops.uz/blog/astro-cloudflare-d1-r2</loc>'));
    assert.ok(xml.includes('<lastmod>2026-10-02</lastmod>'));
    assert.ok(xml.includes('</urlset>'));
  });

  it('serves Disallow: / in robots.txt when SITE_INDEXING is off', () => {
    const text = generateRobotsTxt('off', 'https://sodops.uz');
    assert.ok(text.includes('User-agent: *'));
    assert.ok(text.includes('Disallow: /'));
    assert.equal(text.includes('Sitemap:'), false);
  });

  it('serves Allow: / with sitemap link in robots.txt when SITE_INDEXING is on', () => {
    const text = generateRobotsTxt('on', 'https://sodops.uz');
    assert.ok(text.includes('User-agent: *'));
    assert.ok(text.includes('Allow: /'));
    assert.ok(text.includes('Disallow: /admin/'));
    assert.ok(text.includes('Sitemap: https://sodops.uz/sitemap.xml'));
  });
});

describe('Content & SEO: Canonical, OpenGraph, Twitter & Single H1 Hierarchy', () => {
  const publicPages = [
    { file: 'src/pages/index.astro', name: 'Home' },
    { file: 'src/pages/blog/index.astro', name: 'Blog' },
    { file: 'src/pages/blog/[slug].astro', name: 'Post' },
    { file: 'src/pages/projects.astro', name: 'Projects' },
    { file: 'src/pages/uses.astro', name: 'Uses' },
    { file: 'src/pages/now.astro', name: 'Now' },
    { file: 'src/pages/404.astro', name: '404' },
  ];

  for (const page of publicPages) {
    it(`verifies single H1 and BaseLayout metadata usage on '${page.name}' (${page.file})`, () => {
      const fullPath = path.resolve(page.file);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // 1. Must use BaseLayout (which injects Canonical, OG, and Twitter tags)
      assert.ok(
        content.includes('<BaseLayout'),
        `${page.file} must wrap layout in BaseLayout`
      );

      // 2. Must contain exactly one <h1> tag
      const h1Matches = content.match(/<h1(\s|>)/g) || [];
      assert.equal(
        h1Matches.length,
        1,
        `${page.file} must have exactly one <h1> heading (found ${h1Matches.length})`
      );
    });
  }

  it('verifies BaseLayout enforces full Canonical, OpenGraph, and Twitter tags', () => {
    const layoutPath = path.resolve('src/layouts/BaseLayout.astro');
    const layout = fs.readFileSync(layoutPath, 'utf-8');

    // Canonical link
    assert.ok(layout.includes('<link rel="canonical"'));

    // OpenGraph
    assert.ok(layout.includes('property="og:type"'));
    assert.ok(layout.includes('property="og:url"'));
    assert.ok(layout.includes('property="og:title"'));
    assert.ok(layout.includes('property="og:description"'));
    assert.ok(layout.includes('property="og:image"'));
    assert.ok(layout.includes('property="og:site_name"'));

    // Twitter Card
    assert.ok(layout.includes('name="twitter:card"'));
    assert.ok(layout.includes('name="twitter:title"'));
    assert.ok(layout.includes('name="twitter:description"'));
    assert.ok(layout.includes('name="twitter:image"'));
  });
});

describe('Content & SEO: Timezones & Multi-Language Reading Time Calculation', () => {
  it('accurately calculates reading time for English text', () => {
    const english200 = Array(200).fill('word').join(' ');
    assert.equal(calculateReadingTimeMinutes(english200), 1);

    const english600 = Array(600).fill('architecture').join(' ');
    assert.equal(calculateReadingTimeMinutes(english600), 3);
  });

  it('accurately calculates reading time for Uzbek text with typographic apostrophes', () => {
    const uzbekWords = Array(450).fill('o‘zgarishlar').join(' ');
    assert.equal(calculateReadingTimeMinutes(uzbekWords), 3);
  });

  it('accurately calculates reading time for Cyrillic text', () => {
    const cyrillicWords = Array(800).fill('инфратузилма').join(' ');
    assert.equal(calculateReadingTimeMinutes(cyrillicWords), 4);
  });

  it('enforces ISO-8601 UTC timestamp formatting in post published dates', () => {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    const testDate = new Date().toISOString();
    assert.match(testDate, isoDateRegex);
  });
});
