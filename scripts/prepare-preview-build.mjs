/**
 * GitHub PR Previews must never use data-bearing production bindings.
 * Astro's Cloudflare build may copy D1/KV bindings from wrangler.jsonc into
 * dist/server/wrangler.json even when previews.kv_namespaces is empty.
 * Remove them from the generated preview bundle (never edit production config).
 */
import fs from 'node:fs';

const filename = 'dist/server/wrangler.json';
if (!fs.existsSync(filename)) {
  throw new Error('Astro Cloudflare build did not generate ' + filename);
}

const build = JSON.parse(fs.readFileSync(filename, 'utf8'));
const disallowed = [
  'kv_namespaces',
  'd1_databases',
  'r2_buckets',
  'durable_objects',
  'queues',
  'services',
  'hyperdrive',
  'vectorize',
  'workflows',
  'triggers',
];
for (const key of disallowed) delete build[key];

// Workers Previews config must provide all runtime preview vars independently.
build.previews = {
  ...(build.previews || {}),
  vars: {
    SITE_URL: 'https://sodops.uz',
    SITE_INDEXING: 'off',
    PREVIEW_MODE: 'true',
  },
};
fs.writeFileSync(filename, JSON.stringify(build, null, 2) + '\n');
console.log('Prepared isolated public-only Preview build without production resource bindings.');
