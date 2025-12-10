const CACHE_NAME = 'filo-chat-v1'
// Add base path for GitHub Pages deployment
const BASE_PATH = '/Qurio/'
const urlsToCache = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}logo-light.svg`,
  `${BASE_PATH}logo-dark.svg`
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache)
    }),
  )
})

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response
      }
      return fetch(event.request).catch(() => {
        // If network request fails, try to serve from cache with base path
        if (event.request.url.includes('/Qurio/')) {
          return caches.match(event.request.url.replace('/Qurio/', ''))
        }
        return caches.match(event.request)
      })
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
