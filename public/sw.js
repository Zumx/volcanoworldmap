/* Service worker — offline support for the basemap.
 *
 * Strategy:
 *  - OpenStreetMap raster tiles  → cache-first with an LRU-style cap, so a map
 *    a visitor has already panned over keeps working offline (and re-loads
 *    instantly on the next visit). Tiles are immutable, so a stale tile is
 *    always fine.
 *  - Same-origin GET navigations/assets → network-first, falling back to the
 *    cache when offline so a revisited page still renders without a connection.
 *
 * Everything else is left to the network untouched. The cache name is
 * versioned; bump the suffix to force old caches to be purged on activate.
 */
const TILE_CACHE = "osm-tiles-v1";
const SHELL_CACHE = "app-shell-v1";
const TILE_MAX = 600; // ~ a few cities' worth of tiles at common zoom levels

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([TILE_CACHE, SHELL_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.map((n) => (keep.has(n) ? null : caches.delete(n))));
      await self.clients.claim();
    })()
  );
});

function isTile(url) {
  return /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname);
}

// Cache-first for tiles. Opaque cross-origin responses are still cacheable and
// serveable, which is exactly what we need for the no-CORS tile images.
async function tileFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === "opaque")) {
      await cache.put(request, res.clone());
      trimCache(TILE_CACHE, TILE_MAX);
    }
    return res;
  } catch {
    const fallback = await cache.match(request);
    return fallback || Response.error();
  }
}

// Network-first for the app shell; fall back to whatever we cached last time.
async function shellFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === "basic") {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error("offline and not cached");
  }
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const overflow = keys.length - max;
  for (let i = 0; i < overflow; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (isTile(url)) {
    event.respondWith(tileFirst(request));
    return;
  }

  // Same-origin page navigations + static assets: network-first with cache
  // fallback. Skip data/API-ish paths so we never serve a stale dataset.
  if (
    url.origin === self.location.origin &&
    request.mode === "navigate"
  ) {
    event.respondWith(shellFirst(request));
  }
});
