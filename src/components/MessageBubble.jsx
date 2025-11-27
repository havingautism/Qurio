import React from 'react';
import { Copy, ThumbsUp, ThumbsDown, Share2, MoreHorizontal, FileText, List, AlignLeft, Layers } from 'lucide-react';

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end w-full mb-8">
        <div className="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 px-5 py-3 rounded-3xl rounded-tr-sm max-w-2xl text-base leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mb-12 flex flex-col gap-6">
      {/* Answer Header */}
      <div className="flex items-center gap-3 text-gray-900 dark:text-gray-100">
        <AlignLeft size={24} className="text-cyan-500" />
        <h2 className="text-lg font-medium">Answer</h2>
      </div>

      {/* Sources Section */}
      {message.sources && message.sources.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {message.sources.map((source, index) => (
            <div
              key={index}
              className="bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-3 cursor-pointer transition-colors flex flex-col justify-between h-24"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                {source.title}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] text-gray-600 dark:text-gray-300">
                  {index + 1}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {source.domain}
                </span>
              </div>
            </div>
          ))}
          {/* View more sources placeholder */}
          <div className="bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-3 cursor-pointer transition-colors flex items-center justify-center h-24">
            <span className="text-xs text-gray-500 dark:text-gray-400">View 2 more</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed">
        {/* We'll render the content directly here. For the hardcoded demo, we can pass JSX or HTML string */}
        {typeof message.content === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: message.content }} />
        ) : (
          message.content
        )}
      </div>

      {/* Related Questions */}
      {message.related && message.related.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-3 text-gray-900 dark:text-gray-100">
            <Layers size={24} className="text-cyan-500" />
            <h3 className="text-lg font-medium">Related</h3>
          </div>
          <div className="flex flex-col gap-2">
            {message.related.map((question, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group"
              >
                <span className="text-gray-700 dark:text-gray-300 font-medium">{question}</span>
                <div className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500">
                  <PlusIcon />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-4 mt-2 border-t border-gray-100 dark:border-zinc-800 pt-4">
        <button className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <Share2 size={16} />
          Share
        </button>
        <button className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <Copy size={16} />
          Copy
        </button>
        <div className="flex-1" />
        <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <ThumbsUp size={16} />
        </button>
        <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <ThumbsDown size={16} />
        </button>
        <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
};

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
)

export default MessageBubble;
