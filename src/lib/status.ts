import {
  getAllProjects,
  recordUptimeCheck,
  recordDailyAggregate,
  cleanupOldUptimeChecks,
  getLatestStatusPerProject,
} from './db';

export interface StatusCheckResult {
  projectId: string;
  url: string;
  status: 'up' | 'down' | 'degraded';
  statusCode: number;
  latencyMs: number;
  timestamp: string;
  metadata?: string | null;
}

export type SocketConnectFn = (address: { hostname: string; port: number }) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => Promise<void> | void;
  opened?: Promise<any>;
  closed?: Promise<any>;
};

/**
 * Strictly verifies whether a hostname belongs to the user-owned domain (sodops.uz or *.sodops.uz).
 * Strictly rejects:
 * - Unowned domains (e.g. evilsodops.uz, evil.com)
 * - Domain suffix attacks (e.g. sodops.uz.evil.com)
 * - Userinfo tricks (e.g. sodops.uz@evil.com)
 * - IPv4 literals (e.g. 127.0.0.1, 104.21.36.121)
 * - IPv6 literals (e.g. [::1], 2001:db8::1)
 * - Slashes, backslashes, colons, or whitespace
 */
export function isAllowedMonitoringHost(host: string): boolean {
  if (!host || typeof host !== 'string') return false;
  const normalized = host.trim().toLowerCase();

  // Strictly disallow port colons, @ symbols, slashes, backslashes, whitespace
  if (/[:@/\\]|\s/.test(normalized)) {
    return false;
  }

  // Strictly disallow IPv4 literals
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
    return false;
  }

  // Strictly disallow IPv6 literals
  if (normalized.includes('[') || normalized.includes(']') || normalized.includes(':')) {
    return false;
  }

  // Must match exactly sodops.uz or end with .sodops.uz (e.g. mc.sodops.uz)
  return normalized === 'sodops.uz' || normalized.endsWith('.sodops.uz');
}

/**
 * Strictly verifies whether a URL belongs to the user-owned domain (sodops.uz or *.sodops.uz).
 * Rejects non-HTTP protocols, userinfo tricks (https://sodops.uz@evil.com), and IP literals.
 */
export function isAllowedMonitoringUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);

    // Only allow standard http: and https: protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Strictly reject userinfo tricks (e.g. https://sodops.uz@evil.com)
    if (parsed.username || parsed.password) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    return isAllowedMonitoringHost(host);
  } catch {
    return false;
  }
}

/**
 * Categorizes an HTTP endpoint response based on status code and response latency.
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
 * Uses AbortSignal with timeout to prevent hanging requests.
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

// =====================================================================
// Minecraft Server List Ping (SLP) & Raw TCP Socket Monitor
// =====================================================================

/**
 * Encodes a number into a Minecraft VarInt byte array.
 */
export function encodeVarInt(value: number): number[] {
  const bytes: number[] = [];
  let val = value >>> 0;
  while (true) {
    if ((val & ~0x7f) === 0) {
      bytes.push(val);
      return bytes;
    }
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
}

/**
 * Decodes a Minecraft VarInt from a Uint8Array buffer at given offset.
 */
export function decodeVarInt(
  buffer: Uint8Array,
  offset = 0
): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  while (true) {
    if (offset + bytesRead >= buffer.length) {
      throw new Error('Incomplete VarInt');
    }
    const currentByte = buffer[offset + bytesRead];
    value |= (currentByte & 0x7f) << (bytesRead * 7);
    bytesRead++;
    if (bytesRead > 5) {
      throw new Error('VarInt is too big');
    }
    if ((currentByte & 0x80) !== 0x80) {
      break;
    }
  }
  return { value, bytesRead };
}

/**
 * Builds a Minecraft SLP Handshake packet for protocol version 765 (1.20.4).
 * Packet structure: [Packet Length: VarInt] [Packet ID: 0x00] [Protocol: VarInt] [Host: String] [Port: Short] [NextState: 1]
 */
export function buildMinecraftHandshakePacket(
  host: string,
  port: number,
  protocolVersion = 765
): Uint8Array {
  const hostBytes = new TextEncoder().encode(host);
  const hostLenBytes = encodeVarInt(hostBytes.length);
  const protoBytes = encodeVarInt(protocolVersion);
  const portBytes = [(port >> 8) & 0xff, port & 0xff];
  const nextStateBytes = encodeVarInt(1); // 1 = status state

  const payload = [
    0x00, // Packet ID: 0x00 Handshake
    ...protoBytes,
    ...hostLenBytes,
    ...hostBytes,
    ...portBytes,
    ...nextStateBytes,
  ];

  const packetLenBytes = encodeVarInt(payload.length);
  return new Uint8Array([...packetLenBytes, ...payload]);
}

