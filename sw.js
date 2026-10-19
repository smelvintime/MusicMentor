// Offline support. Network-first: online you always get the latest deploy (no
// version bumps, no stale cache); offline, or if the network takes longer than
// NETWORK_TIMEOUT_MS, it serves the last copy saved.
const CACHE = 'musicmentor';
const NETWORK_TIMEOUT_MS = 5000;
const PIANO = ['C7'];
for (let o = 2; o <= 6; o++) PIANO.push(...['C', 'Ds', 'Fs', 'A'].map((n) => n + o));
const ASSETS = ['./', 'app.js', 'theory.js', 'vexflow.js', ...PIANO.map((n) => `piano/${n}.mp3`)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

const fromCache = async (request) =>
  (await caches.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? caches.match('./') : undefined);

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  // Keeps running after a timeout, so the cache still gets the fresh copy for next time.
  const network = fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  });
  network.catch(() => {}); // a late failure after we already answered from cache is fine
  e.respondWith((async () => {
    const slow = new Promise((r) => setTimeout(r, NETWORK_TIMEOUT_MS, 'slow'));
    try {
      const first = await Promise.race([network, slow]);
      if (first !== 'slow') return first;
      return (await fromCache(request)) || (await network); // nothing saved yet: keep waiting
    } catch {
      return (await fromCache(request)) || Response.error();
    }
  })());
});
