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
    console.log(
      `[Worker] Cron trigger fired at: ${new Date(controller.scheduledTime).toISOString()}`
    );
    ctx.waitUntil(runStatusChecks(env));
  },
};
