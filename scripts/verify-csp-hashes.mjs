import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

async function main() {
  console.log('[verify-csp-hashes] Verifying Content-Security-Policy inline script hashes...');

  // 1. Read src/middleware.ts
  const middlewarePath = path.resolve('src/middleware.ts');
  const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');

  // Extract all sha256 hashes listed in src/middleware.ts
  const hashMatches = [...middlewareContent.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)];
  const allowedHashes = new Set(hashMatches.map((m) => `sha256-${m[1]}`));

  if (allowedHashes.size === 0) {
    console.error('[verify-csp-hashes] ERROR: No sha256 hashes found in src/middleware.ts');
    process.exit(1);
  }

  // 2. Resolve Astro prebuilt island & directive scripts
  const scriptsToVerify = [
    {
      name: 'astro-island (prod)',
      modulePath: './node_modules/astro/dist/runtime/server/astro-island.prebuilt.js',
    },
    {
      name: 'astro-island (dev)',
      modulePath: './node_modules/astro/dist/runtime/server/astro-island.prebuilt-dev.js',
    },
    {
      name: 'client:load directive',
      modulePath: './node_modules/astro/dist/runtime/client/load.prebuilt.js',
    },
    {
      name: 'client:idle directive',
      modulePath: './node_modules/astro/dist/runtime/client/idle.prebuilt.js',
    },
    {
      name: 'client:visible directive',
      modulePath: './node_modules/astro/dist/runtime/client/visible.prebuilt.js',
    },
    {
      name: 'client:media directive',
      modulePath: './node_modules/astro/dist/runtime/client/media.prebuilt.js',
    },
    {
      name: 'client:only directive',
      modulePath: './node_modules/astro/dist/runtime/client/only.prebuilt.js',
    },
  ];

  let missingCount = 0;

  for (const item of scriptsToVerify) {
    const fullPath = path.resolve(item.modulePath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[verify-csp-hashes] WARNING: Module file not found: ${item.modulePath}`);
      continue;
    }

    try {
      const imported = await import(fullPath);
      const codeStr = imported.default || '';
      if (typeof codeStr === 'string' && codeStr.length > 0) {
        const hash = `sha256-${crypto.createHash('sha256').update(codeStr).digest('base64')}`;
        if (!allowedHashes.has(hash)) {
          console.error(
            `[verify-csp-hashes] ✘ MISSING HASH for ${item.name} code string: '${hash}'`
          );
          missingCount++;
        } else {
          console.log(`[verify-csp-hashes] ✔ Verified ${item.name} (${hash})`);
        }
      }
    } catch (importErr) {
      console.error(`[verify-csp-hashes] Failed to inspect ${item.name}:`, importErr);
      missingCount++;
    }
  }

  // 3. Scan dist/server for any other potential inline scripts
  const serverDir = path.resolve('dist/server');
  if (fs.existsSync(serverDir)) {
    const files = fs.readdirSync(serverDir, { recursive: true });
    for (const file of files) {
      if (typeof file === 'string' && (file.endsWith('.js') || file.endsWith('.mjs'))) {
        const filePath = path.join(serverDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        // Check for any inline <script> matches that are not src-based
        const inlineScriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = inlineScriptRegex.exec(content)) !== null) {
          const scriptBody = match[1].trim();
          if (scriptBody.length > 0 && !scriptBody.includes('${')) {
            const hash = `sha256-${crypto.createHash('sha256').update(scriptBody).digest('base64')}`;
            if (!allowedHashes.has(hash)) {
              console.error(
                `[verify-csp-hashes] ✘ MISSING HASH for inline script in ${file}: '${hash}'`
              );
              missingCount++;
            }
          }
        }
      }
    }
  }

  if (missingCount > 0) {
    console.error(
      `\n[verify-csp-hashes] FAILED: ${missingCount} required inline script hash(es) missing in src/middleware.ts.`
    );
    process.exit(1);
  }

  console.log('[verify-csp-hashes] SUCCESS: All emitted inline script hashes are present in CSP.');
}

main().catch((err) => {
  console.error('[verify-csp-hashes] Fatal error:', err);
  process.exit(1);
});
