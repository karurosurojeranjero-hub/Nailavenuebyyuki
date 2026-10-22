// Minimal service worker: lets the site be installed. Never caches the API or admin data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api") || u.pathname.startsWith("/uploads")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
