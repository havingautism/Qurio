/**
 * useThinkingStatus Hook
 * Manages rotating status messages during AI thinking/research
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function useThinkingStatus(isActive) {
  const [thinkingStatusIndex, setThinkingStatusIndex] = useState(0)
  const { t } = useTranslation()

  const THINKING_STATUS_MESSAGES = [
    t('chat.thinking'),
    t('chat.analyzing'),
    t('chat.workingThroughIt'),
    t('chat.checkingDetails'),
  ]

  const DEEP_RESEARCH_STATUS_MESSAGES = [
    t('chat.deepResearchPlanning'),
    t('chat.deepResearchSynthesizing'),
    t('chat.deepResearchDrafting'),
    t('chat.deepResearchRefining'),
  ]

  const statusMessageCount = Math.max(
    DEEP_RESEARCH_STATUS_MESSAGES.length,
    THINKING_STATUS_MESSAGES.length,
  )

  useEffect(() => {
    if (!isActive) return undefined
    setThinkingStatusIndex(0)

    const intervalId = setInterval(() => {
      setThinkingStatusIndex(prev => (prev + 1) % statusMessageCount)
    }, 1800)

    return () => clearInterval(intervalId)
  }, [isActive, statusMessageCount])

  return {
    thinkingStatusIndex,
    thinkingStatusText: THINKING_STATUS_MESSAGES[thinkingStatusIndex] || THINKING_STATUS_MESSAGES[0],
    researchStatusText: DEEP_RESEARCH_STATUS_MESSAGES[0],
  }
}
