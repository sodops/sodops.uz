import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_COPY, isSiteCopyKey, validateSiteCopyInput, MAX_COPY_BYTES,
  getSiteCopy, loadSiteCopy, setSiteCopy, resetSiteCopy,
} from './site-content';

function stubDb(overrides: Array<{ key: string; value: string }> = []) {
  const batches: Array<Array<{ sql: string; args: unknown[] }>> = [];
  const db = {
    prepare(sql: string) {
      return {
        sql, args: [] as unknown[],
        bind(...args: unknown[]) { this.args = args; return this; },
        async all() { return { results: overrides }; },
        async first() { return null; },
      };
    },
    async batch(statements: Array<{ sql: string; args: unknown[] }>) {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
  return { db: db as unknown as D1Database, batches };
}

describe('Visual site content allowlist & text-only persistence', () => {
  it('allows only registered copy slots', () => {
    assert.ok(isSiteCopyKey('home.greeting'));
    assert.ok(isSiteCopyKey('uses.cloud.0.name'));
    assert.equal(isSiteCopyKey('admin.password'), false);
    assert.equal(isSiteCopyKey('__proto__'), false);
    assert.equal(isSiteCopyKey('constructor'), false);
  });

  it('rejects blank, wrong-type, oversized and unregistered edits', () => {
    assert.ok(validateSiteCopyInput('home.greeting',' '));
    assert.ok(validateSiteCopyInput('home.greeting', null));
    assert.ok(validateSiteCopyInput('home.greeting','x'.repeat(MAX_COPY_BYTES + 1)));
    assert.ok(validateSiteCopyInput('admin.password','not allowed'));
    assert.equal(validateSiteCopyInput('home.greeting','Updated headline'), null);
  });

  it('loads D1 overrides but drops unknown database keys', async () => {
    const m = stubDb([
      { key: 'home.greeting', value: 'Hi from D1!' },
      { key: 'admin.password', value: 'leak' },
    ]);
    const overrides = await loadSiteCopy(m.db);
    assert.deepEqual(overrides, { 'home.greeting': 'Hi from D1!' });
    assert.equal(getSiteCopy({siteCopy: overrides} as unknown as App.Locals,'home.greeting'), 'Hi from D1!');
    assert.equal(getSiteCopy({} as App.Locals,'home.greeting'), SITE_COPY['home.greeting']);
  });

  it('creates schema and writes text plus revision history', async () => {
    const m = stubDb();
    await setSiteCopy(m.db,'home.greeting','New heading','owner@example.com');
    assert.equal(m.batches.length,2);
    assert.equal(m.batches[0].length,2);
    assert.equal(m.batches[1].length,2);
    assert.match(m.batches[1][0].sql,/INSERT INTO site_content/);
    assert.match(m.batches[1][1].sql,/site_content_history/);
  });

  it('restores default by deleting an override but preserving audit history', async () => {
    const m = stubDb();
    await resetSiteCopy(m.db,'home.greeting','owner@example.com');
    assert.equal(m.batches.length,2);
    assert.match(m.batches[1][0].sql,/DELETE FROM site_content/);
    assert.match(m.batches[1][1].sql,/site_content_history/);
  });
});
