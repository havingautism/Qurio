const CACHE_NAME = 'qurio-chat-v1'
// Add base path for GitHub Pages deployment
const BASE_PATH = '/Qurio/'
// Cache essential static assets only
const urlsToCache = [
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}logo-light.svg`,
  `${BASE_PATH}logo-dark.svg`
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache)
    })
  )
  // Force the new service worker to become active immediately
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  // Clean up old caches immediately
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim()
    })
  )
})

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  // Don't cache API calls or external requests
  if (!event.request.url.startsWith(self.location.origin)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      // Try network first for HTML files to ensure fresh content
      if (event.request.destination === 'document' ||
          event.request.url.endsWith('.html')) {
        return fetch(event.request)
          .then(response => {
            // Don't cache HTML files to avoid stale versions
            return response
          })
          .catch(() => {
            // Fallback to cached HTML if network fails
            return cache.match(event.request)
          })
      }

      // For static assets, try cache first
      return cache.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse
        }

        // If not in cache, fetch from network
        return fetch(event.request).then(response => {
          // Only cache successful responses
          if (response.status === 200 && response.type === 'basic') {
            cache.put(event.request, response.clone())
          }
          return response
        })
      })
    })
  )
})
