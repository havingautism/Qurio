import { useEffect } from 'react'

/**
 * Hook to lock the body scroll when a component is mounted or a condition is met.
 * @param {boolean} isLocked - Whether the scroll should be locked.
 */
let globalLockCount = 0
let globalSnapshot = null

const captureSnapshot = () => {
  const bodyStyle = document.body.style
  const htmlStyle = document.documentElement.style
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0
  const standaloneModes = ['standalone', 'minimal-ui', 'fullscreen']
  const isStandalone =
    standaloneModes.some(mode => window.matchMedia?.(`(display-mode: ${mode})`)?.matches) ||
    window.navigator?.standalone === true
  const shouldFixBody =
    !isStandalone &&
    window.matchMedia?.('(min-width: 768px)')?.matches &&
    (document.body.scrollHeight > window.innerHeight ||
      document.documentElement.scrollHeight > window.innerHeight)

  return {
    scrollY,
    shouldFixBody,
    body: {
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      right: bodyStyle.right,
      width: bodyStyle.width,
      paddingRight: bodyStyle.paddingRight,
      overscrollBehavior: bodyStyle.overscrollBehavior,
    },
    html: {
      overflow: htmlStyle.overflow,
      overscrollBehavior: htmlStyle.overscrollBehavior,
    },
  }
}

const applyGlobalLock = () => {
  if (globalLockCount !== 0) return

  globalSnapshot = captureSnapshot()
  const bodyStyle = document.body.style
  const htmlStyle = document.documentElement.style

  const scrollbarGap = window.innerWidth - document.documentElement.clientWidth
  if (scrollbarGap > 0) {
    bodyStyle.paddingRight = `${scrollbarGap}px`
  }

  htmlStyle.overflow = 'hidden'
  htmlStyle.overscrollBehavior = 'none'

  bodyStyle.overflow = 'hidden'
  bodyStyle.overscrollBehavior = 'none'
  if (globalSnapshot?.shouldFixBody) {
    bodyStyle.position = 'fixed'
    bodyStyle.top = `-${globalSnapshot.scrollY}px`
    bodyStyle.left = '0'
    bodyStyle.right = '0'
    bodyStyle.width = '100%'
  }
}

const releaseGlobalLock = () => {
  if (globalLockCount > 0) return
  if (!globalSnapshot) return

  const bodyStyle = document.body.style
  const htmlStyle = document.documentElement.style

  bodyStyle.overflow = globalSnapshot.body.overflow
  bodyStyle.position = globalSnapshot.body.position
  bodyStyle.top = globalSnapshot.body.top
  bodyStyle.left = globalSnapshot.body.left
  bodyStyle.right = globalSnapshot.body.right
  bodyStyle.width = globalSnapshot.body.width
  bodyStyle.paddingRight = globalSnapshot.body.paddingRight
  bodyStyle.overscrollBehavior = globalSnapshot.body.overscrollBehavior

  htmlStyle.overflow = globalSnapshot.html.overflow
  htmlStyle.overscrollBehavior = globalSnapshot.html.overscrollBehavior

  if (globalSnapshot.shouldFixBody) {
    window.scrollTo(0, globalSnapshot.scrollY)
  }

  globalSnapshot = null
}

const useScrollLock = isLocked => {
  useEffect(() => {
    if (!isLocked) return

    applyGlobalLock()
    globalLockCount += 1

    return () => {
      globalLockCount = Math.max(0, globalLockCount - 1)
      releaseGlobalLock()
    }
  }, [isLocked])
}

export default useScrollLock
