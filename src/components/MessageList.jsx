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
  maxWidthClass = 'max-w-3xl',
}) => {
  // Get messages directly from chatStore using shallow selector
  const { messages } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
    })),
  )

  return (
    <div className={`flex flex-col w-full ${maxWidthClass} mx-auto pb-5 sm:pb-16`}>
      {messages
        .map((msg, originalIndex) => ({ msg, originalIndex })) // Preserve original index
        .filter(({ msg, originalIndex }) => {
          // Hide form submission user messages (they're for AI context only)
          if (msg.role === 'user' && typeof msg.content === 'string') {
            if (msg.content.startsWith('[Form Submission]')) {
              return false
            }
          }

          // Hide AI continuation messages (they follow form submission and will be merged)
          if (msg.role === 'ai' && originalIndex > 0) {
            const prevMsg = messages[originalIndex - 1]
            if (
              prevMsg &&
              prevMsg.role === 'user' &&
              typeof prevMsg.content === 'string' &&
              prevMsg.content.startsWith('[Form Submission]')
            ) {
              return false // This AI message is a continuation, skip it
            }
          }

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
            onEdit={() => onEdit && onEdit(originalIndex)}
            onDelete={() => onDelete && onDelete(originalIndex)}
            onQuote={onQuote}
            onRegenerateAnswer={() => onRegenerateAnswer && onRegenerateAnswer(originalIndex)}
            onUserRegenerate={() => onUserRegenerate && onUserRegenerate(originalIndex)}
            onFormSubmit={onFormSubmit}
          />
        ))}
    </div>
  )
}

export default React.memo(MessageList)
