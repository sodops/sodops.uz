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
  kv_namespaces: [],
  d1_databases: [],
  r2_buckets: [],
  vars: {
    SITE_URL: 'https://sodops.uz',
    SITE_INDEXING: 'off',
    PREVIEW_MODE: 'true',
  },
};
fs.writeFileSync(filename, JSON.stringify(build, null, 2) + '\n');
console.log('Preview binding keys:', Object.keys(build.previews || {}));
console.log('Top-level binding keys remaining:', Object.keys(build).filter(key => /kv|d1|r2|binding|session/i.test(key)));
console.log('Prepared isolated public-only Preview build without production resource bindings.');


// Dedicated Worker for the exact hostname preview.sodops.uz.
// This is intentionally a different Worker from production and shares NO bindings.
const stablePreview = {
  ...build,
  name: 'sodops-uz-ui-preview',
  workers_dev: false,
  preview_urls: false,
  routes: [
    { pattern: 'preview.sodops.uz', custom_domain: true },
  ],
  vars: {
    SITE_URL: 'https://sodops.uz',
    SITE_INDEXING: 'off',
    PREVIEW_MODE: 'true',
  },
};
delete stablePreview.previews;
fs.writeFileSync('dist/server/wrangler.stable-preview.json', JSON.stringify(stablePreview, null, 2) + '\n');
console.log('Prepared dedicated preview Worker for preview.sodops.uz (no production resources).');
