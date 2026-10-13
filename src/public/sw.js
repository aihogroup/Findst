/* ==========================================================================
   Service Worker Findst
   Strategi per jenis berkas:
   - Aset statis berhash (/assets/<hash>/, /fonts/, /icons/) → cache-first
   - Halaman HTML (navigasi)                                → network-first,
     cadangan cache, lalu /offline.html
   - Data dinamis publik (/content/*.json, API faq/announcements)
                                                            → stale-while-revalidate
   - Area privat (/app/ data API, POST, permintaan bertoken) → network-only,
     TIDAK PERNAH di-cache (data pribadi & premium)
   __BUILD_VERSION__ dan __PRECACHE__ diisi oleh scripts/build.mjs
   ========================================================================== */
const VERSION = "__BUILD_VERSION__";
const PRECACHE = __PRECACHE__;
const STATIC_CACHE = `findst-static-${VERSION}`;
const PAGES_CACHE = `findst-pages-${VERSION}`;
const DATA_CACHE = "findst-data-v1";
const OFFLINE_URL = "/offline.html";
const PUBLIC_API_ACTIONS = new Set(["faq", "announcements"]);
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE);
      // Tidak memanggil skipWaiting(): pengguna memilih kapan memuat ulang
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGES_CACHE, DATA_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("findst-") && !keep.has(k)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

/* ---------------- Strategi ---------------- */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC_CACHE)).put(request, response.clone());
  return response;
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirstPage(event) {
  const { request } = event;
  const cache = await caches.open(PAGES_CACHE);
  try {
    const preload = await event.preloadResponse;
    const response = preload || (await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]));
    // Halaman area privat tidak disimpan
    if (response.ok && !new URL(request.url).pathname.startsWith("/app/")) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request, { ignoreSearch: true })) || (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    // Shell SPA /app/ tersedia dari precache untuk deep link
    if (new URL(request.url).pathname.startsWith("/app/")) {
      const shell = await caches.match("/app/");
      if (shell) return shell;
    }
    return (await caches.match(OFFLINE_URL)) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return network;
}

/* ---------------- Router ---------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POST (login, dsb.) → selalu jaringan
  if (request.headers.has("Authorization")) return; // bertoken → jangan di-cache

  const url = new URL(request.url);

  // API Apps Script: hanya aksi publik yang di-cache
  if (url.hostname.endsWith("script.google.com") || url.hostname.endsWith("script.googleusercontent.com")) {
    if (PUBLIC_API_ACTIONS.has(url.searchParams.get("action"))) event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }

  if (url.pathname.startsWith("/content/")) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if (/^\/(assets|fonts|icons)\//.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request));
  }
});
