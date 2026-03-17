import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Check, Copy } from 'lucide-react'
import { Streamdown } from 'streamdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { parseChildrenWithEmojis } from '../../lib/emojiParser'

const sanitizeMarkdownUrl = (value, { allowDataImage = false } = {}) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (allowDataImage && /^data:image\/[a-zA-Z+.-]+;base64,/i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('#')) return trimmed

  try {
    const parsed = new URL(
      trimmed,
      typeof window !== 'undefined' ? window.location.href : undefined,
    )
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return parsed.toString()
    }
  } catch {
    return null
  }

  return null
}

const CodeBlock = ({ inline, className, children, isDark }) => {
  const [isCopied, setIsCopied] = useState(false)
  const match = /language-([\w-]+)/.exec(className || '')
  const language = match ? match[1].toLowerCase() : ''
  const langLabel = match ? match[1].toUpperCase() : 'CODE'
  const rawCodeText = String(children || '')
  const codeText = rawCodeText.replace(/\n$/, '')
  const isBlock =
    !inline && (language || rawCodeText.includes('\n') || className?.includes('language-'))

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText)
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1500)
    } catch (error) {
      console.error('[ConversationMarkdown] Failed to copy code block:', error)
    }
  }

  if (isBlock) {
    return (
      <div className="group bg-user-bubble/20 relative mb-4 overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700 dark:bg-zinc-800/40">
        <div className="bg-user-bubble/50 flex items-center justify-between border-b border-gray-200 px-4 py-2 text-[11px] font-semibold text-gray-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-gray-300">
          <span>{langLabel}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-2 py-1 text-[11px] text-gray-700 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 dark:bg-zinc-700 dark:text-gray-200"
          >
            {isCopied ? <Check size={12} /> : <Copy size={12} />}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={language || 'text'}
          PreTag="div"
          className="code-scrollbar font-code! text-sm text-shadow-none!"
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
        >
          {codeText}
        </SyntaxHighlighter>
      </div>
    )
  }

  return (
    <code
      className={clsx(
        className,
        'bg-user-bubble rounded-md px-1.5 py-0.5 font-mono text-sm text-black dark:bg-zinc-800 dark:text-white',
      )}
    >
      {children}
    </code>
  )
}

export default function ConversationMarkdown({ content, className }) {
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false,
  )

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
          setIsDark(document.documentElement.classList.contains('dark'))
        }
      })
    })

    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [])

  const markdownComponents = useMemo(
    () => ({
      code: ({ inline, className: codeClassName, children, ...props }) => (
        <CodeBlock inline={inline} className={codeClassName} isDark={isDark} {...props}>
          {children}
        </CodeBlock>
      ),
      p: ({ children, ...props }) => (
        <p className="mb-4 leading-7" {...props}>
          {parseChildrenWithEmojis(children)}
        </p>
      ),
      h1: ({ children, ...props }) => (
        <h1 className="mt-6 mb-4 text-2xl font-bold text-(--color-text-primary)" {...props}>
          {parseChildrenWithEmojis(children)}
        </h1>
      ),
      h2: ({ children, ...props }) => (
        <h2 className="mt-6 mb-4 text-xl font-bold text-(--color-text-primary)" {...props}>
          {parseChildrenWithEmojis(children)}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 className="mt-5 mb-4 text-lg font-bold text-(--color-text-primary)" {...props}>
          {parseChildrenWithEmojis(children)}
        </h3>
      ),
      ul: ({ ...props }) => <ul className="mb-4 list-disc space-y-1.5 pl-5" {...props} />,
      ol: ({ ...props }) => <ol className="mb-4 list-decimal space-y-1.5 pl-5" {...props} />,
      li: ({ children, ...props }) => (
        <li className="mb-1" {...props}>
          {parseChildrenWithEmojis(children)}
        </li>
      ),
      blockquote: ({ children, ...props }) => (
        <blockquote
          className="mb-4 border-l-4 border-gray-300 pl-4 text-gray-600 italic dark:border-zinc-600 dark:text-gray-400 [&_p]:mb-0"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </blockquote>
      ),
      table: ({ ...props }) => (
        <div className="table-scrollbar code-scrollbar mb-4 w-fit max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-700">
          <table className="w-auto divide-y divide-gray-200 dark:divide-zinc-700" {...props} />
        </div>
      ),
      thead: ({ ...props }) => <thead className="bg-user-bubble dark:bg-zinc-800" {...props} />,
      tbody: ({ ...props }) => (
        <tbody
          className="bg-user-bubble/20 divide-y divide-gray-200 dark:divide-zinc-700 dark:bg-zinc-900"
          {...props}
        />
      ),
      th: ({ children, ...props }) => (
        <th
          className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </th>
      ),
      td: ({ children, ...props }) => (
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" {...props}>
          {parseChildrenWithEmojis(children)}
        </td>
      ),
      a: ({ href, children, ...props }) => {
        const safeHref = sanitizeMarkdownUrl(href)
        if (!safeHref) {
          return <span {...props}>{parseChildrenWithEmojis(children)}</span>
        }

        return (
          <a
            href={safeHref}
            target="_blank"
            rel="noreferrer"
            className="bg-primary-200/50 text-primary-700 hover:bg-primary-300/50 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-700/50 mx-0.5 rounded-lg px-1 py-0.5 text-[12px]"
            {...props}
          >
            {parseChildrenWithEmojis(children)}
          </a>
        )
      },
      img: ({ src, alt }) => {
        const safeSrc = sanitizeMarkdownUrl(src, { allowDataImage: true })
        if (!safeSrc) return null

        return (
          <img
            src={safeSrc}
            alt={alt || ''}
            loading="lazy"
            className="mb-4 w-full rounded-2xl border border-black/5 object-cover shadow-sm dark:border-white/10"
          />
        )
      },
      hr: () => (
        <div className="relative my-4">
          <div className="h-px bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-zinc-700" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-gray-200 shadow-sm ring-2 ring-white dark:bg-zinc-700 dark:ring-zinc-900" />
          </div>
        </div>
      ),
    }),
    [isDark],
  )

  if (!content) return null

  return (
    <div className={clsx('max-w-none text-(--color-text-secondary)', className)}>
      <Streamdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </Streamdown>
    </div>
  )
}
