import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.astro',
  '.wrangler',
  '.mf',
  'test-results',
  'playwright-report',
  '.lighthouseci',
  'qa-report',
]);

const ALLOWED_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.astro',
  '.md',
  '.sql',
  '.json',
  '.jsonc',
  '.html',
  '.css',
]);

function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (ALLOWED_EXTS.has(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function main() {
  const rootDir = process.cwd();
  const files = walkDir(rootDir);

  const results = [];
  const todoRegex = /TODO\(sodiq\)(.*)/;

  for (const file of files) {
    // Skip this script itself
    if (file.endsWith('list-todos.mjs')) continue;

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const match = todoRegex.exec(line);
      if (match) {
        const relPath = path.relative(rootDir, file);
        results.push({
          file: relPath,
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }

  console.log(`\nFound ${results.length} TODO(sodiq) item(s):\n`);
  for (const item of results) {
    console.log(`${item.file}:${item.line}: ${item.text}`);
  }
  console.log('');
}

main();
