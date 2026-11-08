/*
 * Solo Kanban service worker.
 *
 * - Precaches the /offline page (plus the CSS/JS/fonts it needs) and the icons.
 * - Cache-first for hashed build assets (/_next/static/*) and /icons/*.
 * - Network-first for page navigations, falling back to the last cached copy
 *   of that page, then to /offline.
 * - Never touches anything else: server actions (POST / "Next-Action"),
 *   RSC/flight requests ("RSC" header or ?_rsc=), HMR, cross-origin requests.
 *
 * Bump VERSION whenever this file's logic, the precache list or the icons
 * change; old caches are deleted when the new worker activates.
 */
const VERSION = "v1";
const PREFIX = "solo-kanban-";
const PRECACHE = `${PREFIX}precache-${VERSION}`;
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const PAGES_CACHE = `${PREFIX}pages-${VERSION}`;
const CURRENT_CACHES = [PRECACHE, STATIC_CACHE, PAGES_CACHE];

const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

const MAX_STATIC_ENTRIES = 300;
const MAX_PAGE_ENTRIES = 50;
const STATIC_ASSET_RE = /\/_next\/static\/[^"'\s<>()\\]+/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));

      // The offline page must render without a network: cache its assets too.
      const offline = await cache.match(OFFLINE_URL);
      if (offline) {
        const urls = assetUrlsIn(await offline.text());
        await Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));
      }

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(PREFIX) && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only plain same-origin GETs. Server actions are POSTs.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Next.js internals that must always hit the network.
  const { headers } = request;
  if (headers.has("next-action")) return;
  if (headers.has("rsc") || url.searchParams.has("_rsc")) return;
  if (headers.has("next-router-prefetch") || headers.has("next-router-state-tree")) return;
  if (
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.includes(".hot-update.") ||
    url.pathname.startsWith("/__nextjs")
  ) {
    return;
  }
  if (url.pathname === "/sw.js") return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(event));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
  }
});

/** Hashed build assets and icons: serve from cache, fill it from the network. */
async function cacheFirst(event) {
  const { request } = event;
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    event.waitUntil(
      caches
        .open(STATIC_CACHE)
        .then((cache) => cache.put(request, copy))
        .then(() => trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES))
        .catch(() => undefined)
    );
  }
  return response;
}

/** Pages: always try the network; offline, use the last copy or /offline. */
async function networkFirstPage(event) {
  const { request } = event;
  try {
    const response = await fetch(request);
    // Redirects arrive as opaque responses here; only cache real pages.
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(cachePage(request, copy).catch(() => undefined));
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(request, { cacheName: PAGES_CACHE, ignoreVary: true })) ||
      (await caches.match(OFFLINE_URL, { ignoreVary: true }));
    if (cached) return cached;
    throw error;
  }
}

/** Store a page and make sure the build assets it references are cached. */
async function cachePage(request, response) {
  const html = await response.clone().text();
  const pages = await caches.open(PAGES_CACHE);
  await pages.put(request, response);
  await trimCache(PAGES_CACHE, MAX_PAGE_ENTRIES);

  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    assetUrlsIn(html).map(async (url) => {
      if (await caches.match(url, { ignoreVary: true })) return;
      try {
        const asset = await fetch(url);
        if (asset.ok) await statics.put(url, asset);
      } catch {
        // Best effort: a missing asset only matters offline.
      }
    })
  );
  await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
}

function assetUrlsIn(html) {
  return Array.from(new Set(html.match(STATIC_ASSET_RE) || []));
}

/** Drop the oldest entries beyond `max` (Cache keys are in insertion order). */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) {
    await cache.delete(keys[i]);
  }
}
