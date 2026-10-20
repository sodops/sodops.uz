import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEndpointStatus,
  computeUptimePercentage,
  pingProjectEndpoint,
  isAllowedMonitoringUrl,
  isAllowedMonitoringHost,
  encodeVarInt,
  decodeVarInt,
  buildMinecraftHandshakePacket,
  parseMinecraftStatusResponse,
  pingMinecraftEndpoint,
  pingTcpEndpoint,
} from './status';

describe('Status Monitoring: evaluateEndpointStatus', () => {
  it('identifies healthy 200 responses under 2500ms as up', () => {
    assert.equal(evaluateEndpointStatus(200, 120), 'up');
    assert.equal(evaluateEndpointStatus(204, 50), 'up');
  });

  it('identifies 3xx redirects as down (redirects must never be treated as up)', () => {
    assert.equal(evaluateEndpointStatus(301, 80), 'down');
    assert.equal(evaluateEndpointStatus(302, 2400), 'down');
    assert.equal(evaluateEndpointStatus(307, 100), 'down');
    assert.equal(evaluateEndpointStatus(308, 100), 'down');
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

describe('Status Monitoring: pingProjectEndpoint (HTTP)', () => {
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

  it('uses redirect manual and treats 3xx redirects as down with error redirect', async () => {
    let capturedOptions: any = null;
    const mockFetch = async (_url: string, opts: any) => {
      capturedOptions = opts;
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://sodops.cloudflareaccess.com/login' },
      });
    };

    const result = await pingProjectEndpoint(
      'https://sodops.uz/api/health',
      2000,
      mockFetch as any
    );

    assert.equal(capturedOptions?.redirect, 'manual');
    assert.equal(result.status, 'down');
    assert.equal(result.statusCode, 302);
    assert.ok(result.metadata);
    const meta = JSON.parse(result.metadata!);
    assert.equal(meta.error, 'redirect');
    assert.equal(meta.location, 'https://sodops.cloudflareaccess.com/login');
  });

  it('validates /api/health returns up when status is 200 and body is exactly {"ok":true}', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await pingProjectEndpoint(
      'https://sodops.uz/api/health',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'up');
    assert.equal(result.statusCode, 200);
    assert.equal(result.metadata, null);
  });

  it('strictly rejects /api/health returning HTML SSO page with status 200 as down', async () => {
    const mockFetch = async () =>
      new Response('<!DOCTYPE html><html><body>Login to Cloudflare Access</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

    const result = await pingProjectEndpoint(
      'https://sodops.uz/api/health',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'down');
    assert.equal(result.statusCode, 200);
    assert.ok(result.metadata);
    const meta = JSON.parse(result.metadata!);
    assert.equal(meta.error, 'invalid_health_payload');
  });

  it('strictly rejects /api/health returning JSON with ok: false as down', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await pingProjectEndpoint(
      'https://sodops.uz/api/health',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'down');
    assert.equal(result.statusCode, 200);
    assert.ok(result.metadata);
    const meta = JSON.parse(result.metadata!);
    assert.equal(meta.error, 'invalid_health_payload');
  });

  it('strictly rejects /api/health returning unexpected JSON structure as down', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ ok: true, extra: 'forbidden' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await pingProjectEndpoint(
      'https://sodops.uz/api/health',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'down');
    assert.equal(result.statusCode, 200);
    assert.ok(result.metadata);
    const meta = JSON.parse(result.metadata!);
    assert.equal(meta.error, 'invalid_health_payload');
  });

  it('treats 301/307 redirects on generic endpoints as down with error redirect', async () => {
    const mockFetch = async () =>
      new Response(null, {
        status: 301,
        headers: { Location: 'https://sodops.uz/new-home' },
      });

    const result = await pingProjectEndpoint(
      'https://sodops.uz/old-home',
      2000,
      mockFetch as any
    );

    assert.equal(result.status, 'down');
    assert.equal(result.statusCode, 301);
    assert.ok(result.metadata);
    const meta = JSON.parse(result.metadata!);
    assert.equal(meta.error, 'redirect');
    assert.equal(meta.location, 'https://sodops.uz/new-home');
  });
});

