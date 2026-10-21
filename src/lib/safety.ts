import fs from 'node:fs';
import path from 'node:path';

/**
 * Validates public content safety before production indexing is turned on.
 * RFC 9116 security.txt and public pages must NOT contain TODO(sodiq) placeholders
 * when SITE_INDEXING is 'on'.
 */
export function checkPublicSafetyGuards(
  rootDir: string = process.cwd(),
  siteIndexingEnv: string = process.env.SITE_INDEXING || 'off'
): { passed: boolean; violations: Array<{ file: string; line: number; text: string }> } {
  const isIndexingOn = siteIndexingEnv.toLowerCase() === 'on';
  const violations: Array<{ file: string; line: number; text: string }> = [];

  const targets = [
    path.join(rootDir, 'public/.well-known/security.txt'),
    path.join(rootDir, 'src/pages/index.astro'),
    path.join(rootDir, 'src/pages/uses.astro'),
    path.join(rootDir, 'src/pages/now.astro'),
    path.join(rootDir, 'src/pages/projects.astro'),
    path.join(rootDir, 'src/pages/404.astro'),
    path.join(rootDir, 'src/pages/blog/index.astro'),
    path.join(rootDir, 'src/pages/blog/[slug].astro'),
  ];

  for (const filePath of targets) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (line.includes('TODO(sodiq)')) {
        violations.push({
          file: path.relative(rootDir, filePath),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }

  const passed = !isIndexingOn || violations.length === 0;
  return { passed, violations };
}

/**
 * Astro build integration to enforce safety guards at build time.
 */
export function siteIndexingSafetyIntegration() {
  return {
    name: 'site-indexing-safety',
    hooks: {
      'astro:build:start': () => {
        const siteIndexing = process.env.SITE_INDEXING || 'off';
        const { passed, violations } = checkPublicSafetyGuards(process.cwd(), siteIndexing);

        if (!passed) {
          const details = violations.map((v) => `  - ${v.file}:${v.line} -> ${v.text}`).join('\n');
          throw new Error(
            `[FATAL] Production build failed: SITE_INDEXING is 'on' but ${violations.length} unresolved TODO(sodiq) placeholder(s) were found:\n${details}\n\nPlease finalize all personal placeholders before deploying with indexing enabled.`
          );
        }
      },
    },
  };
}
