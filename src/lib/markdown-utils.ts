/**
 * Lightweight, zero-dependency Markdown text utilities.
 * Kept strictly isolated from the unified/rehype/highlight.js pipeline
 * so reader-facing public pages never bundle heavy compiler dependencies.
 */

/**
 * Estimates reading time in minutes (assuming 200 words per minute).
 */
export function calculateReadingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Generates an SEO-friendly URL slug supporting English, Uzbek typographic characters (o‘, g‘, sh, ch),
 * and Cyrillic transliteration.
 */
export function generateSlug(input: string): string {
  if (!input) return '';

  let str = input.trim().toLowerCase();

  // 1. Uzbek typographic apostrophes: o‘, o', o’ -> o; g‘, g', g’ -> g
  str = str.replace(/o['‘`’]/g, 'o');
  str = str.replace(/g['‘`’]/g, 'g');

  // 2. Cyrillic transliteration map (Uzbek Cyrillic)
  const cyrillicMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
    я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
  };

  str = str
    .split('')
    .map((char) => cyrillicMap[char] ?? char)
    .join('');

  // 3. Replace non-alphanumeric characters with hyphens
  str = str.replace(/[^a-z0-9\s-]/g, '');

  // 4. Collapse whitespace and repeated hyphens
  str = str.replace(/[\s_]+/g, '-').replace(/-+/g, '-');

  // 5. Trim leading and trailing hyphens
  return str.replace(/^-+|-+$/g, '');
}

/**
 * Extracts h2 and h3 headings for Table of Contents generation.
 */
export function extractHeadings(
  markdown: string
): Array<{ depth: number; text: string; slug: string }> {
  const headings: Array<{ depth: number; text: string; slug: string }> = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const depth = match[1].length;
      const text = match[2].trim().replace(/[*_`]/g, '');
      const slug = generateSlug(text);
      headings.push({ depth, text, slug });
    }
  }

  return headings;
}
