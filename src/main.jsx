import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { createAppRouter } from './router'
import { RouterProvider } from '@tanstack/react-router'
import data from '@emoji-mart/data'
import { init } from 'emoji-mart'
import { getNodeEnv, getPublicEnv } from './lib/publicEnv'

// Initialize emoji-mart with reliable CDN for Twitter emojis
// Using emoji-datasource-twitter explicitly as @emoji-mart/data might not serve images on all CDNs
// Register Service Worker
if ('serviceWorker' in navigator) {
  if (getNodeEnv() === 'production') {
    window.addEventListener('load', () => {
      const basePath = (getPublicEnv('PUBLIC_BASE_PATH') || '/Qurio/').replace(/\/?$/, '/')
      navigator.serviceWorker
        .register(`${basePath}sw.js`)
        .then(registration => {
          console.log('SW registered: ', registration)
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError)
        })
    })
  } else {
    // In development, explicitly unregister any existing service workers to prevent caching issues
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
        registration.unregister()
        console.log('SW unregistered in dev mode')
      }
    })
  }
}

init({
  data,
  backgroundImageFn: (set, sheetSize) => {
    return `https://cdn.jsdelivr.net/npm/emoji-datasource-google@15.0.1/img/google/sheets/${sheetSize}.png`
  },
})

const router = createAppRouter()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
