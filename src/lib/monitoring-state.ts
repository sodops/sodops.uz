/** Freshness and overall health are kept separate from page rendering. */
export type MonitoringState = 'up' | 'down' | 'degraded' | 'unknown' | 'paused';
export const MONITORING_STALE_AFTER_MS = 15 * 60 * 1000;

export function classifyMonitoringStatus(
  status: string | null | undefined,
  timestamp: string | null | undefined,
  now = Date.now()
): MonitoringState {
  if (status === 'paused') return 'paused';
  if (!timestamp) return 'unknown';
  const checkedAt = Date.parse(timestamp);
  if (
    !Number.isFinite(checkedAt) ||
    checkedAt > now + 60_000 ||
    now - checkedAt > MONITORING_STALE_AFTER_MS
  ) return 'unknown';
  return status === 'up' || status === 'down' || status === 'degraded' ? status : 'unknown';
}

/** A confirmed outage is more actionable than an unrelated unknown service. */
export function aggregateMonitoringStatus(statuses: MonitoringState[]): Exclude<MonitoringState, 'paused'> {
  const active = statuses.filter((status) => status !== 'paused');
  if (active.length === 0) return 'unknown';
  if (active.includes('down')) return 'down';
  if (active.includes('degraded')) return 'degraded';
  if (active.includes('unknown')) return 'unknown';
  return 'up';
}
