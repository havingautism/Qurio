import { useState, useEffect, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'
import {
  Copy,
  Share2,
  Layers,
  Brain,
  ChevronRight,
  ChevronDown,
  CornerRightDown,
  Pencil,
  Check,
  RefreshCw,
  // Quote is already imported, avoid duplication if necessary, but here we just list it cleanly
  Quote,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import clsx from 'clsx'
import { getProvider } from '../lib/providers'

const PROVIDER_META = {
  gemini: {
    label: 'Google Gemini',
    logo: 'https://www.google.com/favicon.ico',
    fallback: 'G',
  },
  openai_compatibility: {
    label: 'OpenAI Compatible',
    logo: 'https://openai.com/favicon.ico',
    fallback: 'O',
  },
  siliconflow: {
    label: 'SiliconFlow',
    logo: 'https://siliconflow.cn/favicon.ico',
    fallback: 'S',
  },
}

/**
 * Make inline [n] markers clickable to the corresponding source URL while keeping brackets.
 */
const formatContentWithSources = (content, sources = []) => {
  if (typeof content !== 'string' || !Array.isArray(sources) || sources.length === 0) {
    return content
  }
  return content.replace(/\[(\d+)\]/g, (match, p1) => {
    const idx = Number(p1) - 1
    const src = sources[idx]
    if (!src?.url) return match
    // Keep visible brackets by including them in the link text
    return `[\\[${p1}\\]](${src.url})`
  })
}

/**
 * MessageBubble component that directly accesses messages from chatStore via index
 * Reduces props drilling and improves component independence
 */
const MessageBubble = ({
  messageIndex,
  apiProvider,
  defaultModel,
  onRelatedClick,
  messageId,
  bubbleRef,
  onEdit,
  onRegenerateAnswer,
  onQuote,
}) => {
  // Get message directly from chatStore using shallow selector
  const { messages } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
    })),
  )

  // Extract message by index
  const message = messages[messageIndex]
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))
  const mainContentRef = useRef(null)
  const containerRef = useRef(null) // Local ref for the wrapper
  const prevStreamingRef = useRef(false)

  // State to track copy success
  const [isCopied, setIsCopied] = useState(false)

  // Utility function to copy text to clipboard
  const copyToClipboard = async text => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      // Show a brief success indication
      console.log('Text copied to clipboard')
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  // Effect to handle copy success timeout with proper cleanup
  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false)
      }, 2000)

      // Cleanup function to clear timeout if component unmounts
      return () => clearTimeout(timer)
    }
  }, [isCopied])

  // Selection Menu State
  const [selectionMenu, setSelectionMenu] = useState(null)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile view based on screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md: breakpoint
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Calculate optimal menu position to avoid viewport edges and selection
  const calculateMenuPosition = selectionRect => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const menuWidth = isMobile ? 160 : 150 // Slightly wider for text on mobile
    const menuHeight = isMobile ? 38 : 40
    const menuTopOffset = isMobile ? 8 : 10 // Distance above selection

    let x = selectionRect.left + selectionRect.width / 2
    let y = selectionRect.top - menuTopOffset

    // Adjust horizontal position to avoid viewport edges
    const halfMenuWidth = menuWidth / 2
    if (x - halfMenuWidth < 10) {
      x = 10 + halfMenuWidth
    } else if (x + halfMenuWidth > viewportWidth - 10) {
      x = viewportWidth - 10 - halfMenuWidth
    }

    // For mobile, always place below selection to avoid covering selected text
    if (isMobile) {
      y = selectionRect.bottom + 5 // Place below selection with small gap
    }
    // For desktop, if menu would go off top, place below
    else if (y - menuHeight < 10) {
      y = selectionRect.bottom + 5
    }

    // Ensure menu doesn't go below viewport on mobile
    if (isMobile && y + menuHeight > viewportHeight - 10) {
      y = Math.max(10, viewportHeight - menuHeight - 10)
    }

    return { x, y }
  }

  const updateSelectionMenuFromSelection = () => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    if (!text) {
      setSelectionMenu(null)
      return false
    }

    const container = containerRef.current
    if (!container || !container.contains(selection.anchorNode)) {
      setSelectionMenu(null)
      return false
    }

    if (!selection.rangeCount) return false
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    if (!rect || rect.width === 0 || rect.height === 0) {
      setSelectionMenu(null)
      return false
    }

    const position = calculateMenuPosition(rect)

    setSelectionMenu({
      x: position.x,
      y: position.y,
      text,
    })
    return true
  }

  const handleMouseUp = e => {
    // Only handle mouse events on desktop
    if (isMobile) return

    if (e.target.closest('.selection-menu')) return

    if (!updateSelectionMenuFromSelection()) {
      setSelectionMenu(null)
    }
  }

  // Handle touch events for mobile
  const handleTouchEnd = e => {
    if (!isMobile) return

    // Don't prevent default here to allow text selection
    // Instead, we'll handle it in contextmenu event

    // Use setTimeout to allow selection to complete after touch ends
    setTimeout(() => {
      if (!updateSelectionMenuFromSelection()) {
        setSelectionMenu(null)
      }
    }, 150) // Slightly longer delay for mobile
  }

  // Prevent context menu on mobile for text selection
  const handleContextMenu = e => {
    if (isMobile && e.target.closest('.message-content')) {
      e.preventDefault()
    }
  }

  // Clear menu on click/touch outside
  useEffect(() => {
    const handleDocumentInteraction = e => {
      // Clear menu if clicking/touching outside of it
      if (selectionMenu && !e.target.closest('.selection-menu')) {
        setSelectionMenu(null)
      }
    }

    // Use mousedown for desktop, touchstart for mobile
    const eventType = isMobile ? 'touchstart' : 'mousedown'
    document.addEventListener(eventType, handleDocumentInteraction)

    return () => document.removeEventListener(eventType, handleDocumentInteraction)
  }, [selectionMenu, isMobile])

  // Handle selection changes for mobile
  useEffect(() => {
    if (!isMobile) return

    const handleSelectionChange = () => {
      const selection = window.getSelection()
      const text = selection.toString().trim()

      if (!text) {
        setSelectionMenu(null)
        return
      }

      // On Android long-press selection may not fire touchend, so update menu here
      updateSelectionMenuFromSelection()
    }

    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [isMobile])

  useEffect(() => {
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

  const [isThoughtExpanded, setIsThoughtExpanded] = useState(true)
  const [showAllSources, setShowAllSources] = useState(false)
  const isUser = message.role === 'user'

  const CodeBlock = ({ inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '')
    const langLabel = match ? match[1].toUpperCase() : 'CODE'

    if (!inline && match) {
      return (
        <div className="relative group mb-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-x-auto bg-user-bubble/50 dark:bg-[#202222]">
          <div className="flex items-center font-mono! justify-between px-3 py-2 text-[11px] font-semibold bg-user-bubble/50 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
            <span>{langLabel}</span>
            <button className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
              padding: '1rem',
              background: 'transparent',
            }}
            codeTagProps={{
              style: {
                backgroundColor: 'transparent',
                fontFamily:
                  'CascadiaCode, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              },
            }}
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      )
    }

    return (
      <code
        className={`${className} bg-user-bubble dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono font-semibold text-black dark:text-white`}
        {...props}
      >
        {children}
      </code>
    )
  }

  const markdownComponents = useMemo(
    () => ({
      p: ({ node, ...props }) => <p className="mb-4 last:mb-0" {...props} />,
      h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />,
      h2: ({ node, ...props }) => <h2 className="text-xl font-bold mb-3 mt-5" {...props} />,
      h3: ({ node, ...props }) => <h3 className="text-lg font-bold mb-2 mt-4" {...props} />,
      ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
      ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
      li: ({ node, ...props }) => <li className="mb-1" {...props} />,
      blockquote: ({ node, ...props }) => (
        <blockquote
          className="border-l-4 border-gray-300 dark:border-zinc-600 pl-4 italic my-4 text-gray-600 dark:text-gray-400"
          {...props}
        />
      ),
      table: ({ node, ...props }) => (
        <div className="overflow-x-auto my-4 w-fit max-w-full rounded-lg border border-gray-200 dark:border-zinc-700 table-scrollbar code-scrollbar">
          <table className="w-auto divide-y divide-gray-200 dark:divide-zinc-700" {...props} />
        </div>
      ),
      thead: ({ node, ...props }) => (
        <thead className="bg-user-bubble dark:bg-zinc-800" {...props} />
      ),
      tbody: ({ node, ...props }) => (
        <tbody
          className="bg-user-bubble/50 dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-zinc-700"
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
      a: ({ node, ...props }) => (
        <a
          {...props}
          target="_blank"
          rel="noreferrer"
          className="text-[13px] text-primary-600 dark:text-primary-400"
        />
      ),
      hr: () => (
        <div className="relative my-6">
          <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent dark:via-zinc-700" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-zinc-700 shadow-sm ring-2 ring-white dark:ring-zinc-900" />
          </div>
        </div>
      ),
    }),
    [isDark], // Depend on isDark because CodeBlock uses it
  )

  if (isUser) {
    let contentToRender = message.content
    let imagesToRender = []
    let quoteToRender = null

    if (Array.isArray(message.content)) {
      const textPart = message.content.find(c => c.type === 'text')
      quoteToRender = message.content.find(c => c.type === 'quote')
      contentToRender = textPart ? textPart.text : ''
      imagesToRender = message.content.filter(c => c.type === 'image_url')
    }

    return (
      <div
        id={messageId}
        ref={el => {
          containerRef.current = el
          if (typeof bubbleRef === 'function') bubbleRef(el)
        }}
        className="flex justify-end w-full mb-3 sm:mb-6 group px-5 sm:px-0"
        onMouseUp={handleMouseUp}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        <div className="flex flex-col items-end gap-2 max-w-[90%] md:max-w-[75%]">
          {/* Message Content */}
          <div
            className={clsx(
              'relative px-5 py-3.5 rounded-3xl text-base',
              'bg-user-bubble dark:bg-zinc-800 text-gray-900 dark:text-gray-100',
            )}
          >
            {quoteToRender && (
              <div className="mb-2 p-2 bg-white/50 dark:bg-black/20 rounded-lg text-sm border-l-2 border-primary-500">
                <div className="font-medium opacity-70 mb-1">Quoting:</div>
                <div className="line-clamp-2 italic opacity-80">{quoteToRender.text}</div>
              </div>
            )}
            {imagesToRender.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {imagesToRender.map((img, idx) => (
                  <img
                    key={idx}
                    src={img.url}
                    alt="User uploaded"
                    className="max-w-full h-auto rounded-lg max-h-60 object-cover"
                  />
                ))}
              </div>
            )}
            <div
              className="message-content whitespace-pre-wrap wrap-break-word"
              // Prevent native selection menu on mobile
              style={{
                WebkitTouchCallout: isMobile ? 'none' : 'default',
                WebkitUserSelect: isMobile ? 'text' : 'auto',
                KhtmlUserSelect: isMobile ? 'text' : 'auto',
                MozUserSelect: isMobile ? 'text' : 'auto',
                MsUserSelect: isMobile ? 'text' : 'auto',
                userSelect: isMobile ? 'text' : 'auto',
              }}
            >
              {contentToRender}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex gap-2 transition-opacity duration-200 px-1">
            <button
              onClick={() => onEdit && onEdit()}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300  rounded-lg transition-colors"
              title="Edit"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => {
                copyToClipboard(contentToRender)
                setIsCopied(true)
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300  rounded-lg transition-colors"
              title="Copy"
            >
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const providerId = message.provider || apiProvider
  const providerMeta =
    PROVIDER_META[providerId] || { label: providerId || 'AI', logo: null, fallback: 'AI' }
  const resolvedModel = message.model || defaultModel || 'default model'

  // Parse content using provider-specific logic
  const provider = getProvider(providerId)
  const parsed = provider.parseMessage(message)
  const thoughtContent = message.thinkingEnabled === false ? null : parsed.thought
  const mainContent = parsed.content
  const contentWithCitations = formatContentWithSources(mainContent, message.sources)
  const isStreaming = !!message?.isStreaming
  const hasThoughtText = !!(thoughtContent && String(thoughtContent).trim())
  const shouldShowThought = message.thinkingEnabled !== false && (isStreaming || hasThoughtText)

  // Removed duplicate definitions

  // Wait, CodeBlock uses isDark. Since CodeBlock is defined inside component, it captures closure.
  // We should pass CodeBlock to useMemo dependency if it's not stable.
  // Actually, defining CodeBlock inside component makes it unstable too.
  // Only way to make it stable is to memoize CodeBlock too or move it outside.
  // Moving CodeBlock outside is hard because it uses `isDark`.
  // So we memoize `markdownComponents` dependent on `isDark`.
  // BUT `CodeBlock` function itself changes on every render because it's defined in the function body!
  // So `markdownComponents` will also change if we include `CodeBlock` in it.
  // NO, `CodeBlock` variable is new every render.
  // We must memoize CodeBlock too or move it out.
  // `isDark` is the only external dependency.

  // Actually, we can just pass CodeBlock into useMemo dependency array.
  // But CodeBlock is re-created every render.
  // We need to use useCallback for CodeBlock? No, it's a component.
  // We should useMemo for CodeBlock definition or move it out and pass isDark as prop?
  // ReactMarkdown passes props to components. We can't easily pass extra props like isDark.
  // We can use a context or just keep it simple:
  // Let's rely on useMemo for markdownComponents, but we need CodeBlock to be stable-ish.
  // If we mistakenly make CodeBlock unstable, markdownComponents useMemo won't help if we put CodeBlock in dep array.
  // Actually, if we define markdownComponents with `code: CodeBlock` and `CodeBlock` is new every time,
  // we effectively need to define `markdownComponents` every time IF we use `CodeBlock` directly.

  // BETTER PLAN: Define `markdownComponents` with `useMemo` and inside that `useMemo`, define `CodeBlock`?
  // No, `CodeBlock` is a component, it should be defined at top level or memoized.

  // Let's use `useMemo` for `markdownComponents`, and inside `useMemo`, we use a wraper or just the function.
  // Wait, if `CodeBlock` is defined inside `MessageBubble`, it captures `isDark`.
  // If we move `CodeBlock` definition inside `useMemo`, it will be stable as long as dependencies don't change.

  return (
    <div
      id={messageId}
      ref={el => {
        containerRef.current = el
        if (typeof bubbleRef === 'function') bubbleRef(el)
      }}
      className="w-full max-w-3xl mb-12 flex flex-col gap-6 relative px-5 sm:px-0"
      onMouseUp={handleMouseUp}
      onTouchEnd={handleTouchEnd}
      onContextMenu={handleContextMenu}
    >
      {/* Selection Menu */}
      {selectionMenu && (
        <div
          className={clsx(
            'fixed selection-menu shadow-lg flex items-center z-50 transform -translate-x-1/2',
            isMobile
              ? 'bg-gray-900/98 text-white dark:bg-zinc-800/98 rounded-full py-1.5 px-3 backdrop-blur-md border border-gray-700/50'
              : 'bg-gray-900 text-white dark:bg-zinc-700 rounded-lg p-1 -translate-y-full',
          )}
          style={{
            left: selectionMenu.x,
            top: selectionMenu.y,
            // Ensure menu appears above everything on mobile
            zIndex: isMobile ? 9999 : 50,
          }}
        >
          <button
            className={clsx(
              'flex items-center gap-1.5 rounded-full transition-all text-xs font-medium',
              isMobile
                ? 'px-3 py-1.5 active:bg-gray-700 hover:bg-gray-800'
                : 'px-2 py-1.5 hover:bg-gray-700 dark:hover:bg-zinc-600 whitespace-nowrap',
            )}
            onClick={e => {
              e.stopPropagation()
              onQuote && onQuote({ text: selectionMenu.text, message })
              setSelectionMenu(null)
              window.getSelection().removeAllRanges()
            }}
          >
            <Quote size={isMobile ? 13 : 12} />
            Quote
          </button>
          <div
            className={clsx(
              'mx-0.5',
              isMobile ? 'w-px h-4 bg-gray-600' : 'w-px h-3 bg-gray-700 dark:bg-zinc-600',
            )}
          />
          <button
            className={clsx(
              'flex items-center gap-1.5 rounded-full transition-all text-xs font-medium',
              isMobile
                ? 'px-3 py-1.5 active:bg-gray-700 hover:bg-gray-800'
                : 'px-2 py-1.5 hover:bg-gray-700 dark:hover:bg-zinc-600 whitespace-nowrap',
            )}
            onClick={e => {
              e.stopPropagation()
              copyToClipboard(selectionMenu.text)
              setSelectionMenu(null)
              window.getSelection().removeAllRanges()
            }}
          >
            <Copy size={isMobile ? 13 : 12} />
            Copy
          </button>
        </div>
      )}
      {/* Provider/Model Header */}
      <div className="flex items-center gap-3 text-gray-900 dark:text-gray-100">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 shadow-inner flex items-center justify-center overflow-hidden">
          {providerMeta.logo ? (
            <img src={providerMeta.logo} alt={providerMeta.label} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {providerMeta.fallback?.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{providerMeta.label}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Model: {resolvedModel}</span>
        </div>
      </div>

      {/* Thinking Process Section */}
      {shouldShowThought && (
        <div className="border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
            className="w-full flex items-center justify-between p-3 bg-user-bubble dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Brain size={16} className="text-primary-500 dark:text-primary-400" />
              <span>Thinking Process</span>
            </div>
            {isThoughtExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {isThoughtExpanded && hasThoughtText && (
            <div className="p-4 bg-user-bubble/50 font-mono! dark:bg-zinc-800/30 border-t border-gray-200 dark:border-zinc-700 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {thoughtContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Sources Section */}
      {message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap gap-2 items-stretch">
          {(showAllSources ? message.sources : message.sources.slice(0, 4)).map((source, index) => (
            <div
              key={index}
              className="bg-user-bubble dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-2.5 cursor-pointer transition-colors flex flex-col justify-between w-36 "
              onClick={() => window.open(source.url, '_blank')}
            >
              {' '}
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center text-[9px] text-gray-600 dark:text-gray-300 shrink-0">
                  {index + 1}
                </div>{' '}
                <div className="text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-tight font-medium">
                  {source.title}
                </div>
              </div>
            </div>
          ))}
          {!showAllSources && message.sources.length > 4 && (
            <div
              onClick={() => setShowAllSources(true)}
              className="bg-user-bubble dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-2.5 cursor-pointer transition-colors flex items-center justify-center w-24"
            >
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium text-center">
                View {message.sources.length - 4} more
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div
        ref={mainContentRef}
        className="message-content prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed font-serif [&_p]:overflow-x-auto [&_p]:max-w-full [&_p]:whitespace-pre-wrap [&_blockquote]:overflow-x-auto [&_blockquote]:max-w-full [&_table]:inline-table [&_table]:w-auto [&_table]:table-auto [&_pre]:overflow-x-auto [&_pre]:max-w-full"
        // Prevent native selection menu on mobile
        style={{
          WebkitTouchCallout: isMobile ? 'none' : 'default',
          WebkitUserSelect: isMobile ? 'text' : 'auto',
          KhtmlUserSelect: isMobile ? 'text' : 'auto',
          MozUserSelect: isMobile ? 'text' : 'auto',
          MsUserSelect: isMobile ? 'text' : 'auto',
          userSelect: isMobile ? 'text' : 'auto',
        }}
      >
        {!message.content && !thoughtContent ? (
          <div className="flex flex-col gap-2 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
          </div>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {contentWithCitations}
          </ReactMarkdown>
        )}
      </div>

      {/* Related Questions */}
      {message.related && message.related.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-3 text-gray-900 dark:text-gray-100">
            <Layers size={24} className="text-primary-500" />
            <h3 className="text-lg font-medium">Related</h3>
          </div>
          <div className="flex flex-col gap-1 md:gap-2">
            {message.related.map((question, index) => (
              <div
                key={index}
                onClick={() => onRelatedClick && onRelatedClick(question)}
                className="flex items-center justify-between p-2 md:p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group"
              >
                <span className="text-gray-700 dark:text-gray-300 font-medium text-sm md:text-base">
                  {question}
                </span>
                <div className="ml-2 sm:ml-0opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-400 dark:text-gray-500">
                  <CornerRightDown />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-4 mt-2 border-t border-gray-200 dark:border-zinc-800 pt-4">
        <button className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <Share2 size={16} />
          <span className="hidden sm:block">Share</span>
        </button>
        <button
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          onClick={() => onRegenerateAnswer && onRegenerateAnswer()}
        >
          <RefreshCw size={16} />
          <span className="hidden sm:block">Regenerate</span>
        </button>
        <button
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          onClick={() => {
            // Copy only the rendered markdown text (no extra metadata/sections)
            const renderedText = mainContentRef.current?.innerText?.trim() || ''
            const fallbackText = mainContent || ''
            copyToClipboard(renderedText || fallbackText)
            setIsCopied(true)
          }}
        >
          {isCopied ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-green-600 dark:text-green-400"
              >
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              <span className="text-green-600 dark:text-green-400 hidden sm:block">Copied</span>
            </>
          ) : (
            <>
              <Copy size={16} />
              <span className="hidden sm:block">Copy</span>
            </>
          )}
        </button>
        {/* <div className="flex-1" />
        <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <ThumbsUp size={16} />
        </button>
        <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <ThumbsDown size={16} />
        </button>
        <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <MoreHorizontal size={16} />
        </button> */}
      </div>
    </div>
  )
}

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
)

export default MessageBubble