describe('Status Monitoring: Strict Domain Allowlist & Adversarial Attack Resistance', () => {
  it('allows valid root domain and subdomains', () => {
    assert.equal(isAllowedMonitoringHost('sodops.uz'), true);
    assert.equal(isAllowedMonitoringHost('mc.sodops.uz'), true);
    assert.equal(isAllowedMonitoringHost('preview.sodops.uz'), true);
    assert.equal(isAllowedMonitoringHost('k3s.cluster.sodops.uz'), true);

    assert.equal(isAllowedMonitoringUrl('https://sodops.uz'), true);
    assert.equal(isAllowedMonitoringUrl('https://sodops.uz/api/health'), true);
    assert.equal(isAllowedMonitoringUrl('https://mc.sodops.uz'), true);
    assert.equal(isAllowedMonitoringUrl('http://mc.sodops.uz:8080/status'), true);
  });

  it('strictly rejects unowned prefix domains (evilsodops.uz)', () => {
    assert.equal(isAllowedMonitoringHost('evilsodops.uz'), false);
    assert.equal(isAllowedMonitoringHost('not-sodops.uz'), false);
    assert.equal(isAllowedMonitoringUrl('https://evilsodops.uz'), false);
    assert.equal(isAllowedMonitoringUrl('https://evilsodops.uz/path'), false);
  });

  it('strictly rejects evil suffix domains (sodops.uz.evil.com)', () => {
    assert.equal(isAllowedMonitoringHost('sodops.uz.evil.com'), false);
    assert.equal(isAllowedMonitoringHost('mc.sodops.uz.attacker.com'), false);
    assert.equal(isAllowedMonitoringUrl('https://sodops.uz.evil.com'), false);
    assert.equal(isAllowedMonitoringUrl('https://mc.sodops.uz.attacker.com/status'), false);
  });

  it('strictly rejects userinfo tricks (https://sodops.uz@evil.com)', () => {
    assert.equal(isAllowedMonitoringUrl('https://sodops.uz@evil.com'), false);
    assert.equal(isAllowedMonitoringUrl('https://sodops.uz:password@evil.com'), false);
    assert.equal(isAllowedMonitoringUrl('https://mc.sodops.uz@attacker.com/steal'), false);
    assert.equal(isAllowedMonitoringHost('sodops.uz@evil.com'), false);
  });

  it('strictly rejects IPv4 and IPv6 literals', () => {
    assert.equal(isAllowedMonitoringHost('127.0.0.1'), false);
    assert.equal(isAllowedMonitoringHost('104.21.36.121'), false);
    assert.equal(isAllowedMonitoringHost('192.168.1.1'), false);
    assert.equal(isAllowedMonitoringHost('::1'), false);
    assert.equal(isAllowedMonitoringHost('[::1]'), false);

    assert.equal(isAllowedMonitoringUrl('http://127.0.0.1'), false);
    assert.equal(isAllowedMonitoringUrl('https://104.21.36.121/health'), false);
    assert.equal(isAllowedMonitoringUrl('http://[::1]:8080'), false);
  });

  it('strictly rejects non-HTTP schemes and malformed URLs', () => {
    assert.equal(isAllowedMonitoringUrl('javascript:alert(1)'), false);
    assert.equal(isAllowedMonitoringUrl('file:///etc/passwd'), false);
    assert.equal(isAllowedMonitoringUrl('ftp://sodops.uz'), false);
    assert.equal(isAllowedMonitoringUrl(''), false);
    assert.equal(isAllowedMonitoringHost(''), false);
  });
});

describe('Minecraft Protocol: VarInt Encoding and Decoding', () => {
  it('correctly encodes and decodes single-byte VarInts', () => {
    for (const val of [0, 1, 2, 42, 127]) {
      const encoded = encodeVarInt(val);
      assert.equal(encoded.length, 1);
      const decoded = decodeVarInt(new Uint8Array(encoded));
      assert.equal(decoded.value, val);
      assert.equal(decoded.bytesRead, 1);
    }
  });

  it('correctly encodes and decodes multi-byte VarInts (e.g. ports, protocol versions)', () => {
    for (const val of [128, 255, 765, 25565, 2097151]) {
      const encoded = encodeVarInt(val);
      assert.ok(encoded.length > 1);
      const decoded = decodeVarInt(new Uint8Array(encoded));
      assert.equal(decoded.value, val);
      assert.equal(decoded.bytesRead, encoded.length);
    }
  });

  it('throws on incomplete or corrupt VarInt buffer', () => {
    assert.throws(() => decodeVarInt(new Uint8Array([0x80])), /Incomplete VarInt/);
    assert.throws(
      () => decodeVarInt(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80])),
      /VarInt is too big/
    );
  });
});

