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
const VERSION = "cddec1e5a4";
const PRECACHE = [
  "/",
  "/offline.html",
  "/app/",
  "/masuk/",
  "/daftar/",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/favicon.svg",
  "/icons/icon-192.png",
  "/assets/cddec1e5a4/css/app.css",
  "/assets/cddec1e5a4/css/auth.css",
  "/assets/cddec1e5a4/css/main.css",
  "/assets/cddec1e5a4/js/components/atoms/button.js",
  "/assets/cddec1e5a4/js/components/atoms/ripple.js",
  "/assets/cddec1e5a4/js/components/molecules/pull-to-refresh.js",
  "/assets/cddec1e5a4/js/components/molecules/toast.js",
  "/assets/cddec1e5a4/js/components/organisms/accordion.js",
  "/assets/cddec1e5a4/js/components/organisms/confirm-dialog.js",
  "/assets/cddec1e5a4/js/components/organisms/dialog.js",
  "/assets/cddec1e5a4/js/components/organisms/disclosure.js",
  "/assets/cddec1e5a4/js/config/app.config.js",
  "/assets/cddec1e5a4/js/core/a11y.js",
  "/assets/cddec1e5a4/js/core/app-state.js",
  "/assets/cddec1e5a4/js/core/dom.js",
  "/assets/cddec1e5a4/js/core/haptics.js",
  "/assets/cddec1e5a4/js/core/http.js",
  "/assets/cddec1e5a4/js/core/i18n.js",
  "/assets/cddec1e5a4/js/core/islands.js",
  "/assets/cddec1e5a4/js/core/islands.registry.js",
  "/assets/cddec1e5a4/js/core/query.js",
  "/assets/cddec1e5a4/js/core/sanitize.js",
  "/assets/cddec1e5a4/js/core/storage.js",
  "/assets/cddec1e5a4/js/core/store.js",
  "/assets/cddec1e5a4/js/core/utils.js",
  "/assets/cddec1e5a4/js/features/app/index.js",
  "/assets/cddec1e5a4/js/features/app/router.js",
  "/assets/cddec1e5a4/js/features/app/views.js",
  "/assets/cddec1e5a4/js/features/auth/form-controller.js",
  "/assets/cddec1e5a4/js/features/auth/index.js",
  "/assets/cddec1e5a4/js/features/auth/validation.js",
  "/assets/cddec1e5a4/js/features/consent/index.js",
  "/assets/cddec1e5a4/js/features/landing/announcements.js",
  "/assets/cddec1e5a4/js/features/landing/disclosure.island.js",
  "/assets/cddec1e5a4/js/features/landing/faq.js",
  "/assets/cddec1e5a4/js/features/landing/hero-parallax.js",
  "/assets/cddec1e5a4/js/features/landing/hero.js",
  "/assets/cddec1e5a4/js/features/landing/market-clock.js",
  "/assets/cddec1e5a4/js/features/landing/market-hours.js",
  "/assets/cddec1e5a4/js/features/landing/templates.js",
  "/assets/cddec1e5a4/js/features/landing/threshold-diagram.js",
  "/assets/cddec1e5a4/js/features/landing/threshold-model.js",
  "/assets/cddec1e5a4/js/features/navbar/index.js",
  "/assets/cddec1e5a4/js/features/network/index.js",
  "/assets/cddec1e5a4/js/features/preferences/font-loader.js",
  "/assets/cddec1e5a4/js/features/preferences/index.js",
  "/assets/cddec1e5a4/js/features/preferences/preferences.model.js",
  "/assets/cddec1e5a4/js/features/pwa/index.js",
  "/assets/cddec1e5a4/js/locales/en.js",
  "/assets/cddec1e5a4/js/locales/id.js",
  "/assets/cddec1e5a4/js/main.js",
  "/assets/cddec1e5a4/js/services/api/gas.adapter.js",
  "/assets/cddec1e5a4/js/services/api/index.js",
  "/assets/cddec1e5a4/js/services/api/mock.adapter.js",
  "/assets/cddec1e5a4/js/services/session.js"
];
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
