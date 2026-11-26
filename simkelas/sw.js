"use strict";

const CACHE_VERSION = "simkelas-jkn-static-v2.2.0";
const RUNTIME_CACHE = "simkelas-jkn-runtime-v2.2.0";

const CORE_PRECACHE_ASSETS = [
  "./SimhitungBPJS.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

const OPTIONAL_PRECACHE_ASSETS = [
  "./",
  "./index.html"
];

// INSTALL: Precache seluruh aset inti lokal secara tangguh
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      await Promise.allSettled(
        CORE_PRECACHE_ASSETS.map(async (url) => {
          const response = await fetch(new Request(url, { cache: "reload" }));
          if (response && response.ok) {
            await cache.put(url, response);
          }
        })
      );

      await Promise.allSettled(
        OPTIONAL_PRECACHE_ASSETS.map(async (url) => {
          const response = await fetch(new Request(url, { cache: "reload" }));
          if (response && response.ok) {
            await cache.put(url, response);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

// ACTIVATE: Hapus cache versi lama saja; JANGAN menyentuh IndexedDB pengguna
self.addEventListener("activate", (event) => {
  const validCaches = new Set([CACHE_VERSION, RUNTIME_CACHE]);
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (!validCaches.has(key)) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
      await self.clients.claim();
    })()
  );
});

// FETCH: Cache-First untuk aset lokal & navigasi offline; Stale-While-Revalidate untuk eksternal opsional
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // 1. Navigasi Halaman (HTML): Cache-First + Revalidasi Latar Belakang + Fallback Offline
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cachedPage =
          (await cache.match(req, { ignoreSearch: true })) ||
          (await cache.match("./SimhitungBPJS.html")) ||
          (await cache.match("./index.html")) ||
          (await cache.match("./"));

        const networkFetch = fetch(req)
          .then((netRes) => {
            if (netRes && netRes.ok) {
              cache.put("./SimhitungBPJS.html", netRes.clone());
            }
            return netRes;
          })
          .catch(() => null);

        if (cachedPage) {
          event.waitUntil(networkFetch);
          return cachedPage;
        }

        const fresh = await networkFetch;
        if (fresh) return fresh;

        return new Response(
          "<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'><title>Offline</title></head>" +
            "<body style='font-family:sans-serif;padding:24px;background:#042F2E;color:#FFFFFF;'>" +
            "<h2>Aplikasi Sedang Offline</h2>" +
            "<p>Cache awal belum tersimpan. Hubungkan internet sekali untuk menginstal aset PWA.</p></body></html>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      })()
    );
    return;
  }

  // 2. Aset Same-Origin (HTML, JSON, Ikon, Skrip Lokal): Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;

        try {
          const netRes = await fetch(req);
          if (netRes && netRes.ok) {
            cache.put(req, netRes.clone());
          }
          return netRes;
        } catch (err) {
          return new Response("", { status: 404, statusText: "Offline Asset Unavailable" });
        }
      })()
    );
    return;
  }

  // 3. Aset Eksternal Opsional (Google Fonts / SheetJS CDN): Stale-While-Revalidate
  event.respondWith(
    (async () => {
      const runtimeCache = await caches.open(RUNTIME_CACHE);
      const cached = await runtimeCache.match(req);

      const networkPromise = fetch(req)
        .then((netRes) => {
          if (netRes && (netRes.ok || netRes.type === "opaque")) {
            runtimeCache.put(req, netRes.clone());
          }
          return netRes;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(networkPromise);
        return cached;
      }

      const fresh = await networkPromise;
      if (fresh) return fresh;

      return new Response("", { status: 504, statusText: "External Resource Offline" });
    })()
  );
});
