// Service worker: uygulama kabuğunu önbelleğe alır, çevrimdışıyken sayfa yine açılır.
// Uzak veri (raw.githubusercontent.com) bilinçli olarak yakalanmaz; uygulama kaynak durumunu kendisi raporlar.
const CACHE = 'radar-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/data/latest.json', '/data/history.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Hash'li dosyalar değişmez: önce önbellek.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit ?? fetchAndCache(e.request)));
    return;
  }
  // Sayfa ve yedek veri: önce ağ, olmazsa önbellek.
  e.respondWith(
    fetchAndCache(e.request).catch(() =>
      caches.match(e.request, { ignoreSearch: true })
        .then((hit) => hit ?? (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});

async function fetchAndCache(request) {
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return res;
}
