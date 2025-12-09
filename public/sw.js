const CACHE_NAME = 'qurio-v1'
const BASE_SCOPE = (self.registration && self.registration.scope) || '/'
// Ensure trailing slash
const BASE = BASE_SCOPE.endsWith('/') ? BASE_SCOPE : `${BASE_SCOPE}/`
const urlsToCache = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.json`,
  `${BASE}logo-light.svg`,
  `${BASE}logo-dark.svg`,
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => {
        // Skip caching errors on install; fallback to network
        console.warn('SW cache addAll failed', err)
      }),
  )
})

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response
      }
      return fetch(event.request)
    }),
  )
})

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
})
