// Offline support for the hosted build. Notes themselves live in localStorage
// and never touch the network — this only caches the app shell so NoteMaxx
// opens with no connection.
//
// Paths are derived from the registration scope rather than hardcoded to "/",
// so this works both at a domain root and under a GitHub Pages subpath.
const CACHE = 'notemaxx-v2';
const SHELL = new URL('./index.html', self.registration.scope).href;
const MANIFEST = new URL('./manifest.webmanifest', self.registration.scope).href;

// Vite content-hashes its output, so the asset filenames aren't known here.
// Rather than generate a file list at build time, discover them by reading the
// shell and the web manifest at install. Without this the assets are only
// cached if they happen to be re-requested while the worker is in control —
// which they aren't on a first visit, leaving a blank page offline.
async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(SHELL, { cache: 'reload' });
  await cache.put(SHELL, res.clone());

  const urls = new Set();
  const html = await res.text();
  for (const [, raw] of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    // Skip inline data: icons and cross-origin resources (Google Fonts), which
    // are opaque to the cache and optional — the CSS falls back to system fonts.
    if (!/^(data:|https?:|\/\/)/i.test(raw)) urls.add(new URL(raw, SHELL).href);
  }

  try {
    const manifest = await fetch(MANIFEST).then((r) => r.json());
    for (const icon of manifest.icons || []) urls.add(new URL(icon.src, MANIFEST).href);
  } catch {}

  // One bad URL shouldn't fail the whole install, so cache them individually.
  await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navigations: network first, so a redeploy is picked up immediately, with
  // the cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  // Static assets are content-hashed by Vite, so cache-first is safe.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
