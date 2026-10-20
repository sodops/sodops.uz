import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAndSanitizeMarkdown,
  sanitizeHtml,
  calculateReadingTimeMinutes,
} from './markdown';
import { isAdminPath, normalizeAdminPath, extractAccessJwt } from './auth';

describe('Admin QA: Hostile Input & XSS Sanitization', () => {
  it('strictly strips <script> tags from title, content, and html', async () => {
    const malicious = '# Hello\n<script>alert("pwned")</script>\nSafe text';
    const output = await renderAndSanitizeMarkdown(malicious);
    assert.equal(output.includes('<script>'), false);
    assert.equal(output.includes('pwned'), false);
    assert.ok(output.includes('Safe text'));
  });

  it('strictly strips onerror and onload inline event handlers', async () => {
    const malicious = '<img src="x" onerror="alert(document.cookie)" onload="fetch(\'/steal\')" />';
    const output = await renderAndSanitizeMarkdown(malicious);
    assert.equal(output.includes('onerror'), false);
    assert.equal(output.includes('onload'), false);
    assert.equal(output.includes('document.cookie'), false);
  });

  it('strictly strips javascript: pseudo-protocols in links and images', async () => {
    const malicious = '[Click Me](javascript:alert("xss"))';
    const output = await renderAndSanitizeMarkdown(malicious);
    assert.equal(output.includes('javascript:'), false);
    assert.equal(output.includes('href="javascript'), false);
  });

  it('strictly strips data: text/html pseudo-protocols in links', async () => {
    const malicious = '[Data Link](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)';
    const output = await renderAndSanitizeMarkdown(malicious);
    assert.equal(output.includes('data:text/html'), false);
  });

  it('strictly strips raw SVG elements and embedded SVG scripts', async () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const output = await renderAndSanitizeMarkdown(malicious);
    assert.equal(output.includes('<script>'), false);
  });

  it('safely handles extreme word length (500-character unbroken string) without layout break', async () => {
    const longWord = 'A'.repeat(500);
    const output = await renderAndSanitizeMarkdown(`Paragraph with ${longWord}`);
    assert.ok(output.includes(longWord));
  });

  it('safely sanitizes deeply nested hostile HTML', async () => {
    const deeplyNested = '<div>'.repeat(50) + '<script>evil()</script>' + '</div>'.repeat(50);
    const output = await sanitizeHtml(deeplyNested);
    assert.equal(output.includes('<script>'), false);
    assert.equal(output.includes('evil()'), false);
  });
});

describe('Admin QA: Unicode, Uzbek Typographic Characters & Emoji', () => {
  it('safely renders Uzbek typographic apostrophes (o‘, g‘, O‘, G‘)', async () => {
    const uzbekText = 'O‘zbekiston texnologiyalari va yangi g‘alabalar haqida.';
    const output = await renderAndSanitizeMarkdown(uzbekText);
    assert.ok(output.includes('O‘zbekiston'));
    assert.ok(output.includes('g‘alabalar'));
  });

  it('safely renders Cyrillic text (Ўзбекистон, Ташкент)', async () => {
    const cyrillicText = '## Ўзбекистон ва Тошкент инфратуzilmasi\nБу булутли тизимлар ҳақида.';
    const output = await renderAndSanitizeMarkdown(cyrillicText);
    assert.ok(output.includes('Ўзбекистон'));
    assert.ok(output.includes('Тошкент'));
  });

  it('safely renders emojis in markdown content and code blocks', async () => {
    const emojiText = '# 🚀 Cloudflare Workers & ⚡ D1 Database\nStatus: 🟢 All systems operational';
    const output = await renderAndSanitizeMarkdown(emojiText);
    assert.ok(output.includes('🚀'));
    assert.ok(output.includes('⚡'));
    assert.ok(output.includes('🟢'));
  });

  it('calculates reading time correctly for non-Latin and Cyrillic text', () => {
    const cyrillicWords = Array(400).fill('Тошкент').join(' ');
    const minutes = calculateReadingTimeMinutes(cyrillicWords);
    assert.equal(minutes, 2);
  });
});

describe('Admin QA: Path Normalization Fuzzing Matrix', () => {
  const adminTestCases = [
    '/admin',
    '/admin/',
    '/ADMIN',
    '/Admin/Dashboard',
    '/admin/../admin',
    '/admin/new',
    '/admin/edit/123',
    '/admin/api/posts',
    '/api/admin',
    '/api/admin/',
    '/api/admin/posts',
    '/api/admin/posts/123',
    '/api/admin/upload',
    '/api/admin/export',
    '/api/admin/import',
    '//admin',
    '///admin///posts',
    '/admin;param=123',
    '/admin%2Fnew',
    '/admin%2fapi%2fposts',
    '/admin\\new',
  ];

  for (const path of adminTestCases) {
    it(`correctly recognizes '${path}' as admin path`, () => {
      assert.equal(isAdminPath(path), true);
    });
  }

  const publicTestCases = [
    '/',
    '/blog',
    '/blog/post-slug',
    '/blog/tag/devops',
    '/projects',
    '/uses',
    '/now',
    '/404',
    '/feed.xml',
    '/sitemap.xml',
    '/robots.txt',
    '/api/health',
    '/api/search.json',
    '/not-admin',
    '/admin-fake',
    '/blog/admin-guide',
  ];

  for (const path of publicTestCases) {
    it(`strictly excludes public path '${path}' from admin boundary`, () => {
      assert.equal(isAdminPath(path), false);
    });
  }

  it('normalizes various admin path permutations', () => {
    assert.equal(normalizeAdminPath('//admin/posts/'), '/admin/posts');
    assert.equal(normalizeAdminPath('/%61dmin/new'), '/admin/new');
    assert.equal(normalizeAdminPath('/admin;param=1'), '/admin');
  });

  it('extracts Access JWT from header or cookie', () => {
    const reqHeader = new Request('https://sodops.uz/admin', {
      headers: { 'cf-access-jwt-assertion': 'jwt-from-header' },
    });
    assert.equal(extractAccessJwt(reqHeader), 'jwt-from-header');

    const reqCookie = new Request('https://sodops.uz/admin', {
      headers: { cookie: 'foo=bar; CF_Authorization=jwt-from-cookie; other=1' },
    });
    assert.equal(extractAccessJwt(reqCookie), 'jwt-from-cookie');

    const reqNone = new Request('https://sodops.uz/admin');
    assert.equal(extractAccessJwt(reqNone), null);
  });
});
