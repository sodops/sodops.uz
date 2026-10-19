/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB?: import('@cloudflare/workers-types').D1Database;
    UPLOADS_BUCKET?: import('@cloudflare/workers-types').R2Bucket;
    SESSION?: import('@cloudflare/workers-types').KVNamespace;
    ADMIN_EMAIL?: string;
    CF_ACCESS_AUD?: string;
    DEV_BYPASS_AUTH?: string;
    SITE_URL?: string;
    [key: string]: any;
  }
}

interface Env extends Cloudflare.Env {}

type CloudflareEnv = Env;

declare namespace App {
  interface Locals {
    runtime?: {
      env: CloudflareEnv;
    };
  }
}
