import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import router from './router'
import { RouterProvider } from '@tanstack/react-router'
import data from '@emoji-mart/data'
import { init } from 'emoji-mart'

// Initialize emoji-mart with reliable CDN for Twitter emojis
// Using emoji-datasource-twitter explicitly as @emoji-mart/data might not serve images on all CDNs
// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const basePath = (import.meta.env.PUBLIC_BASE_PATH || '/Qurio/').replace(/\/?$/, '/')
    navigator.serviceWorker
      .register(`${basePath}sw.js`)
      .then(registration => {
        console.log('SW registered: ', registration)
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError)
      })
  })
}

init({
  data,
  backgroundImageFn: (set, sheetSize) => {
    return `https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.0.1/img/twitter/sheets/${sheetSize}.png`
  },
})(
  // Handle SPA redirect from GitHub Pages (404.html -> /?redirect=...)
  () => {
    try {
      const params = new URLSearchParams(window.location.search || '')
      const redirectPath = params.get('redirect')
      if (redirectPath) {
        const basePath = (import.meta.env.PUBLIC_BASE_PATH || '/Qurio/').replace(/\/?$/, '/')
        const cleaned = redirectPath.replace(/^\/+/, '')
        const target = `${basePath}${cleaned}`
        window.history.replaceState(null, '', target)
      }
    } catch (err) {
      console.warn('Redirect handling failed', err)
    }
  },
)()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
