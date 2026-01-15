/**
 * CodeBlock Component
 * Renders syntax-highlighted code blocks with copy functionality
 * Supports both inline and block code, including mermaid diagrams
 */

import { useCallback, useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Streamdown } from 'streamdown'
import clsx from 'clsx'
import { copyToClipboard } from './messageUtils.js'

export function CodeBlock({ inline, className, children, isDark, ...props }) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1].toLowerCase() : ''
  const langLabel = match ? match[1].toUpperCase() : 'CODE'
  const rawCodeText = String(children)
  const codeText = rawCodeText.replace(/\n$/, '')
  const isBlock =
    !inline && (language || rawCodeText.includes('\n') || className?.includes('language-'))

  // Render mermaid diagram
  if (isBlock && language === 'mermaid') {
    const mermaidOptions = useMemo(
      () => ({
        config: { theme: isDark ? 'dark' : 'default' },
      }),
      [isDark],
    )

    return (
      <div className="mb-4">
        <Streamdown mode="static" mermaid={mermaidOptions} controls={{ mermaid: true }}>
          {`\`\`\`mermaid\n${codeText}\n\`\`\``}
        </Streamdown>
      </div>
    )
  }

  // Render full code block
  if (isBlock) {
    return (
      <div className="relative group mb-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-x-auto bg-user-bubble/20 dark:bg-zinc-800/30">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold bg-user-bubble/50 dark:bg-zinc-800/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
          <span>{langLabel}</span>
          <button
            onClick={() => copyToClipboard(codeText)}
            className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            Copy
          </button>
        </div>
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={language || 'text'}
          PreTag="div"
          className="code-scrollbar text-sm text-shadow-none! font-code!"
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            borderRadius: 'inherit',
            whiteSpace: 'pre',
            wordBreak: 'normal',
          }}
          codeTagProps={{
            style: {
              backgroundColor: 'transparent',
              fontFamily: 'inherit',
              whiteSpace: 'inherit',
            },
          }}
          {...props}
        >
          {codeText}
        </SyntaxHighlighter>
      </div>
    )
  }

  // Render inline code
  return (
    <code
      className={`${className} bg-user-bubble dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono font-semibold text-black dark:text-white`}
      {...props}
    >
      {children}
    </code>
  )
}

/**
 * Plain code block renderer (for error fallbacks)
 */
export function PlainCodeBlock({ codeText, language, isDark }) {
  return (
    <div className="relative group mb-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-x-auto bg-user-bubble/20 dark:bg-zinc-800/30">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold bg-user-bubble/50 dark:bg-zinc-800/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
        <span>{String(language || 'CODE').toUpperCase()}</span>
        <button
          onClick={() => copyToClipboard(codeText)}
          className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        >
          Copy
        </button>
      </div>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language || 'text'}
        PreTag="div"
        className="code-scrollbar text-sm text-shadow-none! font-code!"
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          whiteSpace: 'pre',
          wordBreak: 'normal',
        }}
        codeTagProps={{
          style: {
            backgroundColor: 'transparent',
            fontFamily: 'inherit',
            whiteSpace: 'inherit',
          },
        }}
      >
        {codeText}
      </SyntaxHighlighter>
    </div>
  )
}
