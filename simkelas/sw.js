"use strict";

const CACHE_PREFIX = "simkelas-jkn-cache-";
const CACHE_VERSION = "v5";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/* =========================================================================
   INSTALL: Precache seluruh aset penting secara tangguh
========================================================================= */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (assetUrl) => {
          const request = new Request(assetUrl, { cache: "reload" });
          const response = await fetch(request);
          if (response && response.ok) {
            await cache.put(assetUrl, response.clone());
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

/* =========================================================================
   ACTIVATE: Hapus cache versi lama tanpa menyentuh IndexedDB pengguna
========================================================================= */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      );
      await self.clients.claim();
    })()
  );
});

/* =========================================================================
   MESSAGE: Mendukung aktivasi pembaruan segera dari halaman utama
========================================================================= */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* =========================================================================
   FETCH:
   - Navigasi HTML: Network-First dengan fallback ke cache ./index.html
   - Aset Statis Same-Origin: Cache-First dengan pembaruan latar belakang
========================================================================= */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1. Permintaan navigasi halaman (membuka/muat ulang aplikasi)
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            cache.put("./index.html", networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          const cachedPage = (await cache.match(request)) || (await cache.match("./index.html")) || (await cache.match("./"));
          if (cachedPage) return cachedPage;
          return new Response("Aplikasi sedang offline dan halaman belum tersimpan di cache.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        }
      })()
    );
    return;
  }

  // 2. Aset statis (ikon, manifest, berkas pendukung lokal)
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedAsset = await cache.match(request);

      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cachedAsset) {
        event.waitUntil(networkFetch);
        return cachedAsset;
      }

      const freshResponse = await networkFetch;
      if (freshResponse) return freshResponse;

      return new Response("Aset tidak tersedia saat offline.", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    })()
  );
});
