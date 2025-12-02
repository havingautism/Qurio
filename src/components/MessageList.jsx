import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import useChatStore from '../lib/chatStore';
import MessageBubble from './MessageBubble';

/**
 * MessageList component that directly consumes chatStore state
 * Eliminates props drilling and automatically responds to message updates
 */
const MessageList = ({
  apiProvider,
  onRelatedClick,
  onMessageRef,
  onEdit,
  onRegenerateAnswer,
}) => {
  // Get messages directly from chatStore using shallow selector
  const { messages } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
    }))
  );

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-32">
      {messages.map((msg, index) => (
        <MessageBubble
          key={index}
          messageId={`message-${index}`}
          bubbleRef={(el) =>
            onMessageRef
              ? onMessageRef(`message-${index}`, msg, el)
              : undefined
          }
          messageIndex={index}
          apiProvider={apiProvider}
          onRelatedClick={(q) => onRelatedClick(q)}
          onEdit={() => onEdit && onEdit(index)}
          onRegenerateAnswer={() =>
            onRegenerateAnswer && onRegenerateAnswer(index)
          }
        />
      ))}
    </div>
  );
};

export default React.memo(MessageList);
