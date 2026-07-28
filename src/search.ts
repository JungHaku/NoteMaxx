import { Page } from './types';

export function pageMatches(p: Page, q: string): boolean {
  if (p.title.toLowerCase().includes(q)) return true;
  return p.blocks.some((b) => b.text.toLowerCase().includes(q));
}

// Title matches rank above content matches; ties break by recency.
export function rankPages(pages: Page[], query: string, limit = 8): Page[] {
  const q = query.trim().toLowerCase();
  const byTime = (a: Page, b: Page) => b.updatedAt - a.updatedAt;
  if (!q) return [...pages].sort(byTime).slice(0, limit);
  const title = pages.filter((p) => p.title.toLowerCase().includes(q)).sort(byTime);
  const content = pages
    .filter((p) => !p.title.toLowerCase().includes(q) && pageMatches(p, q))
    .sort(byTime);
  return [...title, ...content].slice(0, limit);
}
