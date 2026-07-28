// Atlas Arcade service worker: offline play + instant repeat loads.
// Bump CACHE when shipping new assets so clients pick them up.
const CACHE = "atlas-arcade-v8";

// App shell + data needed to boot. Paths are relative to the SW scope, so this
// works whether the site is served at a domain root or a /repo/ subpath.
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/theme.css",
  "./styles/screens.css",
  "./styles/globe.css",
  "./vendor/d3.v7.min.js",
  "./vendor/topojson-client.min.js",
  "./src/main.js",
  "./src/data.js",
  "./src/ui.js",
  "./src/engine.js",
  "./src/globe.js",
  "./src/questions.js",
  "./src/match.js",
  "./src/hints.js",
  "./src/scoring.js",
  "./src/silhouette.js",
  "./src/input.js",
  "./src/audio.js",
  "./src/geo.js",
  "./src/rng.js",
  "./src/share.js",
  "./src/modes/arcade.js",
  "./src/modes/daily.js",
  "./assets/data/countries.json",
  "./assets/geo/countries-50m.json",
  "./assets/geo/countries-110m.json",
  "./assets/geo/earth-texture.jpg",
  "./assets/fonts/archivo-black.woff2",
  "./assets/fonts/inter.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // Don't fail the whole install if one optional file is missing.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs (flags load on demand and get cached here too),
// falling back to network. Everything is static, so this is safe and fast.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit)
    )
  );
});
