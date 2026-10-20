import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex } from './search';

describe('Search API: Index Generation & Draft Exclusion', () => {
  it('includes standard top-level navigation pages in search index', () => {
    const items = buildSearchIndex([]);
    const urls = items.map((i) => i.url);

    assert.ok(urls.includes('/'));
    assert.ok(urls.includes('/blog'));
    assert.ok(urls.includes('/projects'));
    assert.ok(urls.includes('/uses'));
    assert.ok(urls.includes('/now'));
  });

  it('includes published posts with proper title, url, and metadata', () => {
    const mockPosts = [
      {
        id: 'post-1',
        title: 'Production Linux Deployments',
        slug: 'production-linux-deployments',
        excerpt: 'Hardening Ubuntu and k3s clusters.',
        published: 1,
        published_at: '2026-10-15T12:00:00Z',
        tags: ['linux', 'k3s', 'security'],
      },
    ];

    const items = buildSearchIndex(mockPosts);
    const postItem = items.find((i) => i.url === '/blog/production-linux-deployments');

    assert.ok(postItem, 'Published post should be in index');
    assert.equal(postItem?.type, 'post');
    assert.equal(postItem?.title, 'Production Linux Deployments');
    assert.equal(postItem?.date, '2026-10-15');
    assert.ok(postItem?.keywords.includes('linux k3s security'));
  });

  it('strictly excludes draft posts (published: 0)', () => {
    const mixedPosts = [
      {
        id: 'post-1',
        title: 'Public Guide to Prometheus',
        slug: 'public-guide-to-prometheus',
        excerpt: 'Monitoring everything.',
        published: 1,
        published_at: '2026-10-18T10:00:00Z',
        tags: ['monitoring'],
      },
      {
        id: 'post-draft-secret',
        title: 'Draft Secret Plans for 2027',
        slug: 'draft-secret-plans-for-2027',
        excerpt: 'Confidential unreleased draft.',
        published: 0,
        published_at: null,
        tags: ['secret'],
      },
      {
        id: 'post-draft-flag',
        title: 'Unpublished Draft Article',
        slug: 'unpublished-draft-article',
        excerpt: 'Not ready yet.',
        draft: true,
        tags: ['draft'],
      },
    ];

    const items = buildSearchIndex(mixedPosts);
    const urls = items.map((i) => i.url);

    // Published post must be present
    assert.ok(urls.includes('/blog/public-guide-to-prometheus'));

    // Draft posts must strictly NOT be present
    assert.equal(urls.includes('/blog/draft-secret-plans-for-2027'), false);
    assert.equal(urls.includes('/blog/unpublished-draft-article'), false);

    // No item in search index should expose confidential draft keywords or titles
    const allKeywords = items.map((i) => i.keywords).join(' ');
    assert.equal(allKeywords.includes('Confidential unreleased draft'), false);
    assert.equal(allKeywords.includes('draft-secret-plans'), false);
  });
});
