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
      const slug = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      headings.push({ depth, text, slug });
    }
  }

  return headings;
}
