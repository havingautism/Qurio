/**
 * useInitialSkeleton Hook
 * Manages initial skeleton loading state for messages
 */

import { useState, useEffect } from 'react'
import { SKELETON_FADE_MS } from '../../components/messageBubble/messageConstants.js'
import { hasMainTextContent } from '../../components/messageBubble/messageUtils.js'

export function useInitialSkeleton(message, isLoading, messageIndex, messages, isDeepResearch, mergedMessage) {
  const hasMainText = hasMainTextContent(message?.content)

  const shouldShowInitialSkeleton =
    !hasMainText &&
    (message?.isStreaming ??
      ((isLoading && message.role === 'ai' && messageIndex === messages.length - 1) ||
        !!mergedMessage?._isContinuationLoading ||
        !!mergedMessage?._isContinuationStreaming)) &&
    !isDeepResearch &&
    !mergedMessage?._isContinuationLoading

  const [renderInitialSkeleton, setRenderInitialSkeleton] = useState(shouldShowInitialSkeleton)
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(shouldShowInitialSkeleton)

  useEffect(() => {
    if (shouldShowInitialSkeleton) {
      setRenderInitialSkeleton(true)
      const frame = requestAnimationFrame(() => setShowInitialSkeleton(true))
      return () => cancelAnimationFrame(frame)
    }
    setShowInitialSkeleton(false)
    const timer = setTimeout(() => setRenderInitialSkeleton(false), SKELETON_FADE_MS)
    return () => clearTimeout(timer)
  }, [shouldShowInitialSkeleton])

  return { renderInitialSkeleton, showInitialSkeleton }
}
