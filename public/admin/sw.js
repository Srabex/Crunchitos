// Service worker mínimo para que Chrome deje instalar la app. No guarda nada en caché: siempre pide a la red.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) { e.respondWith(fetch(e.request)); });
