import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'
import MessageBubble from './MessageBubble'

/**
 * MessageList component that directly consumes chatStore state
 * Eliminates props drilling and automatically responds to message updates
 */
const MessageList = ({
  apiProvider,
  defaultModel,
  onRelatedClick,
  onMessageRef,
  onEdit,
  onRegenerateAnswer,
  onDelete,
  onQuote,
  onUserRegenerate,
  onFormSubmit,
}) => {
  // Get messages directly from chatStore using shallow selector
  const { messages } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
    })),
  )

  const isHiddenFormSubmission = msg =>
    msg?.role === 'user' &&
    typeof msg?.content === 'string' &&
    msg.content.startsWith('[Form Submission]')

  const isHiddenAiContinuation = index => {
    if (index <= 0) return false
    const current = messages[index]
    const prev = messages[index - 1]
    return current?.role === 'ai' && isHiddenFormSubmission(prev)
  }

  const latestEditableUserIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg?.role === 'user' && !isHiddenFormSubmission(msg)) return i
    }
    return -1
  })()

  const latestRegeneratableAiIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg?.role === 'ai' && !isHiddenAiContinuation(i)) return i
    }
    return -1
  })()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col pb-5 sm:pb-16">
      {messages
        .map((msg, originalIndex) => ({ msg, originalIndex })) // Preserve original index
        .filter(({ msg, originalIndex }) => {
          // Hide form submission user messages (they're for AI context only)
          if (isHiddenFormSubmission(msg)) return false

          // Hide AI continuation messages (they follow form submission and will be merged)
          if (isHiddenAiContinuation(originalIndex)) return false

          return true
        })
        .map(({ msg, originalIndex }) => (
          <MessageBubble
            key={originalIndex}
            messageId={`message-${originalIndex}`}
            bubbleRef={el =>
              onMessageRef ? onMessageRef(`message-${originalIndex}`, msg, el) : undefined
            }
            messageIndex={originalIndex}
            apiProvider={apiProvider}
            defaultModel={defaultModel}
            onRelatedClick={q => onRelatedClick(q)}
            onEdit={
              originalIndex === latestEditableUserIndex
                ? () => onEdit && onEdit(originalIndex)
                : undefined
            }
            onDelete={() => onDelete && onDelete(originalIndex)}
            onQuote={onQuote}
            onRegenerateAnswer={
              originalIndex === latestRegeneratableAiIndex
                ? () => onRegenerateAnswer && onRegenerateAnswer(originalIndex)
                : undefined
            }
            onUserRegenerate={
              originalIndex === latestEditableUserIndex
                ? () => onUserRegenerate && onUserRegenerate(originalIndex)
                : undefined
            }
            onFormSubmit={onFormSubmit}
          />
        ))}
    </div>
  )
}

export default React.memo(MessageList)
