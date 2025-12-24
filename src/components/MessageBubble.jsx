import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

import {
  Copy,
  Share2,
  ChevronRight,
  ChevronDown,
  CornerRightDown,
  Pencil,
  Check,
  RefreshCw,
  Globe,
  Quote,
  X,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import clsx from 'clsx'
import { getProvider } from '../lib/providers'
import { parseChildrenWithEmojis } from '../lib/emojiParser'
import EmojiDisplay from './EmojiDisplay'
import { PROVIDER_ICONS, getModelIcon } from '../lib/modelIcons'
import DotLoader from './DotLoader'
import MobileSourcesDrawer from './MobileSourcesDrawer'
import DesktopSourcesSection from './DesktopSourcesSection'
import useIsMobile from '../hooks/useIsMobile'
import ShareModal from './ShareModal'

const PROVIDER_META = {
  gemini: {
    label: 'Google Gemini',
    logo: PROVIDER_ICONS.gemini,
    fallback: 'G',
  },
  openai_compatibility: {
    label: 'OpenAI Compatible',
    logo: PROVIDER_ICONS.openai_compatibility,
    fallback: 'O',
  },
  siliconflow: {
    label: 'SiliconFlow',
    logo: PROVIDER_ICONS.siliconflow,
    fallback: 'S',
  },
  glm: {
    label: 'GLM',
    logo: PROVIDER_ICONS.glm,
    fallback: 'G',
  },
  kimi: {
    label: 'Kimi',
    logo: PROVIDER_ICONS.kimi,
    fallback: 'K',
  },
}

const THINKING_STATUS_MESSAGES = ['Thinking', 'Analyzing', 'Working through it', 'Checking details']

const getHostname = url => {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch (e) {
    return 'Source'
  }
}

/**
 * Converts citations [1][2][3] to clickable number links [1][2][3].
 * Each number becomes a separate clickable link while keeping the simple number format.
 */
const formatContentWithSources = (content, sources = []) => {
  if (typeof content !== 'string' || !Array.isArray(sources) || sources.length === 0) {
    return content
  }

  // Regex to match one or more citations: [1] or [1][2] or [1] [2] or [1]  [2]
  // We eagerly match sequences of [n] potentially separated by whitespace
  const citationRegex = /\[(\d+)\](?:\s*\[(\d+)\])*/g

  return content.replace(citationRegex, match => {
    // Extract all numbers from the match
    const indices = match.match(/\d+/g).map(n => Number(n) - 1)

    if (indices.length === 0) return match

    const primaryIdx = indices[0]
    const primarySource = sources[primaryIdx]

    if (!primarySource) return match

    // Group consecutive citations: [1][2][3] -> [+3]
    if (indices.length > 1) {
      return ` [+${indices.length}](citation:${indices.join(',')}) `
    }

    // Single citation: [1] -> [1]
    return ` [${primaryIdx + 1}](citation:${primaryIdx}) `
  })
}

const applyGroundingSupports = (content, groundingSupports = [], sources = []) => {
  if (
    typeof content !== 'string' ||
    !Array.isArray(groundingSupports) ||
    groundingSupports.length === 0 ||
    !Array.isArray(sources) ||
    sources.length === 0
  ) {
    return content
  }
  if (/\[\d+\]/.test(content)) return content

  const markersByText = new Map()
  for (const support of groundingSupports) {
    const segmentText = support?.segment?.text
    if (!segmentText || typeof segmentText !== 'string') continue
    const chunkIndices = Array.isArray(support?.groundingChunkIndices)
      ? support.groundingChunkIndices
      : []
    const sourceIndices = chunkIndices
      .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < sources.length)
      .map(idx => idx)
    if (sourceIndices.length === 0) continue
    const set = markersByText.get(segmentText) || new Set()
    for (const idx of sourceIndices) set.add(idx)
    markersByText.set(segmentText, set)
  }

  if (markersByText.size === 0) return content

  let updated = content
  const supports = Array.from(markersByText.entries())
    .map(([text, indices]) => ({
      text,
      indices: Array.from(indices).sort((a, b) => a - b),
    }))
    .sort((a, b) => b.text.length - a.text.length)

  for (const support of supports) {
    const marker = ` ${support.indices.map(idx => `[${idx + 1}]`).join('')}`
    let searchFrom = 0
    while (true) {
      const matchIndex = updated.indexOf(support.text, searchFrom)
      if (matchIndex === -1) break
      const insertAt = matchIndex + support.text.length
      updated = updated.slice(0, insertAt) + marker + updated.slice(insertAt)
      searchFrom = insertAt + marker.length
    }
  }

  return updated
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
  const { messages, isLoading, conversationTitle } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
      isLoading: state.isLoading,
      conversationTitle: state.conversationTitle,
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
  const [activeImageUrl, setActiveImageUrl] = useState(null)

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

  useEffect(() => {
    if (!activeImageUrl) return

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setActiveImageUrl(null)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeImageUrl])

  // Selection Menu State
  const [selectionMenu, setSelectionMenu] = useState(null)

  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  // Detect mobile view
  const isMobile = useIsMobile()

  // Calculate optimal menu position to avoid viewport edges and selection
  const calculateMenuPosition = selectionRect => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const menuWidth = isMobile ? 160 : 150 // Slightly wider for text on mobile
    const menuHeight = isMobile ? 38 : 40
    const menuTopOffset = isMobile ? 8 : 10 // Distance above selection
    const edgePadding = 10 // Padding from viewport edges

    // Center the menu horizontally on the selection
    let x = selectionRect.left + selectionRect.width / 2

    // For desktop: Position above the selection
    // Since CSS has -translate-y-full (moves menu up by its own height),
    // we only need to position the bottom edge at the selection top
    let y = selectionRect.top - menuTopOffset

    // For mobile, always place below selection to avoid covering selected text
    if (isMobile) {
      y = selectionRect.bottom + menuTopOffset
    }

    // Ensure menu stays within viewport bounds horizontally
    // Account for the -translate-x-1/2 transform (centers the menu at x position)
    const menuLeft = x - menuWidth / 2
    const menuRight = x + menuWidth / 2

    // If menu would go off left edge, adjust x to align left edge with padding
    if (menuLeft < edgePadding) {
      x = edgePadding + menuWidth / 2
    }
    // If menu would go off right edge, adjust x to align right edge with padding
    else if (menuRight > viewportWidth - edgePadding) {
      x = viewportWidth - edgePadding - menuWidth / 2
    }

    // For desktop: Ensure menu stays within viewport bounds vertically
    if (!isMobile) {
      // Since CSS has -translate-y-full, the actual top position after transform is y - menuHeight
      const actualMenuTop = y - menuHeight
      const actualMenuBottom = y

      // If menu would go off top edge, place below selection instead
      if (actualMenuTop < edgePadding) {
        y = selectionRect.bottom + menuTopOffset
      }
      // If menu would go off bottom edge when placed below, place above instead
      else if (actualMenuBottom > viewportHeight - edgePadding) {
        y = selectionRect.top - menuTopOffset
      }
    }
    // For mobile: Ensure menu stays within viewport bounds vertically
    else {
      // Mobile menu is placed below selection, check if it goes off bottom
      const menuBottom = y + menuHeight
      if (menuBottom > viewportHeight - edgePadding) {
        // Place above selection instead
        y = selectionRect.top - menuTopOffset - menuHeight
      }
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

  const [isThoughtExpanded, setIsThoughtExpanded] = useState(false)
  const [thinkingStatusIndex, setThinkingStatusIndex] = useState(0)

  // Sources UI State
  const [isSourcesOpen, setIsSourcesOpen] = useState(false) // Desktop
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false) // Mobile
  const [mobileDrawerSources, setMobileDrawerSources] = useState([]) // Sources to show in mobile drawer (all or specific)
  const [mobileDrawerTitle, setMobileDrawerTitle] = useState('Sources')

  const handleMobileSourceClick = useCallback(
    (selectedSources, title = 'Sources') => {
      setMobileDrawerSources(selectedSources || message.sources)
      setMobileDrawerTitle(title)
      setIsMobileDrawerOpen(true)
    },
    [message.sources],
  )

  const isUser = message.role === 'user'
  const isStreaming =
    message?.isStreaming ??
    (isLoading && message.role === 'ai' && messageIndex === messages.length - 1)
  const hasMainText = (() => {
    const content = message?.content
    if (typeof content === 'string') return content.trim().length > 0
    if (Array.isArray(content)) {
      return content.some(part => {
        if (typeof part === 'string') return part.trim().length > 0
        if (part?.type === 'text' && typeof part.text === 'string')
          return part.text.trim().length > 0
        if (part?.text != null) return String(part.text).trim().length > 0
        return false
      })
    }
    if (content && typeof content === 'object' && Array.isArray(content.parts)) {
      return content.parts.some(part =>
        typeof part === 'string'
          ? part.trim().length > 0
          : String(part?.text || '').trim().length > 0,
      )
    }
    return false
  })()
  const shouldShowThinkingStatus =
    message.role === 'ai' && message.thinkingEnabled !== false && isStreaming && !hasMainText
  const thinkingStatusText =
    THINKING_STATUS_MESSAGES[thinkingStatusIndex] || THINKING_STATUS_MESSAGES[0]
  const renderPlainCodeBlock = useCallback(
    (codeText, language) => (
      <div className="relative group my-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-x-auto bg-user-bubble/50 dark:bg-zinc-800/30">
        <div className="flex items-center font-mono! justify-between px-3 py-2 text-[11px] font-semibold bg-user-bubble/50 dark:bg-zinc-800/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
          <span>{String(language || 'CODE').toUpperCase()}</span>
          <button className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            Copy
          </button>
        </div>
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={language || 'text'}
          PreTag="div"
          className="code-scrollbar text-sm sm:text-base"
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
          }}
          codeTagProps={{
            style: {
              backgroundColor: 'transparent',
              fontFamily:
                'JetBrainsMono, CascadiaCode, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            },
          }}
        >
          {codeText}
        </SyntaxHighlighter>
      </div>
    ),
    [isDark],
  )

  const MermaidErrorFallback = useCallback(
    ({ chart }) => renderPlainCodeBlock(chart || '', 'mermaid'),
    [renderPlainCodeBlock],
  )

  const mermaidOptions = useMemo(
    () => ({
      config: { theme: isDark ? 'dark' : 'default' },
      errorComponent: MermaidErrorFallback,
    }),
    [isDark, MermaidErrorFallback],
  )

  useEffect(() => {
    if (!shouldShowThinkingStatus) return undefined
    setThinkingStatusIndex(0)
    const intervalId = setInterval(() => {
      setThinkingStatusIndex(prev => (prev + 1) % THINKING_STATUS_MESSAGES.length)
    }, 1800)
    return () => clearInterval(intervalId)
  }, [shouldShowThinkingStatus])

  const CodeBlock = ({ inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1].toLowerCase() : ''
    const langLabel = match ? match[1].toUpperCase() : 'CODE'
    const codeText = String(children).replace(/\n$/, '')

    if (!inline && language === 'mermaid') {
      return (
        <div className="my-4">
          <Streamdown mode="static" mermaid={mermaidOptions} controls={{ mermaid: true }}>
            {`\`\`\`mermaid\n${codeText}\n\`\`\``}
          </Streamdown>
        </div>
      )
    }

    if (!inline && match) {
      return (
        <div className="relative group my-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-x-auto bg-user-bubble/50 dark:bg-zinc-800/30">
          <div className="flex items-center font-mono! justify-between px-3 py-2 text-[11px] font-semibold bg-user-bubble/50 dark:bg-zinc-800/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
            <span>{langLabel}</span>
            <button className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Copy
            </button>
          </div>
          <SyntaxHighlighter
            style={isDark ? oneDark : oneLight}
            language={match[1]}
            PreTag="div"
            className="code-scrollbar text-sm sm:text-base"
            customStyle={{
              margin: 0,
              padding: '1rem',
              background: 'transparent',
              borderRadius: 'inherit',
            }}
            codeTagProps={{
              style: {
                backgroundColor: 'transparent',
                fontFamily:
                  'JetBrainsMono, CascadiaCode, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              },
            }}
            {...props}
          >
            {codeText}
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
      p: ({ node, children, ...props }) => (
        <p className="mb-4 last:mb-0" {...props}>
          {parseChildrenWithEmojis(children)}
        </p>
      ),
      h1: ({ node, children, ...props }) => (
        <h1 className="text-2xl font-bold mb-4 mt-6" {...props}>
          {parseChildrenWithEmojis(children)}
        </h1>
      ),
      h2: ({ node, children, ...props }) => (
        <h2 className="text-xl font-bold mb-3 mt-5" {...props}>
          {parseChildrenWithEmojis(children)}
        </h2>
      ),
      h3: ({ node, children, ...props }) => (
        <h3 className="text-lg font-bold mb-2 mt-4" {...props}>
          {parseChildrenWithEmojis(children)}
        </h3>
      ),
      ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
      ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
      li: ({ node, children, ...props }) => (
        <li className="mb-1" {...props}>
          {parseChildrenWithEmojis(children)}
        </li>
      ),
      blockquote: ({ node, children, ...props }) => (
        <blockquote
          className="border-l-4 border-gray-300 dark:border-zinc-600 pl-4 italic my-4 text-gray-600 dark:text-gray-400"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </blockquote>
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
      th: ({ node, children, ...props }) => (
        <th
          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </th>
      ),
      td: ({ node, children, ...props }) => (
        <td
          className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </td>
      ),
      code: CodeBlock,
      a: ({ href, children, ...props }) => {
        if (href?.startsWith('citation:')) {
          const indices = href
            .replace('citation:', '')
            .split(',')
            .map(Number)
            .filter(n => !isNaN(n))
          return (
            <CitationChip
              indices={indices}
              sources={message.sources}
              isMobile={isMobile}
              onMobileClick={sources => handleMobileSourceClick(sources, 'Citation Sources')}
              label={children} // Children of the link is the label [Title + N]
            />
          )
        }
        return (
          <a
            href={href}
            {...props}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] hover:bg-primary-300/50 rounded-lg dark:hover:bg-primary-700/50 dark:bg-primary-900/50 bg-primary-200/50 mx-0.5 py-0.5 px-1 text-primary-700 dark:text-primary-300"
          >
            {parseChildrenWithEmojis(children)}
          </a>
        )
      },
      hr: () => (
        <div className="relative my-6">
          <div className="h-px bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-zinc-700" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-zinc-700 shadow-sm ring-2 ring-white dark:ring-zinc-900" />
          </div>
        </div>
      ),
    }),
    [isDark, message.sources, isMobile, handleMobileSourceClick], // Dependencies for markdownComponents
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
        className="flex justify-end items-center w-full mt-8 group px-3 sm:px-0"
        onMouseUp={handleMouseUp}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        {activeImageUrl &&
          createPortal(
            <div
              className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setActiveImageUrl(null)}
            >
              <button
                onClick={() => setActiveImageUrl(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/70 text-white hover:bg-black/80 transition-colors"
                aria-label="Close image preview"
              >
                <X size={18} />
              </button>
              <img
                src={activeImageUrl}
                alt="User uploaded preview"
                className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl"
                onClick={event => event.stopPropagation()}
              />
            </div>,
            document.body,
          )}
        <div className="flex flex-col items-end gap-2 max-w-[90%] md:max-w-[75%]">
          {/* Message Content */}
          <div
            className={clsx(
              'relative px-5 py-3.5 rounded-3xl text-base',
              'bg-primary-500 dark:bg-primary-900 text-white dark:text-gray-100',
            )}
          >
            {quoteToRender && (
              <div className="mb-2 p-3 bg-white/20 dark:bg-black/20 rounded-3xl text-sm">
                <div className="font-medium  mb-1">Quoting:</div>
                <div className="line-clamp-2 italic ">{quoteToRender.text}</div>
              </div>
            )}
            {imagesToRender.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {imagesToRender.map((img, idx) => (
                  <img
                    key={idx}
                    src={img?.url || img?.image_url?.url}
                    alt="User uploaded"
                    className="max-w-full h-auto rounded-lg max-h-60 object-cover cursor-zoom-in"
                    onClick={event => {
                      event.stopPropagation()
                      setActiveImageUrl(img?.url || img?.image_url?.url)
                    }}
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
  const providerMeta = PROVIDER_META[providerId] || {
    label: providerId || 'AI',
    logo: null,
    fallback: 'AI',
  }
  const resolvedModel = message.model || defaultModel || 'default model'

  // Parse content using provider-specific logic
  const provider = getProvider(providerId)
  const parsed = provider.parseMessage(message)
  const thoughtContent = message.thinkingEnabled === false ? null : parsed.thought
  const mainContent = parsed.content
  const contentWithSupports = applyGroundingSupports(
    mainContent,
    message.groundingSupports,
    message.sources,
  )
  const contentWithCitations = formatContentWithSources(contentWithSupports, message.sources)
  const hasThoughtText = !!(thoughtContent && String(thoughtContent).trim())
  const shouldShowThought = message.thinkingEnabled !== false && (isStreaming || hasThoughtText)
  const hasRelatedQuestions = Array.isArray(message.related) && message.related.length > 0
  const isRelatedLoading = !!message.relatedLoading

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
      {/* Selection Menu - Rendered via portal to avoid transform issues */}
      {selectionMenu &&
        createPortal(
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
          </div>,
          document.body,
        )}
      {/* Provider/Model Header */}
      <div className="flex items-center gap-3 text-gray-900 dark:text-gray-100">
        <div className="w-10 h-10 rounded-full bg-gray-100  shadow-inner flex items-center justify-center overflow-hidden p-2">
          {providerMeta.logo ? (
            <img
              src={providerMeta.logo}
              alt={providerMeta.label}
              width={40}
              height={40}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {providerMeta.fallback?.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{providerMeta.label}</span>
          <div className="flex items-center gap-1.5">
            {getModelIcon(resolvedModel) && (
              <img
                src={getModelIcon(resolvedModel)}
                alt=""
                width={14}
                height={14}
                className="w-3.5 h-3.5 object-contain"
                loading="lazy"
              />
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">{resolvedModel}</span>
          </div>
        </div>
      </div>

      {/* Thinking Process Section */}
      {shouldShowThought && (
        <div className="border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
            className="w-full flex items-center justify-between p-2 bg-user-bubble dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
              <EmojiDisplay emoji="🧠" size="1.2em" />
              {!shouldShowThinkingStatus && <span className="text-sm">Thinking Process</span>}
              {!shouldShowThinkingStatus && <Check size="1em" />}
              {shouldShowThinkingStatus && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="text-left mr-4">{thinkingStatusText}</span>
                  <DotLoader />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isThoughtExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
          </button>

          {isThoughtExpanded && hasThoughtText && (
            <div className="p-4 bg-user-bubble/30 font-stretch-semi-condensed dark:bg-zinc-800/30 border-t border-gray-200 dark:border-zinc-700 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              <Streamdown
                mermaid={mermaidOptions}
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {thoughtContent}
              </Streamdown>
            </div>
          )}
        </div>
      )}

      {/* Sources Section - REMOVED (Moved to toolbar) */}

      {/* Main Content */}
      <div
        ref={mainContentRef}
        className="message-content prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed font-sans [&_p]:overflow-x-auto [&_p]:max-w-full [&_p]:whitespace-pre-wrap [&_blockquote]:overflow-x-auto [&_blockquote]:max-w-full [&_table]:inline-table [&_table]:w-auto [&_table]:table-auto [&_pre]:overflow-x-auto [&_pre]:max-w-full"
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
        {!message.content ? (
          <div className="flex flex-col gap-2 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
          </div>
        ) : (
          <Streamdown
            mermaid={mermaidOptions}
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {contentWithCitations}
          </Streamdown>
        )}
      </div>

      {/* Related Questions */}
      {(hasRelatedQuestions || isRelatedLoading) && (
        <div className="border-t border-gray-200 dark:border-zinc-800 pt-4">
          <div className="flex items-center gap-3 mb-3 text-gray-900 dark:text-gray-100">
            <EmojiDisplay emoji="🔮" size="1.2em" className="mb-1" />
            <span className="text-sm font-semibold">Related Questions</span>
          </div>
          <div className="flex flex-col gap-1 md:gap-2 ">
            {hasRelatedQuestions &&
              message.related.map((question, index) => (
                <div
                  key={index}
                  onClick={() => onRelatedClick && onRelatedClick(question)}
                  className="flex items-center rounded-2xl border sm:hover:scale-102 border-gray-200 dark:border-zinc-800 bg-user-bubble dark:bg-zinc-800/50 justify-between p-2  hover:bg-user-bubble dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group"
                >
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-sm md:text-balance">
                    {question}
                  </span>
                  <div className="ml-2 sm:ml-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-primary-500 dark:text-primary-500">
                    <CornerRightDown />
                  </div>
                </div>
              ))}
            {isRelatedLoading && (
              <div className="flex items-center p-2 text-gray-500 dark:text-gray-400">
                <DotLoader />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-4  border-t border-gray-200 dark:border-zinc-800 pt-4">
        <button
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          onClick={() => setIsShareModalOpen(true)}
        >
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
        {/* Sources Toggle */}
        {message.sources && message.sources.length > 0 && (
          <button
            onClick={() => {
              if (isMobile) {
                handleMobileSourceClick(message.sources, 'All Sources')
              } else {
                setIsSourcesOpen(!isSourcesOpen)
              }
            }}
            className={clsx(
              'flex items-center gap-2 text-sm transition-colors',
              isSourcesOpen
                ? 'text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-lg'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
          >
            <Globe size={16} />
            <span className="hidden sm:block">Sources</span>
            <span
              className={clsx(
                'flex items-center justify-center rounded-full text-[10px] w-5 h-5 transition-colors',
                isSourcesOpen
                  ? 'bg-primary-200 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                  : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300',
              )}
            >
              {message.sources.length}
            </span>
          </button>
        )}
      </div>

      {/* Desktop Sources Section (Collapsible) */}
      {!isMobile && message.sources && message.sources.length > 0 && (
        <DesktopSourcesSection sources={message.sources} isOpen={isSourcesOpen} />
      )}

      {/* Mobile Sources Drawer */}
      <MobileSourcesDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        sources={mobileDrawerSources}
        title="Citation Sources"
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        message={message}
        conversationTitle={conversationTitle}
      />

    </div>
  )
}

const CitationChip = ({ indices, sources, isMobile, onMobileClick, label }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const containerRef = useRef(null)
  const timeoutRef = useRef(null)

  // Memoize the filtered sources for the drawer
  const drawerSources = useMemo(() => {
    return indices
      .map(idx => sources[idx])
      .filter(Boolean)
      .map((source, i) => ({ ...source, originalIndex: indices[i] })) // Keep track if needed, though drawer re-indexes
  }, [indices, sources])

  const updatePosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const dropdownWidth = 256
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const padding = 12
      const inputEl = isMobile ? document.getElementById('chat-input-textarea') : null
      const inputRect = inputEl?.getBoundingClientRect()
      const inputSafeSpace = inputRect ? Math.max(0, viewportHeight - inputRect.top + 8) : 0
      // Keep dropdown clear of the input area and safe area on mobile.
      const bottomSafeSpace = isMobile ? Math.max(140, inputSafeSpace) : padding

      // Horizontal Clamping
      let left = rect.left + rect.width / 2
      const minCenter = dropdownWidth / 2 + padding
      const maxCenter = viewportWidth - dropdownWidth / 2 - padding
      left = Math.max(minCenter, Math.min(left, maxCenter))

      // Vertical Flipping
      // Available space below the chip, EXCLUDING the bottom safe area/input bar
      const spaceBelow = viewportHeight - rect.bottom - bottomSafeSpace
      const spaceAbove = rect.top

      // If we don't have enough space below for a full dropdown (approx 240px), flip up
      // Default to flipping up on mobile if space allows, as it's cleaner above the finger/input
      // But only if there is actually reasonable space above (e.g. >200px)
      const preferUp = isMobile

      let showAbove = false
      if (preferUp && spaceAbove > 200) {
        showAbove = true
      } else if (spaceBelow < 250 && spaceAbove > spaceBelow) {
        showAbove = true
      }

      const top = showAbove ? rect.top - 8 : rect.bottom + 8

      const maxHeight = showAbove
        ? Math.min(240, spaceAbove - padding - 8)
        : Math.min(240, spaceBelow + (isMobile ? 0 : 0))

      setPosition({ top, left, showAbove, maxHeight })
    }
  }, [isMobile])

  const handleMouseEnter = () => {
    // Double check mobile state to prevent hover on touch devices showing the desktop popover
    if (isMobile || window.innerWidth < 768) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    updatePosition()
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    if (isMobile) return
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 200)
  }

  const handleClick = e => {
    e.preventDefault()
    e.stopPropagation()
    // Robust check: prop OR direct width check
    if (isMobile || window.innerWidth < 768) {
      if (onMobileClick) {
        onMobileClick(drawerSources)
      }
    }
  }

  // Update position on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, updatePosition])

  // Close on outside click/interaction
  useEffect(() => {
    if (!isOpen) return
    const handleOutside = e => {
      // If clicking inside the dropdown (portal) or the chip, do nothing
      if (
        e.target.closest('.citation-dropdown') ||
        (containerRef.current && containerRef.current.contains(e.target))
      ) {
        return
      }
      setIsOpen(false)
    }

    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('mousedown', handleOutside)
    return () => {
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [isOpen])

  return (
    <>
      <span
        ref={containerRef}
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span
          onClick={handleClick}
          className="text-[12px] bg-primary-200/50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 hover:bg-primary-300/50 dark:hover:bg-primary-700/50 rounded-lg mx-0.5 py-0.5 px-1 cursor-pointer transition-colors"
        >
          {parseChildrenWithEmojis(label)}
        </span>
      </span>

      {isOpen &&
        !isMobile &&
        createPortal(
          <div
            className="citation-dropdown fixed z-[9999] w-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl flex flex-col p-1"
            style={{
              top: position.showAbove ? 'auto' : position.top,
              bottom: position.showAbove ? window.innerHeight - position.top : 'auto',
              left: position.left,
              transform: 'translateX(-50%)',
              maxHeight: position.maxHeight,
            }}
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          >
            {indices.map(idx => {
              const source = sources[idx]
              if (!source) return null
              return (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <span className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded text-[9px] font-medium bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 flex items-center justify-center border border-gray-200 dark:border-zinc-700">
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1">
                      {source.title}
                    </span>
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {getHostname(source.url)}
                    </span>
                  </span>
                </a>
              )
            })}
          </div>,
          document.body,
        )}

      {/* Mobile Drawer */}
      <MobileSourcesDrawer
        isOpen={isOpen && isMobile}
        onClose={() => setIsOpen(false)}
        sources={drawerSources}
        title="Citation Sources"
      />
    </>
  )
}

export default MessageBubble