/**
 * Minecraft SLP Status Request packet: Length 1, Packet ID 0x00.
 */
export const MINECRAFT_STATUS_REQUEST_PACKET = new Uint8Array([0x01, 0x00]);

export interface MinecraftParsedStatus {
  version: string;
  players_online: number;
  players_max: number;
}

/**
 * Parses the raw bytes received from a Minecraft SLP response.
 * Strictly extracts only version name and player counts.
 * IMPORTANT: Player sample names are deliberately NOT exposed or stored.
 */
export function parseMinecraftStatusResponse(buffer: Uint8Array): MinecraftParsedStatus {
  if (buffer.length < 3) {
    throw new Error('Response buffer too short for Minecraft SLP');
  }

  let offset = 0;
  // 1. Packet length
  const { bytesRead: lenBytes } = decodeVarInt(buffer, offset);
  offset += lenBytes;

  // 2. Packet ID (must be 0x00 for status response)
  const { value: packetId, bytesRead: idBytes } = decodeVarInt(buffer, offset);
  offset += idBytes;
  if (packetId !== 0x00) {
    throw new Error(`Unexpected packet ID: ${packetId}, expected 0x00`);
  }

  // 3. String length
  const { value: stringLength, bytesRead: strLenBytes } = decodeVarInt(buffer, offset);
  offset += strLenBytes;

  // 4. JSON Payload
  const jsonBytes = buffer.slice(offset, offset + stringLength);
  const jsonStr = new TextDecoder('utf-8').decode(jsonBytes);

  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch (err: any) {
    throw new Error(`Invalid JSON in Minecraft status response: ${err.message}`);
  }

  return {
    version: typeof data.version?.name === 'string' ? data.version.name : 'Unknown',
    players_online: typeof data.players?.online === 'number' ? data.players.online : 0,
    players_max: typeof data.players?.max === 'number' ? data.players.max : 0,
  };
}

/**
 * Resolves the socket connector function (cloudflare:sockets in production, injected in tests).
 */
async function resolveSocketConnect(injected?: SocketConnectFn): Promise<SocketConnectFn | null> {
  if (injected) return injected;
  try {
    const mod = await import('cloudflare:sockets');
    if (mod && typeof mod.connect === 'function') {
      return mod.connect as SocketConnectFn;
    }
  } catch {
    // In Node.js or local testing where cloudflare:sockets is unavailable
  }
  return null;
}

/**
 * Performs a plain TCP connect check against a host and port.
 */
