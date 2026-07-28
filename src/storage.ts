import { Page } from './types';

export const STORAGE_KEY = 'notemaxx.pages.v1';

export function loadPages(): Page[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePages(pages: Page[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    return true;
  } catch {
    return false;
  }
}

// Page-level last-writer-wins merge for cross-tab sync. Order follows the
// incoming array, with local-only pages appended.
export function mergePages(incoming: Page[], local: Page[]): Page[] {
  const byId = new Map(incoming.map((p) => [p.id, p]));
  for (const p of local) {
    const other = byId.get(p.id);
    if (!other || p.updatedAt > other.updatedAt) byId.set(p.id, p);
  }
  return [...byId.values()];
}

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
