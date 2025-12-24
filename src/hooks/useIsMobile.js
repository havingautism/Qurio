import { useState, useEffect } from 'react'

const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Initial check
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    checkMobile()

    // Use matchMedia for more performant/reliable updates if supported, fallback to resize
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
      const handleChange = e => setIsMobile(e.matches)

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
      }
      // Safari < 14 and older browsers
      else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange)
        return () => mediaQuery.removeListener(handleChange)
      }
    }

    // Fallback
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [breakpoint])

  return isMobile
}

export default useIsMobile
