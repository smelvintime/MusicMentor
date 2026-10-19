// Offline support. Network-first: online you always get the latest deploy (no
// version bumps, no stale cache); offline it falls back to the last copy saved.
// ponytail: no network timeout, so a very slow connection waits on the network before falling back.
const CACHE = 'musicmentor';
const PIANO = ['C7'];
for (let o = 2; o <= 6; o++) PIANO.push(...['C', 'Ds', 'Fs', 'A'].map((n) => n + o));
const ASSETS = ['./', 'app.js', 'theory.js', 'vexflow.js', ...PIANO.map((n) => `piano/${n}.mp3`)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? caches.match('./') : Response.error())),
  );
});
