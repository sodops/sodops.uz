// Custom Cloudflare Worker Entrypoint
// Combines Astro server request handling with Cloudflare Cron Triggers scheduled() handler

import { handle } from '@astrojs/cloudflare/handler';
import { runStatusChecks } from './lib/status';

export type WorkerEnv = Env;

export default {
  /**
   * Main HTTP request handler delegating to Astro Cloudflare handler
   */
  async fetch(request: Request, env: WorkerEnv, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__scheduled') {
      const isLocal =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        import.meta.env.DEV;
      if (isLocal) {
        const cron = url.searchParams.get('cron') || '*/5 * * * *';
        const scheduledTime = Date.now();
        await this.scheduled({ cron, scheduledTime }, env, ctx);
        return new Response('Ran scheduled event\n', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }
    return handle(request, env, ctx);
  },

  /**
   * Cloudflare Cron Trigger scheduled() handler
   * Pings project endpoints every 5 minutes and updates D1 status history
   */
  async scheduled(controller: any, env: WorkerEnv, ctx: any): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    console.log(`[Worker Scheduled Cron] Fired at ${scheduledAt} (cron: ${controller.cron})`);
    ctx.waitUntil(
      runStatusChecks(env, ctx)
        .then((results) => {
          console.log(
            `[Worker Scheduled Cron] Completed status checks for ${results.length} endpoints:`,
            JSON.stringify(
              results.map((r) => ({
                id: r.projectId,
                url: r.url,
                status: r.status,
                statusCode: r.statusCode,
                latency: `${r.latencyMs}ms`,
                metadata: r.metadata,
              }))
            )
          );
        })
        .catch((err) => {
          console.error('[Worker Scheduled Cron] Error executing status checks:', err);
        })
    );
  },
};
