/**
 * Grit offline service worker.
 *
 * The app is local-first (Dexie/IndexedDB + opportunistic Supabase sync), so the
 * only thing standing between it and full offline use is loading the page shell
 * without a network. This worker precaches the shell and serves same-origin
 * assets cache-first (stale-while-revalidate), so the app opens instantly and
 * works with no wifi. Cross-origin requests (Supabase) are never intercepted —
 * they hit the network and fail gracefully offline, exactly as the sync layer
 * expects; queued local writes flush on the next reachable sync.
 */
const CACHE = "grit-shell-v1";
const CORE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Best-effort: a missing optional asset must not abort the whole install.
      .then((cache) => Promise.allSettled(CORE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only the app's own origin is cacheable. Let Supabase et al. go to network.
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the app shell. Try the network so a rebuild is picked up,
  // but fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() =>
          caches.match("/index.html").then((r) => r || caches.match("/")),
        ),
    );
    return;
  }

  // Static assets (hashed _next bundles, icons, fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
