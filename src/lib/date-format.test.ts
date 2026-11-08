import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatLastChecked } from './date-format';

describe('Monitoring timestamp formatting', () => {
  it('formats D1 SQLite UTC timestamps without throwing', () => {
    assert.match(formatLastChecked('2026-11-08 09:15:30'), /Nov 8, 2026/);
    assert.match(formatLastChecked('2026-11-08 09:15:30'), /UTC|GMT/);
  });
  it('formats ISO timestamps and handles invalid or absent data', () => {
    assert.match(formatLastChecked('2026-11-08T09:15:30.000Z'), /2026/);
    assert.equal(formatLastChecked(null), 'No checks recorded');
    assert.equal(formatLastChecked('not-a-date'), 'Invalid check timestamp');
  });
});
