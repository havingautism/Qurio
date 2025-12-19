'use client'

import { useEffect, useState } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import data from '@emoji-mart/data'
import { init } from 'emoji-mart'
import { createAppRouter } from './router'

const getBasePath = () => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/'
  return basePath.replace(/\/?$/, '/')
}

export default function ClientApp() {
  const [router, setRouter] = useState(null)

  useEffect(() => {
    setRouter(createAppRouter())
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        window.addEventListener('load', () => {
          const basePath = getBasePath()
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
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            registration.unregister()
            console.log('SW unregistered in dev mode')
          }
        })
      }
    }
  }, [])

  useEffect(() => {
    init({
      data,
      backgroundImageFn: (set, sheetSize) => {
        return `https://cdn.jsdelivr.net/npm/emoji-datasource-google@15.0.1/img/google/sheets/${sheetSize}.png`
      },
    })
  }, [])

  if (!router) return null
  return <RouterProvider router={router} />
}
