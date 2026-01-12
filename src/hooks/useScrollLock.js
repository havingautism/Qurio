import { useEffect } from 'react'

/**
 * Hook to lock the body scroll when a component is mounted or a condition is met.
 * @param {boolean} isLocked - Whether the scroll should be locked.
 */
const useScrollLock = isLocked => {
  useEffect(() => {
    if (!isLocked) return

    const scrollY = window.scrollY || document.documentElement.scrollTop || 0
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.matchMedia?.('(display-mode: minimal-ui)')?.matches ||
      window.navigator?.standalone === true
    const shouldFixBody =
      !isStandalone &&
      (document.body.scrollHeight > window.innerHeight ||
        document.documentElement.scrollHeight > window.innerHeight)

    const bodyStyle = document.body.style
    const htmlStyle = document.documentElement.style

    const originalBody = {
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      right: bodyStyle.right,
      width: bodyStyle.width,
      paddingRight: bodyStyle.paddingRight,
    }

    const originalHtml = {
      overflow: htmlStyle.overflow,
      overscrollBehavior: htmlStyle.overscrollBehavior,
    }

    const originalBodyOverscroll = bodyStyle.overscrollBehavior

    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth
    if (scrollbarGap > 0) {
      bodyStyle.paddingRight = `${scrollbarGap}px`
    }

    htmlStyle.overflow = 'hidden'
    htmlStyle.overscrollBehavior = 'none'

    bodyStyle.overflow = 'hidden'
    bodyStyle.overscrollBehavior = 'none'
    if (shouldFixBody) {
      bodyStyle.position = 'fixed'
      bodyStyle.top = `-${scrollY}px`
      bodyStyle.left = '0'
      bodyStyle.right = '0'
      bodyStyle.width = '100%'
    }

    // Cleanup function to restore original style
    return () => {
      bodyStyle.overflow = originalBody.overflow
      bodyStyle.position = originalBody.position
      bodyStyle.top = originalBody.top
      bodyStyle.left = originalBody.left
      bodyStyle.right = originalBody.right
      bodyStyle.width = originalBody.width
      bodyStyle.paddingRight = originalBody.paddingRight
      bodyStyle.overscrollBehavior = originalBodyOverscroll

      htmlStyle.overflow = originalHtml.overflow
      htmlStyle.overscrollBehavior = originalHtml.overscrollBehavior

      if (shouldFixBody) {
        window.scrollTo(0, scrollY)
      }
    }
  }, [isLocked])
}

export default useScrollLock
