/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB?: import('@cloudflare/workers-types').D1Database;
    UPLOADS_BUCKET?: import('@cloudflare/workers-types').R2Bucket;
    SESSION?: import('@cloudflare/workers-types').KVNamespace;
    ADMIN_EMAIL?: string;
    ADMIN_EMAILS?: string;
    CF_ACCESS_AUD?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    DEV_BYPASS_AUTH?: string;
    SITE_URL?: string;
    [key: string]: any;
  }
}

interface Env extends Cloudflare.Env {}

declare namespace App {
  interface Locals {
    /** Set by middleware after a successful Cloudflare Access check on admin paths. */
    auth?: import('./lib/auth').AuthResult;
    /** Editable site copy overrides loaded from D1 for public pages. */
    siteCopy?: Record<string, string>;
  }
}

type CloudflareEnv = Env;

declare namespace App {
  interface Locals {
    runtime?: {
      env: CloudflareEnv;
    };
  }
}
