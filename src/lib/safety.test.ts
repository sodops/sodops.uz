import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPublicSafetyGuards } from './safety';

describe('Public Safety Guard & RFC 9116 Check', () => {
  it('production content is free from unfinished placeholders', () => {
    const result = checkPublicSafetyGuards(process.cwd(), 'on');
    assert.equal(result.passed, true, JSON.stringify(result.violations));
    assert.equal(result.violations.length, 0);
  });

  it('detects unfinished text when indexing is enabled but permits private staging', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sodops-seo-'));
    try {
      mkdirSync(join(dir, 'public', '.well-known'), { recursive: true });
      writeFileSync(join(dir, 'public', '.well-known', 'security.txt'), 'Contact: mailto:TODO(sodiq)\n');
      const staging = checkPublicSafetyGuards(dir, 'off');
      assert.equal(staging.passed, true);
      assert.equal(staging.violations.length, 1);
      const production = checkPublicSafetyGuards(dir, 'on');
      assert.equal(production.passed, false);
      assert.equal(production.violations[0].file, 'public/.well-known/security.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
