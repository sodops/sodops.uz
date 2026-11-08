import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { savePost, importPosts, deletePost } from './db';

interface Statement {
  sql: string;
  params: unknown[];
  bind(...params: unknown[]): Statement;
}
function mockD1(fail = false) {
  const batches: Statement[][] = [];
  let reads = 0;
  const db = {
    prepare(sql: string): Statement & { first(): Promise<unknown> } {
      return {
        sql,
        params: [],
        bind(...params: unknown[]) { this.params = params; return this; },
        async first() { reads++; return { id: 'p1', tags_str: 'devops' }; },
      };
    },
    async batch(statements: Statement[]) {
      batches.push(statements);
      if (fail) throw new Error('D1 batch rolled back');
      return statements.map((statement) => ({ meta: { changes: statement.sql.startsWith('DELETE FROM posts') ? 1 : 0 } }));
    },
  };
  return { db: db as unknown as Parameters<typeof savePost>[0], batches, get reads() { return reads; } };
}

describe('D1 transactional post writes', () => {
  const post = { id: 'p1', title: 'Hello', slug: 'hello', content: 'Content', tags: ['devops', 'cloud'] };

  it('saves post and all tag mutations in one batch', async () => {
    const mock = mockD1();
    await savePost(mock.db, post);
    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0].length, 6);
    assert.match(mock.batches[0][0].sql, /INSERT INTO posts/);
    assert.equal(mock.reads, 1);
  });

  it('stops after batch failure without reporting success', async () => {
    const mock = mockD1(true);
    await assert.rejects(savePost(mock.db, post), /rolled back/);
    assert.equal(mock.batches.length, 1);
    assert.equal(mock.reads, 0);
  });

  it('builds whole multi-post import before one database batch', async () => {
    const mock = mockD1();
    const count = await importPosts(mock.db, [post, { ...post, id: 'p2', slug: 'world', tags: [] }]);
    assert.equal(count, 2);
    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0].filter((s) => s.sql.includes('INSERT INTO posts')).length, 2);
    assert.equal(mock.reads, 0);
  });

  it('never writes a partially prepared import', async () => {
    const mock = mockD1();
    await assert.rejects(importPosts(mock.db, [
      post, { ...post, id: 'p2', tags: [null as unknown as string] },
    ]));
    assert.equal(mock.batches.length, 0);
  });

  it('does not report success if the whole import batch fails', async () => {
    const mock = mockD1(true);
    await assert.rejects(importPosts(mock.db, [post, { ...post, id: 'p2', slug: 'two' }]), /rolled back/);
    assert.equal(mock.batches.length, 1);
  });

  it('deletes tag associations and post in one batch', async () => {
    const mock = mockD1();
    assert.equal(await deletePost(mock.db, 'p1'), true);
    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0].length, 2);
  });
});
