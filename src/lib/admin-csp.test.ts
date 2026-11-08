import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Admin strict CSP regression', () => {
  it('serves the dashboard script externally instead of inline', () => {
    const page = readFileSync('src/pages/admin/index.astro', 'utf8');
    const script = readFileSync('public/admin.js', 'utf8');
    assert.match(page, /<script is:inline src="\/admin\.js" defer><\/script>/);
    assert.doesNotMatch(page, /<script is:inline>/);
    assert.match(script, /getElementById\('admin-app'\)/);
  });

  it('never grants unsafe-inline script execution to admin routes', () => {
    const middleware = readFileSync('src/middleware.ts', 'utf8');
    assert.doesNotMatch(middleware, /script-src 'self' 'unsafe-inline'/);
    assert.match(middleware, /scriptSrcDirective = `script-src 'self'/);
  });
});
