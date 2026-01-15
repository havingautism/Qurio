/**
 * useImagePreview Hook
 * Manages image preview modal with keyboard handling and body scroll lock
 */

import { useState, useEffect } from 'react'

export function useImagePreview() {
  const [activeImageUrl, setActiveImageUrl] = useState(null)

  useEffect(() => {
    if (!activeImageUrl) return

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setActiveImageUrl(null)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeImageUrl])

  return { activeImageUrl, setActiveImageUrl }
}
