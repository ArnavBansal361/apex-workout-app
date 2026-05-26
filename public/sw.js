const CACHE = 'apex-shell-v3'
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/apex-logo.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }

  if (request.method !== 'GET') {
    event.respondWith(fetch(request))
    return
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
