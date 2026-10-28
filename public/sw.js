// Offline support: the app shell and hashed assets are cached; API calls always go to the network.
const CACHE = 'research-os-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting() })
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || /^\/(api|arxiv|s2)\//.test(url.pathname)) return
  // Navigations: network first so new deploys show up, cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/index.html', copy)); return r }).catch(() => caches.match('/index.html')))
    return
  }
  // Static assets: cache first (Vite filenames are content-hashed).
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)) }
    return r
  })))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const target = e.notification.data?.url || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(ws => {
    const w = ws[0]
    return w ? w.focus().then(() => w.navigate(target)) : self.clients.openWindow(target)
  }))
})
