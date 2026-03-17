import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../../lib/chatStore'
import useExpertAgentSelection from '../../hooks/expert/useExpertAgentSelection'
import { isExpertAiMessage, normalizeExpertResponses } from '../../lib/chat/expertViewAdapter'
import MessageBubble from '../MessageBubble'

const ExpertMessageBubble = props => {
  const { messageIndex } = props
  const { messages } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
    })),
  )

  const message = messages[messageIndex]
  const expertResponses = useMemo(
    () => normalizeExpertResponses(message),
    [message?.expertResponses],
  )
  const isExpertMessage = isExpertAiMessage(message, expertResponses)
  const { syntheticMessage } = useExpertAgentSelection({
    message,
    expertResponses,
    isExpertMessage,
  })

  if (!isExpertMessage) {
    return <MessageBubble {...props} />
  }

  return <MessageBubble {...props} messageOverride={syntheticMessage} compactStreamingTextBlocks />
}

export default React.memo(ExpertMessageBubble)
