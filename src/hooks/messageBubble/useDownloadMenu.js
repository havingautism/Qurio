/**
 * useDownloadMenu Hook
 * Manages download menu state with click-outside-to-close functionality
 */

import { useState, useEffect, useRef } from 'react'

export function useDownloadMenu() {
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false)
  const downloadMenuRef = useRef(null)

  useEffect(() => {
    if (!isDownloadMenuOpen) return

    const handleOutside = event => {
      if (downloadMenuRef.current && downloadMenuRef.current.contains(event.target)) return
      setIsDownloadMenuOpen(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)

    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [isDownloadMenuOpen])

  return {
    isDownloadMenuOpen,
    setIsDownloadMenuOpen,
    downloadMenuRef,
  }
}
