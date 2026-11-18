// Mode hors connexion : la version en ligne est prioritaire, la copie locale sert de secours.
const CACHE = 'scan-eps-v58';
const FILES = ['./', './index.html', './fiche.js', './bareme2.js', './app.js', './extras.js', './seance.js', './lib/qrcode.js', './lib/jsQR.js', './manifest.webmanifest', './trombinoscope.js', './ocr/client/tesseract.min.js', './ocr/client/worker.min.js', './ocr/core/tesseract-core-lstm.js', './ocr/client/tesseract-core-lstm.wasm', './ocr/lang/fra.traineddata.gz'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
