// Minimal service worker — required by Chrome/Edge for the "Install app"
// prompt to appear. It doesn't cache anything; every request just goes
// straight to the network as usual.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});
