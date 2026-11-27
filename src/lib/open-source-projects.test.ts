import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPEN_SOURCE_PROJECTS, repoUrl } from './open-source-projects';

describe('open source projects list', () => {
  it('has unique repositories with complete entries', () => {
    const repos = OPEN_SOURCE_PROJECTS.map((p) => p.repo);
    assert.equal(new Set(repos).size, repos.length);
    for (const p of OPEN_SOURCE_PROJECTS) {
      assert.match(p.repo, /^[A-Za-z0-9._-]+$/);
      assert.ok(p.name.trim() && p.description.trim(), `${p.repo} needs a name and description`);
      assert.ok(p.tags.length > 0, `${p.repo} needs at least one tag`);
      assert.ok(!p.description.includes('TODO'), `${p.repo} has placeholder copy`);
    }
  });

  it('builds github.com/sodops repository URLs', () => {
    assert.equal(repoUrl({ repo: 'wallctl' }), 'https://github.com/sodops/wallctl');
  });
});
