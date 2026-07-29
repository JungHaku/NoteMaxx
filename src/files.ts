import { FileRef } from './types';

// Attachments live in IndexedDB, not localStorage: localStorage stores strings
// with a ~5MB quota, so a single photo would blow it. Pages keep only a FileRef.

const DB_NAME = 'notemaxx.files';
const STORE = 'files';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const fileId = () => 'f' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export async function putFile(file: File): Promise<FileRef> {
  const id = fileId();
  const name = file.name || 'untitled';
  const mime = file.type || guessMime(name);
  await tx('readwrite', (s) => s.put(new Blob([file], { type: mime }), id));
  return { id, name, mime, size: file.size };
}

export function getBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id));
}

export async function deleteFiles(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await tx('readwrite', (s) => s.delete(id));
    } catch {
      // best effort — an undeleted blob is harmless
    }
    const url = urlCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(id);
    }
  }
}

export function listFileIds(): Promise<string[]> {
  return tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.map((k) => String(k))
  );
}

// Drop blobs no page references any more (deleted blocks/pages).
export async function collectGarbage(referenced: Set<string>): Promise<void> {
  try {
    const all = await listFileIds();
    const orphans = all.filter((id) => !referenced.has(id));
    if (orphans.length) await deleteFiles(orphans);
  } catch {
    // storage unavailable — nothing to clean
  }
}

const urlCache = new Map<string, string>();

export async function objectUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

interface NativeBridge {
  webkit?: { messageHandlers?: { openFile?: { postMessage: (m: unknown) => void } } };
}

function nativeHandler() {
  return (window as unknown as NativeBridge).webkit?.messageHandlers?.openFile;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// In the macOS app, hand the bytes to Swift so the file opens in the user's real
// default app (Preview, Word, …) — WKWebView can't usefully open blob: URLs.
// In a browser, open an object URL in a new tab, falling back to a download.
export async function openFile(ref: FileRef): Promise<boolean> {
  const blob = await getBlob(ref.id);
  if (!blob) return false;

  const native = nativeHandler();
  if (native) {
    try {
      native.postMessage({ name: ref.name, mime: ref.mime, data: await toBase64(blob) });
      return true;
    } catch {
      // fall through to the web path
    }
  }

  const url = await objectUrl(ref.id);
  if (!url) return false;
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = ref.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return true;
}

const MIME_BY_EXT: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

export function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function isImage(ref: FileRef): boolean {
  // SVGs render fine but are scriptable; treat them as attachments, not images.
  return ref.mime.startsWith('image/') && ref.mime !== 'image/svg+xml';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extLabel(ref: FileRef): string {
  const ext = ref.name.split('.').pop();
  if (ext && ext !== ref.name && ext.length <= 5) return ext.toUpperCase();
  return ref.mime.split('/').pop()?.slice(0, 5).toUpperCase() ?? 'FILE';
}
