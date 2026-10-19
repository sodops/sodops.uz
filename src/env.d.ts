/// <reference path="../.astro/types.d.ts" />

type D1Database = any;
type R2Bucket = any;

type Runtime = import('@astrojs/cloudflare').Runtime<{
  DB: D1Database;
  BUCKET: R2Bucket;
  ADMIN_EMAIL?: string;
  CF_ACCESS_AUD?: string;
  SITE_URL?: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