describe('Minecraft SLP: Handshake Packet & Status Response Parser', () => {
  it('builds a valid Minecraft SLP handshake packet', () => {
    const packet = buildMinecraftHandshakePacket('mc.sodops.uz', 25565, 765);
    assert.ok(packet instanceof Uint8Array);
    assert.ok(packet.length > 10);

    // First byte is packet length
    const { value: len, bytesRead } = decodeVarInt(packet);
    assert.equal(len + bytesRead, packet.length);
    // Packet ID is 0x00
    assert.equal(packet[bytesRead], 0x00);
  });

  it('parses valid Minecraft status response without exposing player names', () => {
    const rawPayload = JSON.stringify({
      version: {
        name: 'Paper 1.20.4',
        protocol: 765,
      },
      players: {
        max: 20,
        online: 3,
        sample: [
          { name: 'SecretAdminPlayer', id: '11111111-2222-3333-4444-555555555555' },
          { name: 'Sodiq', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        ],
      },
      description: { text: 'Welcome to sodops.uz Minecraft' },
    });

    const jsonBytes = new TextEncoder().encode(rawPayload);
    const strLenBytes = encodeVarInt(jsonBytes.length);
    const packetIdBytes = [0x00];
    const payload = [...packetIdBytes, ...strLenBytes, ...jsonBytes];
    const packetLenBytes = encodeVarInt(payload.length);
    const fullBuffer = new Uint8Array([...packetLenBytes, ...payload]);

    const parsed = parseMinecraftStatusResponse(fullBuffer);
    assert.equal(parsed.version, 'Paper 1.20.4');
    assert.equal(parsed.players_online, 3);
    assert.equal(parsed.players_max, 20);

    // Ensure player names/samples are NOT part of the parsed object
    assert.equal((parsed as any).sample, undefined);
    assert.equal((parsed as any).players, undefined);
  });

  it('handles empty player list or missing version gracefully', () => {
    const rawPayload = JSON.stringify({
      version: {},
      players: {},
    });

    const jsonBytes = new TextEncoder().encode(rawPayload);
    const strLenBytes = encodeVarInt(jsonBytes.length);
    const packetIdBytes = [0x00];
    const payload = [...packetIdBytes, ...strLenBytes, ...jsonBytes];
    const packetLenBytes = encodeVarInt(payload.length);
    const fullBuffer = new Uint8Array([...packetLenBytes, ...payload]);

    const parsed = parseMinecraftStatusResponse(fullBuffer);
    assert.equal(parsed.version, 'Unknown');
    assert.equal(parsed.players_online, 0);
    assert.equal(parsed.players_max, 0);
  });

  it('throws on corrupted JSON or truncated response', () => {
    assert.throws(
      () => parseMinecraftStatusResponse(new Uint8Array([0x01])),
      /too short/
    );
  });
});

describe('Minecraft Check Execution: Socket Handshake, Timeouts & Fallback', () => {
  it('successfully executes Minecraft SLP handshake and returns up with metadata', async () => {
    const mockJson = JSON.stringify({
      version: { name: 'Paper 1.20.4' },
      players: { online: 5, max: 20 },
    });
    const jsonBytes = new TextEncoder().encode(mockJson);
    const strLenBytes = encodeVarInt(jsonBytes.length);
    const payload = [0x00, ...strLenBytes, ...jsonBytes];
    const packetLenBytes = encodeVarInt(payload.length);
    const serverResponseBytes = new Uint8Array([...packetLenBytes, ...payload]);

    const mockSocket = {
      opened: Promise.resolve(),
      closed: Promise.resolve(),
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(serverResponseBytes);
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write() {},
      }),
      close() {},
    };

    const mockConnect = () => mockSocket;

    const result = await pingMinecraftEndpoint('mc.sodops.uz', 25565, 3000, mockConnect as any);

    assert.equal(result.status, 'up');
    assert.equal(result.statusCode, 200);
    assert.ok(result.latencyMs >= 0);
    assert.ok(result.metadata);

    const meta = JSON.parse(result.metadata!);
    assert.equal(meta.version, 'Paper 1.20.4');
    assert.equal(meta.players_online, 5);
    assert.equal(meta.players_max, 20);
  });

  it('falls back to plain TCP connect = up when SLP handshake fails after connection', async () => {
    // Socket connects, but stream immediately closes without SLP response
    const mockSocket = {
      opened: Promise.resolve(),
      closed: Promise.resolve(),
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write() {},
      }),
      close() {},
    };

    const mockConnect = () => mockSocket;

    const result = await pingMinecraftEndpoint('mc.sodops.uz', 25565, 3000, mockConnect as any);

    // Must be up with TCP Only fallback
    assert.equal(result.status, 'up');
    assert.equal(result.statusCode, 200);
    assert.ok(result.metadata);

    const meta = JSON.parse(result.metadata!);
    assert.equal(meta.version, 'TCP Only');
    assert.equal(meta.players_online, 0);
  });

  it('marks status down and records error reason when TCP connection fails, times out, or hits proxied IP', async () => {
    // 1. Connection refused
    const mockRefused = () => {
      throw new Error('Connection refused (host down)');
    };
    const resRefused = await pingMinecraftEndpoint('mc.sodops.uz', 25565, 3000, mockRefused as any);
    assert.equal(resRefused.status, 'down');
    assert.equal(resRefused.statusCode, 0);
    assert.ok(resRefused.metadata);
    const metaRefused = JSON.parse(resRefused.metadata!);
    assert.equal(metaRefused.error, 'refused');

    // 2. Cloudflare Anycast IP prohibited (proxied DNS)
    const mockProxied = () => {
      throw new Error('Connections to Cloudflare IP ranges are prohibited');
    };
    const resProxied = await pingMinecraftEndpoint('mc.sodops.uz', 25565, 3000, mockProxied as any);
    assert.equal(resProxied.status, 'down');
    const metaProxied = JSON.parse(resProxied.metadata!);
    assert.equal(metaProxied.error, 'dns/proxied');
    assert.ok(metaProxied.error_raw.includes('prohibited'));

    // 3. Unresolved / NXDOMAIN
    const mockDns = () => {
      throw new Error('getaddrinfo ENOTFOUND mc.sodops.uz');
    };
    const resDns = await pingMinecraftEndpoint('mc.sodops.uz', 25565, 3000, mockDns as any);
    assert.equal(resDns.status, 'down');
    const metaDns = JSON.parse(resDns.metadata!);
    assert.equal(metaDns.error, 'dns');

    // 4. Cannot connect to specified address (unreachable/dns)
    const mockUnreachable = () => {
      throw new Error('Cannot connect to the specified address.');
    };
    const resUnreachable = await pingMinecraftEndpoint('mc.sodops.uz', 25565, 3000, mockUnreachable as any);
    assert.equal(resUnreachable.status, 'down');
    const metaUnreachable = JSON.parse(resUnreachable.metadata!);
    assert.equal(metaUnreachable.error, 'unreachable/dns');

    // 4. Timeout
    const mockTimeout = () => {
      const err = new Error('Minecraft check timed out');
      err.name = 'AbortError';
      throw err;
    };
    const resTimeout = await pingMinecraftEndpoint('mc.sodops.uz', 25565, 3000, mockTimeout as any);
    assert.equal(resTimeout.status, 'down');
    const metaTimeout = JSON.parse(resTimeout.metadata!);
    assert.equal(metaTimeout.error, 'timeout');
  });

  it('correctly tests plain TCP pingEndpoint', async () => {
    const mockSocket = {
      opened: Promise.resolve(),
      close() {},
    };
    const mockConnect = () => mockSocket;

    const result = await pingTcpEndpoint('sodops.uz', 443, 3000, mockConnect as any);
    assert.equal(result.status, 'up');
    assert.equal(result.statusCode, 200);
  });
});
