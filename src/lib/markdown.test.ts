import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAndSanitizeMarkdown,
  calculateReadingTimeMinutes,
  extractHeadings,
} from './markdown';

describe('Markdown Processing & Sanitization', () => {
  it('strictly strips <script> tags and malicious payloads', async () => {
    const input = '# Title\n\n<script>alert("xss")</script>\n\nSafe paragraph.';
    const output = await renderAndSanitizeMarkdown(input);

    assert.ok(!output.includes('<script>'), 'Must not contain <script>');
    assert.ok(!output.includes('alert("xss")'), 'Must not contain script payload');
    assert.ok(output.includes('<p>Safe paragraph.</p>'), 'Must preserve safe paragraph');
  });

  it('strictly strips javascript: pseudo-protocols in links', async () => {
    const input = '[Click Here](javascript:alert("pwned"))';
    const output = await renderAndSanitizeMarkdown(input);

    assert.ok(!output.includes('javascript:'), 'Must not contain javascript: URL');
    assert.ok(
      !output.includes('href="javascript'),
      'Must strip javascript: href attribute'
    );
  });

  it('strictly strips inline event handlers (onerror, onload, onclick)', async () => {
    const input = '<img src="invalid.jpg" onerror="alert(1)" onload="alert(2)" />';
    const output = await renderAndSanitizeMarkdown(input);

    assert.ok(!output.includes('onerror='), 'Must not contain onerror handler');
    assert.ok(!output.includes('onload='), 'Must not contain onload handler');
  });

  it('safely renders code blocks with syntax highlighting classes', async () => {
    const input = '```typescript\nconst greeting: string = "hello";\n```';
    const output = await renderAndSanitizeMarkdown(input);

    assert.ok(
      output.includes('<code class="language-typescript">'),
      'Must contain language code class'
    );
    assert.ok(
      output.includes('<span class="hljs-keyword">const</span>'),
      'Must contain hljs syntax span'
    );
  });

  it('correctly calculates reading time', () => {
    const text = 'word '.repeat(500); // 500 words ~ 3 minutes
    const time = calculateReadingTimeMinutes(text);
    assert.equal(time, 3);
  });

  it('correctly extracts h2 and h3 headings for TOC', () => {
    const markdown =
      '# H1\n## Overview\nSome text\n### Architecture\nMore text\n## Conclusion';
    const headings = extractHeadings(markdown);

    assert.equal(headings.length, 3);
    assert.deepEqual(headings[0], { depth: 2, text: 'Overview', slug: 'overview' });
    assert.deepEqual(headings[1], {
      depth: 3,
      text: 'Architecture',
      slug: 'architecture',
    });
    assert.deepEqual(headings[2], { depth: 2, text: 'Conclusion', slug: 'conclusion' });
  });
});
