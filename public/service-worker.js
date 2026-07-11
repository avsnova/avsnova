/* Aurevashop PWA Service Worker
 * Conservative, safe caching strategy:
 *  - NEVER caches /api/* (always network — avoids stale data & auth issues).
 *  - Navigations: network-first, fall back to cached app shell / offline page.
 *  - Static assets (icons/manifest): stale-while-revalidate.
 *  - Bumping CACHE_VERSION invalidates all old caches on next activate.
 */
const CACHE_VERSION = "avs-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const APP_SHELL = ["/", "/index.html", "/offline.html", "/manifest.webmanifest"];
const STATIC_ASSETS = [
  "/icon-72.png", "/icon-96.png", "/icon-128.png", "/icon-144.png",
  "/icon-152.png", "/icon-192.png", "/icon-384.png", "/icon-512.png",
  "/icon-maskable-512.png", "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(APP_SHELL_CACHE);
      // Best-effort: don't fail install if one asset is momentarily unavailable.
      await Promise.allSettled(APP_SHELL.map((u) => shell.add(u)));
      const stat = await caches.open(STATIC_CACHE);
      await Promise.allSettled(STATIC_ASSETS.map((u) => stat.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Allow the page to trigger an immediate activation after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only handle same-origin requests. Cross-origin (fonts/CDN/API elsewhere) pass through.
  if (url.origin !== self.location.origin) return;

  // NEVER cache API traffic — always hit the network for live/auth'd data.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  // Navigations (HTML): network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const shell = await caches.open(APP_SHELL_CACHE);
          shell.put("/", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const shell = await caches.open(APP_SHELL_CACHE);
          return (
            (await shell.match("/")) ||
            (await shell.match("/index.html")) ||
            (await shell.match("/offline.html")) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) cache.put(request, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);
      return cached || (await network) || new Response("", { status: 504 });
    })()
  );
});

// Push notification scaffolding (ready for future use — no server push wired yet).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Aurevashop";
  const options = {
    body: data.body || "You have a new update.",
    icon: "/icon-192.png",
    badge: "/icon-96.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(target); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
