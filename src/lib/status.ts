import {
  getAllProjects,
  recordUptimeCheck,
  recordDailyAggregate,
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
 * Strictly verifies whether a URL belongs to the user-owned domain (sodops.uz or *.sodops.uz).
 * The cron must NEVER ping external or unowned hosts.
 */
export function isAllowedMonitoringUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return host === 'sodops.uz' || host.endsWith('.sodops.uz');
  } catch {
    return false;
  }
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

  // Concurrent pinging with timeout safety and owned URL restrictions
  const checkPromises = projects.map(async (project) => {
    const targetUrl = (project as any).status_url || (project as any).check_url || project.url;
    if (!targetUrl || !isAllowedMonitoringUrl(targetUrl)) {
      console.warn(
        `[Status Worker] Skipping unowned or invalid URL for project ${project.id}: ${targetUrl}`
      );
      return null;
    }

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
      // 1. Record raw check in uptime_checks (pruned after 7 days)
      await recordUptimeCheck(env.DB, checkResult);

      // 2. Increment daily aggregate in uptime_daily_aggregates
      const todayDate = now.split('T')[0];
      const isSuccess = ping.status !== 'down';
      await recordDailyAggregate(env.DB, project.id, todayDate, isSuccess, ping.latencyMs);
    } catch (dbErr) {
      console.error(`[Status Worker] Failed to record check for ${project.id}:`, dbErr);
    }

    return checkResult;
  });

  const settled = await Promise.allSettled(checkPromises);
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      results.push(item.value);
    }
  }

  // Prune history older than 7 days to keep D1 storage lean
  try {
    await cleanupOldUptimeChecks(env.DB, 7);
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
