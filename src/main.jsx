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
    navigator.serviceWorker
      .register('/sw.js')
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
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