export async function pingTcpEndpoint(
  host: string,
  port: number,
  timeoutMs = 3000,
  socketConnectFn?: SocketConnectFn
): Promise<{ status: 'up' | 'down'; statusCode: number; latencyMs: number }> {
  const start = performance.now();
  const connectFn = await resolveSocketConnect(socketConnectFn);
  if (!connectFn) {
    return { status: 'down', statusCode: 0, latencyMs: 0 };
  }

  let timeoutTimer: any = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error('Connection timed out')), timeoutMs);
    });

    const socket = connectFn({ hostname: host, port });
    const openedPromise = socket.opened ? socket.opened : Promise.resolve();

    await Promise.race([openedPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - start);

    try {
      await socket.close();
    } catch {}

    return {
      status: 'up',
      statusCode: 200,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: 'down',
      statusCode: 0,
      latencyMs,
    };
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

/**
 * Performs a Minecraft Server List Ping (SLP) check using cloudflare:sockets connect().
 * 1. Establishes TCP connection to host:port with 3s timeout.
 * 2. Sends Handshake and Status Request packets.
 * 3. Parses version and players online/max (never player names).
 * 4. Fallback: If SLP handshake fails after TCP connect, falls back to plain TCP connect = up.
 */
export async function pingMinecraftEndpoint(
  host: string,
  port = 25565,
  timeoutMs = 3000,
  socketConnectFn?: SocketConnectFn
): Promise<{
  status: 'up' | 'down';
  statusCode: number;
  latencyMs: number;
  metadata?: string | null;
}> {
  const start = performance.now();
  const connectFn = await resolveSocketConnect(socketConnectFn);
  if (!connectFn) {
    return {
      status: 'down',
      statusCode: 0,
      latencyMs: 0,
      metadata: JSON.stringify({ error: 'sockets unavailable' }),
    };
  }

  let socket: any = null;
  let tcpConnected = false;
  let timeoutTimer: any = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error('Minecraft check timed out')), timeoutMs);
    });

    socket = connectFn({ hostname: host, port });
    const openedPromise = socket.opened ? socket.opened : Promise.resolve();

    // 1. Connect TCP socket
    await Promise.race([openedPromise, timeoutPromise]);
    tcpConnected = true;

    // 2. Perform Minecraft Server List Ping handshake
    const writer = socket.writable.getWriter();
    const handshakePacket = buildMinecraftHandshakePacket(host, port);
    await writer.write(handshakePacket);
    await writer.write(MINECRAFT_STATUS_REQUEST_PACKET);
    writer.releaseLock();

    // 3. Read response stream
    const reader = socket.readable.getReader();
    const readPromise = (async () => {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (totalBytes < 4096) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        totalBytes += value.length;
        // Break once we have received the full JSON payload
        try {
          const combined = new Uint8Array(totalBytes);
          let offset = 0;
          for (const c of chunks) {
            combined.set(c, offset);
            offset += c.length;
          }
          const parsed = parseMinecraftStatusResponse(combined);
          return parsed;
        } catch {
          // Keep reading until complete or done
        }
      }
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const c of chunks) {
        combined.set(c, offset);
        offset += c.length;
      }
      return parseMinecraftStatusResponse(combined);
    })();

    const parsed = await Promise.race([readPromise, timeoutPromise]);
    reader.releaseLock();

    const totalLatency = Math.round(performance.now() - start);
    return {
      status: 'up',
      statusCode: 200,
      latencyMs: totalLatency,
      metadata: JSON.stringify(parsed),
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);

    // If TCP connection succeeded but SLP handshake or parsing failed:
    // Fall back to plain TCP connect = up as specified
    if (tcpConnected) {
      return {
        status: 'up',
        statusCode: 200,
        latencyMs,
        metadata: JSON.stringify({
          version: 'TCP Only',
          players_online: 0,
          players_max: 0,
        }),
      };
    }

    // Connection failed completely (NXDOMAIN, connection refused, or connect timeout)
    let errorLabel = 'unreachable';
    const msg = (err?.message || '').toLowerCase();
    if (
      msg.includes('cannot connect to the specified address') ||
      msg.includes('cannot connect to the specified addres')
    ) {
      errorLabel = 'unreachable/dns';
    } else if (msg.includes('cloudflare ip') || msg.includes('prohibited')) {
      errorLabel = 'dns/proxied';
    } else if (msg.includes('timed out') || msg.includes('timeout') || err?.name === 'AbortError') {
      errorLabel = 'timeout';
    } else if (msg.includes('refused')) {
      errorLabel = 'refused';
    } else if (
      msg.includes('notfound') ||
      msg.includes('dns') ||
      msg.includes('nxdomain') ||
      msg.includes('resolve') ||
      msg.includes('lookup') ||
      msg.includes('no such host')
    ) {
      errorLabel = 'dns';
    }

    return {
      status: 'down',
      statusCode: 0,
      latencyMs,
      metadata: JSON.stringify({
        error: errorLabel,
        error_raw: err?.message ? err.message.slice(0, 100) : undefined,
      }),
    };
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (socket) {
      try {
        await socket.close();
      } catch {}
    }
  }
}

/**
 * Main Status Runner invoked by Cloudflare Cron Trigger (every 5 minutes).
 * Queries projects from D1, performs concurrent checks based on check_type,
 * writes results to D1, and purges edge cache tags.
 */
