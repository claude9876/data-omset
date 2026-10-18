/* Service worker — Penjualan Shopee
 * - Halaman utama : jaringan dulu (selalu versi terbaru), cadangan dari cache saat offline
 * - Aset & pustaka CDN : cache dulu, diperbarui diam-diam di belakang layar
 * - Supabase (data) : TIDAK PERNAH di-cache, supaya angka selalu asli
 * Naikkan VERSION jika Anda mengganti ikon atau file statis lain.
 */
const VERSION    = 'v4';
const SHELL_CACHE = 'shopee-shell-' + VERSION;
const CDN_CACHE   = 'shopee-cdn-' + VERSION;
const SCOPE_URL   = self.registration.scope;

const SHELL = [
  './',
  './manifest.json',
  './ios-install.js',
  './import-tab.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-48.png'
];
// Pustaka yang dipakai index.html — disimpan agar aplikasi tetap bisa dibuka saat offline
const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

async function precache(cacheName, urls, mapKey) {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(urls.map(async url => {
    const res = await fetch(url, {cache: 'reload'});
    if (!res.ok) throw new Error(url + ' -> ' + res.status);
    // Halaman navigasi tidak boleh berupa respons redirect
    if (mapKey && url === './') { if (!res.redirected) await cache.put(SCOPE_URL, res); }
    else await cache.put(url, res);
  })).then(rs => rs.forEach(r => { if (r.status === 'rejected') console.warn('[SW] precache gagal:', r.reason); }));
}

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([precache(SHELL_CACHE, SHELL, true), precache(CDN_CACHE, CDN, false)])
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('shopee-') && k !== SHELL_CACHE && k !== CDN_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function networkFirstPage(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await withTimeout(fetch(req), 5000);
    if (res && res.ok && !res.redirected) cache.put(SCOPE_URL, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(SCOPE_URL) || await cache.match('./index.html');
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Offline</title><body style="font:16px system-ui;padding:32px;text-align:center">' +
      '<h2>Tidak ada koneksi</h2><p>Sambungkan internet lalu muat ulang halaman.</p></body>',
      {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}});
  }
}

async function networkFirstAsset(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await withTimeout(fetch(req), 5000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req)) || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const refresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Data Supabase: langsung ke jaringan, jangan disentuh
  if (/(^|\.)supabase\.(co|in)$/.test(url.hostname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstAsset(req));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
  }
});
