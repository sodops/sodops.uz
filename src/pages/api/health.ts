import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const start = performance.now();
  const db = (env as any)?.DB;

  let dbOk = false;
  let dbLatencyMs = 0;

  if (db) {
    try {
      const dbStart = performance.now();
      await db.prepare('SELECT 1').run();
      dbLatencyMs = Math.round(performance.now() - dbStart);
      dbOk = true;
    } catch (err) {
      console.error('[Health Probe] D1 SELECT 1 failed:', err);
    }
  }

  const totalMs = Math.round(performance.now() - start);
  const status = dbOk ? 200 : 503;

  return new Response(
    JSON.stringify({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'unavailable',
      dbLatencyMs,
      totalMs,
      reqHost: request.headers.get('host'),
      urlHost: url.host,
      urlHostname: url.hostname,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
};
