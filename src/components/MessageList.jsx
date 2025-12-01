import React from 'react';
import MessageBubble from './MessageBubble';

const MessageList = ({
  messages,
  apiProvider,
  onRelatedClick,
  onMessageRef,
  onEdit,
}) => {
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
          message={msg}
          apiProvider={apiProvider}
          onRelatedClick={onRelatedClick}
          onEdit={() => onEdit && onEdit(index)}
        />
      ))}
    </div>
  );
};

export default React.memo(MessageList);
