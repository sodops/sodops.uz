import {
  getAllProjects,
  recordUptimeCheck,
  cleanupOldUptimeChecks,
} from './db';

export interface StatusCheckResult {
  projectId: string;
  url: string;
  status: 'up' | 'down' | 'degraded';
  statusCode: number;
  latencyMs: number;
  timestamp: string;
}

/**
 * Categorizes an endpoint response based on status code and response latency.
 */
export function evaluateEndpointStatus(
  statusCode: number,
  latencyMs: number
): 'up' | 'down' | 'degraded' {
  if (statusCode >= 200 && statusCode < 400) {
    return latencyMs >= 2500 ? 'degraded' : 'up';
  }
  if (statusCode === 429) {
    return 'degraded';
  }
  return 'down';
}

/**
 * Calculates uptime percentage from an array of status checks.
 * Returns 100 if no checks are present.
 */
export function computeUptimePercentage(checks: Array<{ status: string }>): number {
  if (!checks || checks.length === 0) return 100;
  const available = checks.filter((c) => c.status === 'up' || c.status === 'degraded').length;
  return Number(((available / checks.length) * 100).toFixed(2));
}

/**
 * Pings an HTTP endpoint and returns status, status code, and latency in ms.
 * Uses AbortSignal.timeout or setTimeout fallback to prevent hanging requests.
 */
export async function pingProjectEndpoint(
  url: string,
  timeoutMs = 4000,
  fetchFn: typeof fetch = fetch
): Promise<{ status: 'up' | 'down' | 'degraded'; statusCode: number; latencyMs: number }> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'sodops-status-monitor/1.0 (+https://sodops.uz)',
        Accept: '*/*',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);
    const status = evaluateEndpointStatus(res.status, latencyMs);

    return {
      status,
      statusCode: res.status,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timeout');
    return {
      status: 'down',
      statusCode: isTimeout ? 504 : 0,
      latencyMs,
    };
  }
}

/**
 * Main Status Runner invoked by Cloudflare Cron Trigger (every 5 minutes).
 * Queries projects from D1, pings endpoints concurrently, writes results to D1,
 * and clears edge cache tags.
 */
export async function runStatusChecks(
  env?: any,
  fetchFn: typeof fetch = fetch
): Promise<StatusCheckResult[]> {
  if (!env?.DB) {
    console.warn('[Status Worker] D1 database binding (DB) is unavailable.');
    return [];
  }

  const projects = await getAllProjects(env.DB);
  if (!projects || projects.length === 0) {
    return [];
  }

  const results: StatusCheckResult[] = [];
  const now = new Date().toISOString();

  // Concurrent pinging with timeout safety
  const checkPromises = projects.map(async (project) => {
    const targetUrl = project.status_url || project.url;
    const ping = await pingProjectEndpoint(targetUrl, 4000, fetchFn);

    const checkResult: StatusCheckResult = {
      projectId: project.id,
      url: targetUrl,
      status: ping.status,
      statusCode: ping.statusCode,
      latencyMs: ping.latencyMs,
      timestamp: now,
    };

    try {
      await recordUptimeCheck(env.DB, checkResult);
    } catch (dbErr) {
      console.error(`[Status Worker] Failed to record check for ${project.id}:`, dbErr);
    }

    return checkResult;
  });

  const settled = await Promise.allSettled(checkPromises);
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      results.push(item.value);
    }
  }

  // Prune history older than 30 days to keep D1 storage lean
  try {
    await cleanupOldUptimeChecks(env.DB, 30);
  } catch (cleanupErr) {
    console.error('[Status Worker] Failed to cleanup old uptime records:', cleanupErr);
  }

  // Invalidate edge cache tags so public pages see fresh status immediately
  try {
    const { cache } = await import('cloudflare:workers');
    if (cache && typeof cache.purge === 'function') {
      await cache.purge({ tags: ['projects', 'home'] });
    }
  } catch {
    // Expected in local test environment
  }

  return results;
}
