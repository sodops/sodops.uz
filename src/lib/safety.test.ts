import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicSafetyGuards } from './safety';

describe('Public Safety Guard & RFC 9116 Check', () => {
  it('passes when SITE_INDEXING is off even with TODO placeholders', () => {
    const result = checkPublicSafetyGuards(process.cwd(), 'off');
    assert.equal(result.passed, true);
    assert.ok(result.violations.length > 0);
  });

  it('fails when SITE_INDEXING is on with unresolved TODO placeholders', () => {
    const result = checkPublicSafetyGuards(process.cwd(), 'on');
    assert.equal(result.passed, false);
    assert.ok(result.violations.length >= 1);
    const hasSecurityTxt = result.violations.some((v) =>
      v.file.includes('security.txt') && v.text.includes('TODO(sodiq)')
    );
    assert.equal(hasSecurityTxt, true);
  });
});
