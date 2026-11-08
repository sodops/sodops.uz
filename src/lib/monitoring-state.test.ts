import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMonitoringStatus, aggregateMonitoringStatus, MONITORING_STALE_AFTER_MS } from './monitoring-state';

const now = Date.parse('2026-11-08T08:00:00.000Z');

describe('monitoring freshness and aggregation', () => {
  it('recognizes fresh checks of each status', () => {
    for (const status of ['up', 'down', 'degraded'] as const)
      assert.equal(classifyMonitoringStatus(status, new Date(now - 60_000).toISOString(), now), status);
  });
  it('rejects missing, invalid, future and stale checks', () => {
    assert.equal(classifyMonitoringStatus('up', null, now), 'unknown');
    assert.equal(classifyMonitoringStatus('up', 'invalid', now), 'unknown');
    assert.equal(classifyMonitoringStatus('up', new Date(now - MONITORING_STALE_AFTER_MS - 1).toISOString(), now), 'unknown');
    assert.equal(classifyMonitoringStatus('up', new Date(now + 120_000).toISOString(), now), 'unknown');
    assert.equal(classifyMonitoringStatus('up', new Date(now - MONITORING_STALE_AFTER_MS).toISOString(), now), 'up');
  });
  it('pauses checks regardless of previous timestamp', () => {
    assert.equal(classifyMonitoringStatus('paused', null, now), 'paused');
  });
  it('does not turn empty or unknown projects green', () => {
    assert.equal(aggregateMonitoringStatus([]), 'unknown');
    assert.equal(aggregateMonitoringStatus(['paused']), 'unknown');
    assert.equal(aggregateMonitoringStatus(['up', 'unknown']), 'unknown');
  });
  it('prioritizes actionable outages over unknown state', () => {
    assert.equal(aggregateMonitoringStatus(['up', 'down', 'unknown']), 'down');
    assert.equal(aggregateMonitoringStatus(['up', 'degraded', 'unknown']), 'degraded');
    assert.equal(aggregateMonitoringStatus(['up', 'up']), 'up');
  });
});
