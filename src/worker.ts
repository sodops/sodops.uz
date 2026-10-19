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
      runStatusChecks(env)
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
