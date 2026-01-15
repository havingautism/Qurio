/**
 * useCopySuccess Hook
 * Manages copy success state with automatic timeout
 */

import { useState, useEffect } from 'react'
import { COPY_SUCCESS_TIMEOUT } from '../../components/messageBubble/messageConstants.js'

export function useCopySuccess() {
  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false)
      }, COPY_SUCCESS_TIMEOUT)

      return () => clearTimeout(timer)
    }
  }, [isCopied])

  return { isCopied, setIsCopied }
}
