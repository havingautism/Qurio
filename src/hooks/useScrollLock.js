import { useEffect } from 'react'

/**
 * Hook to lock the body scroll when a component is mounted or a condition is met.
 * @param {boolean} isLocked - Whether the scroll should be locked.
 */
const useScrollLock = isLocked => {
  useEffect(() => {
    if (!isLocked) return

    // Save original overflow style
    const originalStyle = window.getComputedStyle(document.body).overflow

    // Lock scroll
    document.body.style.overflow = 'hidden'

    // Cleanup function to restore original style
    return () => {
      document.body.style.overflow = originalStyle
    }
  }, [isLocked])
}

export default useScrollLock
