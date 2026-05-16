const CACHE = 'apex-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/', '/index.html', '/manifest.json', '/apex-icon.svg']).catch(() => {}),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone()
        if (request.method === 'GET' && res.ok) {
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/index.html'))),
  )
})
