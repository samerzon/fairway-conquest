/* Fairway Conquest service worker: app shell offline, course data cached as you use it. */
const VERSION = "fc-v3.0.0";
const SHELL = ["./", "index.html", "styles.css", "config.js", "osm.js", "gps.js", "net.js", "app.js",
  "vendor/peerjs.min.js", "vendor/qrcode.js", "manifest.webmanifest", "favicon.svg",
  "icons/icon-192.png", "icons/apple-touch-icon.png",
  "fonts/BarlowCond-600.woff2", "fonts/BarlowCond-800.woff2", "fonts/BarlowCond-800i.woff2", "fonts/BarlowCond-900i.woff2", "fonts/Bricolage.woff2",
  "assets/hero-sunset.webp", "assets/hero-sunset-wide.webp", "assets/hole-diorama.webp", "assets/trophy.webp", "assets/desert-aerial.webp"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;          // PeerJS broker, OpenStreetMap, Kit: always live network
  if (req.mode === "navigate") {                                              // pages: fresh when online, shell when offline
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put("index.html", c)); return r; })
      .catch(() => caches.match("index.html", { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c => {                       // everything else: cache first, refresh in background
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
