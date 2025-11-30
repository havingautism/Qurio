import React, { useState, useEffect, useRef } from "react";
import {
  Copy,
  ThumbsUp,
  ThumbsDown,
  Share2,
  MoreHorizontal,
  FileText,
  List,
  AlignLeft,
  Layers,
  Brain,
  ChevronRight,
  ChevronDown,
  CornerRightDown,
  Pencil,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";

import { getProvider } from "../lib/providers";

const MessageBubble = ({
  message,
  apiProvider,
  onRelatedClick,
  messageId,
  bubbleRef,
  onEdit,
}) => {
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains("dark")
  );
  const mainContentRef = useRef(null);

  // State to track copy success
  const [isCopied, setIsCopied] = useState(false);

  // Utility function to copy text to clipboard
  const copyToClipboard = async (text) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      // Show a brief success indication
      console.log("Text copied to clipboard");
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  // Effect to handle copy success timeout with proper cleanup
  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, 2000);

      // Cleanup function to clear timeout if component unmounts
      return () => clearTimeout(timer);
    }
  }, [isCopied]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          setIsDark(document.documentElement.classList.contains("dark"));
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const [isThoughtExpanded, setIsThoughtExpanded] = useState(true);
  const isUser = message.role === "user";

  if (isUser) {
    let contentToRender = message.content;
    let imagesToRender = [];

    if (Array.isArray(message.content)) {
      const textPart = message.content.find((c) => c.type === "text");
      contentToRender = textPart ? textPart.text : "";
      imagesToRender = message.content.filter((c) => c.type === "image_url");
    }

    return (
      <div
        id={messageId}
        ref={bubbleRef}
        className="flex justify-end w-full mb-8 group"
      >
        <div className="flex items-end gap-3">
          {/* Action Buttons */}
          <div className="opacity-0 group-hover:opacity-100 flex  gap-1 transition-opacity duration-200">
            <button
              onClick={() => onEdit && onEdit()}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-zinc-800/50 rounded-lg transition-colors"
              title="Edit"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => {
                copyToClipboard(contentToRender);
                setIsCopied(true);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-zinc-800/50 rounded-lg transition-colors"
              title="Copy"
            >
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          <div className="flex flex-col items-end gap-2 max-w-2xl">
            {imagesToRender.length > 0 && (
              <div className="flex gap-2 mb-1 flex-wrap justify-end">
                {imagesToRender.map((img, idx) => (
                  <div
                    key={idx}
                    className="w-24 h-24 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 shadow-sm"
                  >
                    <img
                      src={img.image_url.url}
                      alt="attachment"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="bg-[#f7f1f2] dark:bg-zinc-800 text-gray-800 dark:text-gray-100 px-5 py-3 rounded-3xl rounded-tr-sm text-base leading-relaxed font-serif">
              {contentToRender}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Parse content using provider-specific logic
  const provider = getProvider(apiProvider);
  const { content: mainContent, thought: thoughtContent } =
    provider.parseMessage(message.content);

  const CodeBlock = ({ inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const langLabel = match ? match[1].toUpperCase() : "CODE";

    if (!inline && match) {
      return (
        <div className="relative group my-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-[#202222]">
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
            <span>{langLabel}</span>
            <button className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
              Copy
            </button>
          </div>
          <SyntaxHighlighter
            style={isDark ? oneDark : oneLight}
            language={match[1]}
            PreTag="div"
            className="code-scrollbar text-sm"
            customStyle={{
              margin: 0,
              padding: "1rem",
              background: "transparent", // Let the container handle bg if needed, or use theme's bg
            }}
            codeTagProps={{
              style: {
                backgroundColor: "transparent",
                fontFamily: '"Google Sans Code", monospace',
              },
            }}
            {...props}
          >
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        </div>
      );
    }

    return (
      <code
        className={`${className} bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-['Google_Sans_Code'] text-pink-500 dark:text-pink-400`}
        {...props}
      >
        {children}
      </code>
    );
  };

  return (
    <div
      id={messageId}
      ref={bubbleRef}
      className="w-full max-w-3xl mb-12 flex flex-col gap-6"
    >
      {/* Answer Header */}
      <div className="flex items-center gap-3 text-gray-900 dark:text-gray-100">
        <AlignLeft size={24} className="text-cyan-500" />
        <h2 className="text-lg font-medium">Answer</h2>
      </div>

      {/* Thinking Process Section */}
      {thoughtContent && (
        <div className="border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Brain size={16} className="text-cyan-500 dark:text-cyan-400" />
              <span>Thinking Process</span>
            </div>
            {isThoughtExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>

          {isThoughtExpanded && (
            <div className="p-4 bg-gray-50/50 dark:bg-zinc-800/30 border-t border-gray-200 dark:border-zinc-700 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ node, ...props }) => (
                    <p className="mb-2 last:mb-0" {...props} />
                  ),
                  code: CodeBlock,
                }}
              >
                {thoughtContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

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
            <span className="text-xs text-gray-500 dark:text-gray-400">
              View 2 more
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        ref={mainContentRef}
        className="prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed font-serif"
      >
        {!message.content && !thoughtContent ? (
          <div className="flex flex-col gap-2 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
          </div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ node, ...props }) => (
                <p className="mb-4 last:mb-0" {...props} />
              ),
              h1: ({ node, ...props }) => (
                <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h2 className="text-xl font-bold mb-3 mt-5" {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 className="text-lg font-bold mb-2 mt-4" {...props} />
              ),
              ul: ({ node, ...props }) => (
                <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />
              ),
              li: ({ node, ...props }) => <li className="mb-1" {...props} />,
              blockquote: ({ node, ...props }) => (
                <blockquote
                  className="border-l-4 border-gray-300 dark:border-zinc-600 pl-4 italic my-4 text-gray-600 dark:text-gray-400"
                  {...props}
                />
              ),
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto my-4 rounded-lg border border-gray-200 dark:border-zinc-700 table-scrollbar code-scrollbar">
                  <table
                    className="min-w-full divide-y divide-gray-200 dark:divide-zinc-700"
                    {...props}
                  />
                </div>
              ),
              thead: ({ node, ...props }) => (
                <thead className="bg-gray-50 dark:bg-zinc-800" {...props} />
              ),
              tbody: ({ node, ...props }) => (
                <tbody
                  className="bg-white dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-zinc-700"
                  {...props}
                />
              ),
              tr: ({ node, ...props }) => <tr {...props} />,
              th: ({ node, ...props }) => (
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  {...props}
                />
              ),
              td: ({ node, ...props }) => (
                <td
                  className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
                  {...props}
                />
              ),
              code: CodeBlock,
            }}
          >
            {mainContent}
          </ReactMarkdown>
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
                onClick={() => onRelatedClick && onRelatedClick(question)}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group"
              >
                <span className="text-gray-700 dark:text-gray-300 font-medium">
                  {question}
                </span>
                <div className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500">
                  <CornerRightDown />
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
        <button
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          onClick={() => {
            // Copy only the rendered markdown text (no extra metadata/sections)
            const renderedText =
              mainContentRef.current?.innerText?.trim() || "";
            const fallbackText = mainContent || "";
            copyToClipboard(renderedText || fallbackText);
            setIsCopied(true);
          }}
        >
          {isCopied ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              <span className="text-green-600 dark:text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={16} />
              Copy
            </>
          )}
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
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

export default MessageBubble;