export async function runStatusChecks(
  env?: any,
  fetchFnOrCtx?: typeof fetch | any,
  socketConnectFn?: SocketConnectFn,
  ctx?: any
): Promise<StatusCheckResult[]> {
  let fetchFn: typeof fetch = fetch;
  let context = ctx;
  if (typeof fetchFnOrCtx === 'function') {
    fetchFn = fetchFnOrCtx;
  } else if (fetchFnOrCtx && typeof fetchFnOrCtx === 'object' && !context) {
    context = fetchFnOrCtx;
  }
  if (!env?.DB) {
    console.warn('[Status Worker] D1 database binding (DB) is unavailable.');
    return [];
  }

  const projects = await getAllProjects(env.DB);
  if (!projects || projects.length === 0) {
    return [];
  }

  // Strictly skip paused or disabled projects from running checks
  const activeProjects = projects.filter((p: any) => p.status !== 'paused' && p.enabled !== 0);
  if (activeProjects.length === 0) {
    return [];
  }

  // Fetch previous status of each project to detect transitions
  const prevStatuses = await getLatestStatusPerProject(env.DB);

  const results: StatusCheckResult[] = [];
  const now = new Date().toISOString();

  // Concurrent checks with timeout safety and owned host/URL restrictions
  const checkPromises = activeProjects.map(async (project: any) => {
    const checkType: 'http' | 'tcp' | 'minecraft' = project.check_type || 'http';

    let pingResult: {
      status: 'up' | 'down' | 'degraded';
      statusCode: number;
      latencyMs: number;
      metadata?: string | null;
    };
    let targetDisplay = '';

    if (checkType === 'minecraft') {
      const host = project.check_host || 'mc.sodops.uz';
      const port = project.check_port || 25565;
      targetDisplay = `${host}:${port}`;

      if (!isAllowedMonitoringHost(host)) {
        console.warn(`[Status Worker] Skipping unowned host for project ${project.id}: ${host}`);
        return null;
      }

      pingResult = await pingMinecraftEndpoint(host, port, 3000, socketConnectFn);
    } else if (checkType === 'tcp') {
      const host = project.check_host || 'sodops.uz';
      const port = project.check_port || 80;
      targetDisplay = `${host}:${port}`;

      if (!isAllowedMonitoringHost(host)) {
        console.warn(`[Status Worker] Skipping unowned host for project ${project.id}: ${host}`);
        return null;
      }

      pingResult = await pingTcpEndpoint(host, port, 3000, socketConnectFn);
    } else {
      // Default: HTTP check
      const targetUrl = project.status_url || project.url;
      targetDisplay = targetUrl;

      if (!targetUrl || !isAllowedMonitoringUrl(targetUrl)) {
        console.warn(
          `[Status Worker] Skipping unowned or invalid URL for project ${project.id}: ${targetUrl}`
        );
        return null;
      }

      pingResult = await pingProjectEndpoint(targetUrl, 4000, fetchFn);
    }

    const checkResult: StatusCheckResult = {
      projectId: project.id,
      url: targetDisplay,
      status: pingResult.status,
      statusCode: pingResult.statusCode,
      latencyMs: pingResult.latencyMs,
      timestamp: now,
      metadata: pingResult.metadata || null,
    };

    try {
      // 1. Record raw check in uptime_checks (pruned after 7 days)
      await recordUptimeCheck(env.DB, checkResult);

      // 2. Increment daily aggregate in uptime_daily_aggregates
      const todayDate = now.split('T')[0];
      const isSuccess = pingResult.status !== 'down';
      await recordDailyAggregate(env.DB, project.id, todayDate, isSuccess, pingResult.latencyMs);
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

  // Invalidate edge cache tags ONLY when a project's status CHANGES (up/degraded/down)
  let statusChanged = false;
  for (const res of results) {
    const prev = prevStatuses.get(res.projectId);
    // If there was a previous status and it differs from the new status, trigger purge
    if (prev && prev !== res.status) {
      statusChanged = true;
      break;
    }
  }

  if (statusChanged) {
    let purged = false;
    try {
      const { cache } = await import('cloudflare:workers');
      if (cache && typeof cache.purge === 'function') {
        const purgeRes = await cache.purge({ tags: ['projects', 'home'] });
        console.log(
          '[Status Worker] Edge cache tags purged via cloudflare:workers cache.purge:',
          JSON.stringify(purgeRes)
        );
        purged = true;
      }
    } catch (err: any) {
      console.warn(
        '[Status Worker] cloudflare:workers cache.purge unavailable or threw:',
        err?.message || err
      );
    }

    if (!purged && context?.cache && typeof context.cache.purge === 'function') {
      try {
        const purgeRes = await context.cache.purge({ tags: ['projects', 'home'] });
        console.log(
          '[Status Worker] Edge cache tags purged via ctx.cache.purge:',
          JSON.stringify(purgeRes)
        );
        purged = true;
      } catch (err: any) {
        console.warn('[Status Worker] ctx.cache.purge failed:', err?.message || err);
      }
    }

    if (!purged) {
      console.log(
        '[Status Worker] Status change detected. Purge triggered for Cache-Tags: projects, home.'
      );
    }
  }

  return results;
}
