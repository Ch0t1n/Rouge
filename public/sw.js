/* ROUGE Service Worker — básico y conservador.
 * - Precachea el shell mínimo y la página offline.
 * - Navegación: network-first (datos en vivo) con fallback a cache / offline.
 * - Estáticos (_next/static, íconos, avatares, fuentes): cache-first.
 * - Nunca cachea llamadas a Supabase ni POST.
 * - Puerta sin conexión: /ops/door queda en caché; los datos (padrón) viven cifrados en IndexedDB, no acá.
 */
const VERSION = "rouge-v4";
// /ops/door se precachea: si se corta el Wi-Fi del boliche, la puerta abre igual y valida contra el padrón cifrado.
const SHELL = ["/", "/app", "/offline", "/ops/door", "/manifest.json", "/icons/icon-192.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co") || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (url.pathname.startsWith("/ops") ? await caches.match("/ops/door") : null) || (await caches.match("/offline")) || Response.error()),
    );
    return;
  }

  const isStatic =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/demo/"));
  const isFont = url.hostname === "fonts.gstatic.com";
  if (isStatic || isFont) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Cola virtual: tocar el aviso "Tu pedido está listo" abre (o enfoca) la Barra Express.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/bar";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname === url);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
