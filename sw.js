// Service worker: guarda la aplicación en el dispositivo para que abra sin conexión.
//
// IMPORTANTE: cada vez que publiques cambios en cualquier archivo, sube el número de VERSION.
// Así los dispositivos descargan la versión nueva (la verán al abrir la app una segunda vez).
const VERSION = '2.0.0';
const CACHE = `control-clases-${VERSION}`;

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/config.js',
  'js/importer.js',
  'js/logic.js',
  'js/store.js',
  'js/ui.js',
  'js/data/seed.js',
  'js/repo/localRepository.js',
  'js/repo/httpRepository.js',
  'js/repo/supabaseConfig.js',
  'js/repo/supabaseAuth.js',
  'js/repo/supabaseRepository.js',
  'js/repo/syncRepository.js',
  'js/utils/dates.js',
  'js/utils/dom.js',
  'js/views/calendario.js',
  'js/views/claseForm.js',
  'js/views/clases.js',
  'js/views/config.js',
  'js/views/cuenta.js',
  'js/views/inicio.js',
  'js/views/progreso.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('control-clases-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // las llamadas a un backend futuro no se tocan

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((enCache) => {
      if (enCache) return enCache;
      return fetch(req).catch(() => {
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    }),
  );
});
