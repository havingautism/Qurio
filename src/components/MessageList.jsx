import React from 'react';
import MessageBubble from './MessageBubble';

const MessageList = ({ messages, apiProvider }) => {
  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-32">
      {messages.map((msg, index) => (
        <MessageBubble key={index} message={msg} apiProvider={apiProvider} />
      ))}
    </div>
  );
};

export default MessageList;
