import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async () => {
  const db = (env as any)?.DB;

  let dbOk = false;
  if (db) {
    try {
      await db.prepare('SELECT 1').run();
      dbOk = true;
    } catch (err) {
      console.error('[Health Probe] D1 SELECT 1 failed:', err);
    }
  }

  const status = dbOk ? 200 : 503;

  return new Response(
    JSON.stringify({ ok: dbOk }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
};
