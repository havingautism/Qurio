import { useEffect } from 'react'

/**
 * Hook to update CSS variable for sidebar width
 * This enables smooth CSS transitions using Tailwind classes
 */
export const useSidebarOffset = (isSidebarOpen) => {
  useEffect(() => {
    const updateSidebarWidth = () => {
      // On xl screens and up (>= 1280px), sidebar is always visible, so always move
      // On smaller screens, only move when sidebar is open
      const shouldMove = isSidebarOpen || window.innerWidth >= 1280

      if (!shouldMove) {
        document.documentElement.style.setProperty('--sidebar-width', '0px')
        return
      }

      // Calculate expected width based on Tailwind classes using rem units
      let sidebarWidth = '0px'
      if (window.innerWidth >= 1280) {
        sidebarWidth = '20rem' // xl:w-80 = 20rem
      } else if (window.innerWidth >= 1024) {
        sidebarWidth = '28rem' // lg:w-[28rem]
      } else if (window.innerWidth >= 768) {
        sidebarWidth = '24rem' // md:w-96 = 24rem
      } else {
        // For mobile, use viewport percentage (w-3/4 = 75vw)
        sidebarWidth = '75vw'
      }

      // Update CSS variable
      document.documentElement.style.setProperty('--sidebar-width', sidebarWidth)
    }

    // Initial calculation
    updateSidebarWidth()

    // Add window resize listener to handle screen size changes
    const handleResize = () => {
      updateSidebarWidth()
    }

    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      // Reset CSS variable on cleanup
      document.documentElement.style.setProperty('--sidebar-width', '0px')
    }
  }, [isSidebarOpen])
}