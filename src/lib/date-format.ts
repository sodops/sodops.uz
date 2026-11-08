/** Format D1 monitoring timestamps without mixing incompatible Intl options. */
export function formatLastChecked(value: string | null | undefined): string {
  if (!value) return 'No checks recorded';
  // D1 CURRENT_TIMESTAMP is "YYYY-MM-DD HH:mm:ss" in UTC.
  const input = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z'
    : value;
  const time = new Date(input);
  if (!Number.isFinite(time.getTime())) return 'Invalid check timestamp';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(time);
}
