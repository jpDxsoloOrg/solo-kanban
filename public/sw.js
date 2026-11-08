/*
 * Solo Kanban service worker.
 *
 * - Precaches the /offline page (plus the CSS/JS/fonts it needs) and the icons.
 * - Cache-first for hashed build assets (/_next/static/*) and /icons/*;
 *   fonts (/_next/static/media/*) and stylesheets (/_next/static/css/*)
 *   only while offline.
 * - Network-first for page navigations, falling back to the last cached copy
 *   of that page (marked as a saved copy, see SAVED_COPY_META), then to
 *   /offline. The start URL "/" is never cached: it only redirects to a
 *   board, so offline it redirects to the page cached last instead.
 * - Never touches anything else: API routes (/api/*, e.g. the live-update
 *   revision poll, which must always reach the server), server actions
 *   (POST / "Next-Action"), RSC/flight requests ("RSC" header or ?_rsc=),
 *   HMR, cross-origin requests.
 *
 * Bump VERSION whenever this file's logic, the precache list or the icons
 * change; old caches are deleted when the new worker activates.
 */
const VERSION = "v3";
const PREFIX = "solo-kanban-";
const PRECACHE = `${PREFIX}precache-${VERSION}`;
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const PAGES_CACHE = `${PREFIX}pages-${VERSION}`;
const CURRENT_CACHES = [PRECACHE, STATIC_CACHE, PAGES_CACHE];

const OFFLINE_URL = "/offline";
// The manifest's start_url.
const START_URL = "/";
/**
 * Added to the <head> of a page served from PAGES_CACHE, with the time the
 * copy was saved: src/components/pwa/OfflineBanner.tsx then says it's a
 * saved copy and reloads it once the server can be reached again.
 */
const SAVED_COPY_META = "sk-saved-copy";
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

  // API routes are always live data (e.g. /api/revision for live updates):
  // never intercepted, never cached.
  if (url.pathname.startsWith("/api/")) return;

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

  // Fonts and stylesheets: while online, leave them to the browser (they're
  // immutable and stay in its HTTP cache). Responses preload them in a Link
  // header, and Chrome doesn't always match a preload to a copy this worker
  // serves: for fonts it repeats a "preloaded but not used" warning after
  // every later request on the page (i.e. every live-update poll); on error
  // pages (e.g. a 404), which only add the stylesheet once loaded, it warns
  // of a "cross-world service worker resource mismatch". Offline, serve our
  // copies (cached with /offline and with every cached page).
  if (
    self.navigator.onLine &&
    (url.pathname.startsWith("/_next/static/media/") || url.pathname.startsWith("/_next/static/css/"))
  ) {
    return;
  }

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
  const isStartUrl = new URL(request.url).pathname === START_URL;
  try {
    const response = await fetch(request);
    // Redirects arrive as opaque responses here; only cache real pages. "/"
    // redirects to a board, or welcomes a first-time user: not worth keeping.
    if (response.ok && response.type === "basic" && !isStartUrl) {
      const copy = response.clone();
      event.waitUntil(cachePage(request, copy).catch(() => undefined));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { cacheName: PAGES_CACHE, ignoreVary: true });
    if (cached) return markAsSavedCopy(cached);

    // An offline launch from the home screen: open the page used last.
    if (isStartUrl) {
      const lastPage = await lastCachedPageUrl();
      if (lastPage) return Response.redirect(lastPage, 302);
    }

    const offline = await caches.match(OFFLINE_URL, { ignoreVary: true });
    if (offline) return offline;
    throw error;
  }
}

/** The page cached most recently (cachePage() re-adds a page on every load). */
async function lastCachedPageUrl() {
  const keys = await (await caches.open(PAGES_CACHE)).keys();
  for (let i = keys.length - 1; i >= 0; i--) {
    const { pathname } = new URL(keys[i].url);
    if (pathname !== START_URL && pathname !== OFFLINE_URL) return keys[i].url;
  }
  return null;
}

/** Adds the SAVED_COPY_META marker (with the time the copy was saved). */
async function markAsSavedCopy(response) {
  const html = await response.text();
  const savedAt = new Date(response.headers.get("date") ?? "");
  const marker = `<meta name="${SAVED_COPY_META}" content="${
    Number.isNaN(savedAt.getTime()) ? "" : savedAt.toISOString()
  }">`;
  const headers = new Headers(response.headers);
  // The body is decoded, and its length changes.
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(
    html.replace(/<head(\s[^>]*)?>/i, (head) => head + marker),
    { status: response.status, statusText: response.statusText, headers }
  );
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
