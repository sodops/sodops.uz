// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://sodops.uz',
  output: 'server',
  adapter: cloudflare(),
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});
