import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { createAppRouter } from './router'
import { RouterProvider } from '@tanstack/react-router'
import data from '@emoji-mart/data'
import { init } from 'emoji-mart'
import { getNodeEnv, getPublicEnv } from './lib/publicEnv'

const shouldRedirectHomeOnRuntimeError = message => {
  const text = String(message || '')
  return (
    text.includes('RuntimeError: factory is undefined') && text.includes('longTermMemoryService.js')
  )
}

const setupRuntimeErrorRecovery = () => {
  if (typeof window === 'undefined' || getNodeEnv() !== 'development') return
  if (window.__qurioRuntimeRecoveryBound) return
  window.__qurioRuntimeRecoveryBound = true

  let redirected = false
  const redirectHomeOnce = () => {
    if (redirected) return
    redirected = true
    const homePath = (getPublicEnv('PUBLIC_BASE_PATH') || '/').replace(/\/?$/, '/')
    if (window.location.pathname !== homePath) {
      window.location.replace(homePath)
    }
  }

  window.addEventListener('error', event => {
    const message = event?.error?.message || event?.message || ''
    if (shouldRedirectHomeOnRuntimeError(message)) redirectHomeOnce()
  })

  window.addEventListener('unhandledrejection', event => {
    const reason = event?.reason
    let serializedReason = ''
    if (typeof reason === 'object' && reason !== null) {
      try {
        serializedReason = JSON.stringify(reason)
      } catch {
        serializedReason = ''
      }
    }
    const message =
      (typeof reason === 'string' ? reason : reason?.message) ||
      serializedReason
    if (shouldRedirectHomeOnRuntimeError(message)) redirectHomeOnce()
  })
}

// Initialize emoji-mart with reliable CDN for Twitter emojis
// Using emoji-datasource-twitter explicitly as @emoji-mart/data might not serve images on all CDNs
// Register Service Worker
if (
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  (window.location.protocol === 'http:' || window.location.protocol === 'https:')
) {
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

setupRuntimeErrorRecovery()

// Load Maple Mono CN from CDN for code blocks.
const mapleMonoStylesheetId = 'maple-mono-cn-stylesheet'
if (!document.getElementById(mapleMonoStylesheetId)) {
  const link = document.createElement('link')
  link.id = mapleMonoStylesheetId
  link.rel = 'stylesheet'
  link.href =
    'https://chinese-fonts-cdn.deno.dev/packages/maple-mono-cn/dist/MapleMono-CN-Regular/result.css'
  document.head.appendChild(link)
}

const router = createAppRouter()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
