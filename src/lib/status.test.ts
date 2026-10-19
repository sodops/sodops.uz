import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEndpointStatus,
  computeUptimePercentage,
  pingProjectEndpoint,
} from './status';

describe('Status Monitoring: evaluateEndpointStatus', () => {
  it('identifies healthy 200 responses under 2500ms as up', () => {
    assert.equal(evaluateEndpointStatus(200, 120), 'up');
    assert.equal(evaluateEndpointStatus(204, 50), 'up');
    assert.equal(evaluateEndpointStatus(301, 80), 'up');
    assert.equal(evaluateEndpointStatus(302, 2400), 'up');
  });

  it('identifies slow responses (>= 2500ms) as degraded', () => {
    assert.equal(evaluateEndpointStatus(200, 2500), 'degraded');
    assert.equal(evaluateEndpointStatus(200, 4000), 'degraded');
  });

  it('identifies 429 Rate Limited responses as degraded', () => {
    assert.equal(evaluateEndpointStatus(429, 100), 'degraded');
  });

  it('identifies 5xx server errors as down', () => {
    assert.equal(evaluateEndpointStatus(500, 150), 'down');
    assert.equal(evaluateEndpointStatus(502, 100), 'down');
    assert.equal(evaluateEndpointStatus(503, 80), 'down');
    assert.equal(evaluateEndpointStatus(504, 3000), 'down');
  });

  it('identifies client errors (404, 403, 401) as down', () => {
    assert.equal(evaluateEndpointStatus(404, 50), 'down');
    assert.equal(evaluateEndpointStatus(403, 50), 'down');
    assert.equal(evaluateEndpointStatus(401, 50), 'down');
  });
});

describe('Status Monitoring: computeUptimePercentage', () => {
  it('returns 100 for empty checks array', () => {
    assert.equal(computeUptimePercentage([]), 100);
  });

  it('calculates 100% when all checks are up or degraded', () => {
    const checks = [
      { status: 'up' },
      { status: 'up' },
      { status: 'degraded' },
      { status: 'up' },
    ];
    assert.equal(computeUptimePercentage(checks), 100);
  });

  it('correctly calculates percentage with down records', () => {
    const checks = [
      { status: 'up' },
      { status: 'up' },
      { status: 'up' },
      { status: 'down' },
    ];
    // 3 out of 4 = 75%
    assert.equal(computeUptimePercentage(checks), 75);
  });

  it('handles fractional precision correctly', () => {
    // 29 up out of 30 checks = 96.67%
    const checks = Array(29).fill({ status: 'up' });
    checks.push({ status: 'down' });
    assert.equal(computeUptimePercentage(checks), 96.67);
  });
});

describe('Status Monitoring: pingProjectEndpoint', () => {
  it('pings healthy endpoint and records status up', async () => {
    const mockFetch = async () => new Response('OK', { status: 200 });

    const result = await pingProjectEndpoint(
      'https://example.com/health',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'up');
    assert.equal(result.statusCode, 200);
    assert.ok(typeof result.latencyMs === 'number');
  });

  it('identifies 429 response as degraded', async () => {
    const mockFetch = async () =>
      new Response('Too Many Requests', { status: 429 });

    const result = await pingProjectEndpoint(
      'https://example.com/api',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'degraded');
    assert.equal(result.statusCode, 429);
  });

  it('handles network failure gracefully and marks status down', async () => {
    const mockFetch = async () => {
      throw new Error('Connection refused');
    };

    const result = await pingProjectEndpoint(
      'https://broken.internal',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'down');
    assert.equal(result.statusCode, 0);
  });

  it('handles timeout gracefully and marks status down with code 504', async () => {
    const mockFetch = async () => {
      const error: any = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    };

    const result = await pingProjectEndpoint(
      'https://slow.internal',
      50,
      mockFetch as any
    );

    assert.equal(result.status, 'down');
    assert.equal(result.statusCode, 504);
  });
});
