import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'
import {
  getLatestEditableUserIndex,
  getLatestRegeneratableAiIndex,
  getRenderableMessageEntries,
} from '../lib/chat/messageListUtils'

const BaseMessageList = ({
  BubbleComponent,
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
  const { messages } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
    })),
  )

  const latestEditableUserIndex = getLatestEditableUserIndex(messages)
  const latestRegeneratableAiIndex = getLatestRegeneratableAiIndex(messages)
  const renderableEntries = getRenderableMessageEntries(messages)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col pb-5 sm:pb-16">
      {renderableEntries.map(({ msg, originalIndex }) => (
        <BubbleComponent
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

export default React.memo(BaseMessageList)
