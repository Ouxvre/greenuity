self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("greenuity-cache-v1").then((cache) => {
      return cache.addAll([
        "/",
        "/index.html",
        "/pages/auth/login.html",
        "/css/style.css",
        "/js/firebase-config.js",
        "/public/assets/logo/logo-greenunity.svg"
      ]);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
