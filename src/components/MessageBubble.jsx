import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

import clsx from 'clsx'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Quote,
  RefreshCw,
  Trash2,
  X,
  Search,
  GraduationCap,
  Calculator,
  Clock,
  FileText,
  ScanText,
  Wrench,
  FormInput,
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { Streamdown } from 'streamdown'
import { useAppContext } from '../App'
import useIsMobile from '../hooks/useIsMobile'
import { parseChildrenWithEmojis } from '../lib/emojiParser'
import { getModelIcon, getModelIconClassName, renderProviderIcon } from '../lib/modelIcons'
import { getProvider } from '../lib/providers'
import { TOOL_TRANSLATION_KEYS, TOOL_ICONS } from '../lib/toolConstants'
import DesktopSourcesSection from './DesktopSourcesSection'
import DotLoader from './DotLoader'
import EmojiDisplay from './EmojiDisplay'
import InteractiveForm from './InteractiveForm'
import DeepResearchGoalCard from './message/DeepResearchGoalCard'
import MessageActionBar from './message/MessageActionBar'
import {
  applyGroundingSupports,
  formatContentWithSources,
  getHostname,
} from './message/messageUtils'
import RelatedQuestions from './message/RelatedQuestions'
import { useMessageExport } from './message/useMessageExport'
import MobileSourcesDrawer from './MobileSourcesDrawer'
import ShareModal from './ShareModal'

const PROVIDER_META = {
  gemini: {
    label: 'Google Gemini',
    id: 'gemini',
    fallback: 'G',
  },
  openai_compatibility: {
    label: 'OpenAI Compatible',
    id: 'openai_compatibility',
    fallback: 'O',
  },
  siliconflow: {
    label: 'SiliconFlow',
    id: 'siliconflow',
    fallback: 'S',
  },
  glm: {
    label: 'GLM',
    id: 'glm',
    fallback: 'G',
  },
  modelscope: {
    label: '魔塔社区',
    id: 'modelscope',
    fallback: 'M',
  },
  kimi: {
    label: 'Kimi',
    id: 'kimi',
    fallback: 'K',
  },
  nvidia: {
    label: 'NVIDIA NIM',
    id: 'nvidia',
    fallback: 'N',
  },
}

/**
 * MessageBubble component that directly accesses messages from chatStore via index
 * Reduces props drilling and improves component independence
 */
import useSettings from '../hooks/useSettings'

const MessageBubble = ({
  messageIndex,
  apiProvider,
  defaultModel,
  onRelatedClick,
  messageId,
  bubbleRef,
  onEdit,
  onResend,
  onDelete,
  onRegenerateAnswer,
  onQuote,
  onFormSubmit,
}) => {
  // Get message directly from chatStore using shallow selector
  const { messages, isLoading, conversationTitle } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
      isLoading: state.isLoading,
      conversationTitle: state.conversationTitle,
    })),
  )

  const { developerMode } = useSettings()

  // Extract message by index
  const message = messages[messageIndex]

  // Merge content if this is a form message followed by continuation(s)
  const mergedMessage = useMemo(() => {
    if (!message || message.role !== 'ai') return message

    const messageContent = String(message.content || '')
    const initialToolCallHistory = message.toolCallHistory || []
    const hasForm = initialToolCallHistory.some(tc => tc.name === 'interactive_form')

    if (!hasForm) return message

    // Recursively merge all form submission chains
    let currentIndex = messageIndex
    let mergedContent = messageContent
    // Clone the toolCallHistory to avoid mutating the original message object!
    // We map to new objects so we can add properties like _isSubmitted
    let toolCallHistory = (message.toolCallHistory || []).map(tc => ({ ...tc }))
    let sources = [...(message.sources || [])]
    let related = [...(message.related || [])]
    let relatedLoading = message.relatedLoading || false
    let allSubmittedValues = {}
    let hasAnySubmission = false

    // Keep scanning forward for [Form Submission] → AI pairs
    while (true) {
      const nextUserMsg = messages[currentIndex + 1]
      const nextAiMsg = messages[currentIndex + 2]

      // Check if we have a submission
      if (
        nextUserMsg &&
        nextUserMsg.role === 'user' &&
        typeof nextUserMsg.content === 'string' &&
        nextUserMsg.content.startsWith('[Form Submission]')
      ) {
        hasAnySubmission = true

        // Mark all current interactive_form tools as submitted BY THIS user message
        toolCallHistory.forEach(tc => {
          if (tc.name === 'interactive_form') {
            tc._isSubmitted = true
          }
        })

        // Parse submitted values from this [Form Submission]
        const submissionContent = nextUserMsg.content
        const lines = submissionContent.split('\n').slice(1) // Skip "[Form Submission]" line
        lines.forEach(line => {
          const match = line.match(/^([^:]+):\s*(.+)$/)
          if (match) {
            const fieldName = match[1].trim()
            const value = match[2].trim()
            allSubmittedValues[fieldName] = value
          }
        })

        // If generic AI response follows, merge it
        if (nextAiMsg && nextAiMsg.role === 'ai') {
          // Merge tool calls if any
          if (nextAiMsg.toolCallHistory && nextAiMsg.toolCallHistory.length > 0) {
            // Avoid duplicates by checking IDs
            const existingIds = new Set(toolCallHistory.map(tc => tc.id))
            const offset = mergedContent.length + 2 // +2 for the '\n\n' separator

            const newTools = (nextAiMsg.toolCallHistory || [])
              .filter(tc => !existingIds.has(tc.id))
              .map(tc => ({
                ...tc,
                // Adjust textIndex by adding the current content length + separator
                textIndex: (tc.textIndex || 0) + offset,
              }))

            toolCallHistory.push(...newTools)
          }

          // Merge sources if any
          if (nextAiMsg.sources && nextAiMsg.sources.length > 0) {
            const existingTitles = new Set(sources.map(s => s.title))
            const newSources = nextAiMsg.sources.filter(s => !existingTitles.has(s.title))
            sources.push(...newSources)
          }

          // Merge related questions if any
          if (nextAiMsg.related && nextAiMsg.related.length > 0) {
            related = nextAiMsg.related
          }
          // Update relatedLoading status
          if (nextAiMsg.relatedLoading) {
            relatedLoading = nextAiMsg.relatedLoading
          }

          mergedContent += '\n\n' + (nextAiMsg.content || '')

          currentIndex += 2
        }
      } else {
        // No more form submission pairs, stop
        break
      }
    }

    // Check if the chain is currently waiting for a continuation
    let isContinuationLoading = false
    if (isLoading && hasAnySubmission) {
      // After the loop, currentIndex points to the last merged AI message
      // Check if there's a [Form Submission] after it that's waiting for a response
      const nextUserMsg = messages[currentIndex + 1]
      const nextAiMsg = messages[currentIndex + 2]

      // Check if nextUserMsg is a form submission
      const isFormSubmission =
        nextUserMsg &&
        nextUserMsg.role === 'user' &&
        typeof nextUserMsg.content === 'string' &&
        nextUserMsg.content.startsWith('[Form Submission]')

      if (isFormSubmission) {
        // If we have a submission but no AI message yet OR an empty AI message
        if (
          !nextAiMsg ||
          (nextAiMsg &&
            nextAiMsg.role === 'ai' &&
            !nextAiMsg.content &&
            (!nextAiMsg.toolCallHistory || nextAiMsg.toolCallHistory.length === 0))
        ) {
          isContinuationLoading = true
        }
      }
    }

    // If we found any submissions, return merged message
    if (hasAnySubmission) {
      return {
        ...message,
        content: mergedContent,
        toolCallHistory: toolCallHistory,
        sources: sources,
        related: related,
        relatedLoading: relatedLoading,
        _formSubmitted: true,
        _formSubmittedValues: allSubmittedValues,
        _isContinuationLoading: isContinuationLoading,
      }
    }

    return message
  }, [message, messages, messageIndex, isLoading])

  const isDeepResearch =
    !!mergedMessage?.deepResearch ||
    mergedMessage?.agent_name === 'Deep Research Agent' ||
    mergedMessage?.agentName === 'Deep Research Agent'

  const providerId = mergedMessage.provider || apiProvider
  const provider = getProvider(providerId)
  const parsed = provider.parseMessage(mergedMessage)
  const thoughtContent =
    isDeepResearch || mergedMessage.thinkingEnabled === false ? null : parsed.thought
  const mainContent = parsed.content

  const toolCallHistory = Array.isArray(mergedMessage.toolCallHistory)
    ? mergedMessage.toolCallHistory
    : []

  const getToolCallsForStep = useCallback(
    stepNumber =>
      toolCallHistory.filter(item =>
        typeof item.step === 'number' ? item.step === stepNumber : false,
      ),
    [toolCallHistory],
  )

  const formatJsonForDisplay = value => {
    if (value == null) return ''
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return value
      }
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const interleavedContent = useMemo(() => {
    if (isDeepResearch || !toolCallHistory.length) {
      return [{ type: 'text', content: mainContent || '' }]
    }

    const parts = []
    let lastIndex = 0
    const rawContent = mainContent || ''

    // Group tools by index
    const toolsByIndex = {}
    toolCallHistory.forEach(tool => {
      // Use textIndex if available
      // If missing: default interactive_form to end, others to start
      const idx = tool.textIndex ?? (tool.name === 'interactive_form' ? rawContent.length : 0)
      if (!toolsByIndex[idx]) toolsByIndex[idx] = []
      toolsByIndex[idx].push(tool)
    })

    // Get all unique indices
    const indices = Object.keys(toolsByIndex)
      .map(Number)
      .sort((a, b) => a - b)

    indices.forEach(index => {
      const safeIndex = Math.min(index, rawContent.length)
      if (safeIndex > lastIndex) {
        parts.push({
          type: 'text',
          content: rawContent.substring(lastIndex, safeIndex),
        })
      }
      parts.push({ type: 'tools', items: toolsByIndex[index] })
      lastIndex = Math.max(lastIndex, safeIndex)
    })

    if (lastIndex < rawContent.length) {
      parts.push({ type: 'text', content: rawContent.substring(lastIndex) })
    }

    return parts
  }, [mainContent, toolCallHistory, isDeepResearch])

  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))
  const mainContentRef = useRef(null)
  const researchExportRef = useRef(null)
  const thoughtExportRef = useRef(null)
  const containerRef = useRef(null) // Local ref for the wrapper

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
  const [activeToolDetail, setActiveToolDetail] = useState(null)

  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false)
  const downloadMenuRef = useRef(null)

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
  const handleTouchEnd = () => {
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

  useEffect(() => {
    if (!isDownloadMenuOpen) return
    const handleOutside = event => {
      if (downloadMenuRef.current && downloadMenuRef.current.contains(event.target)) return
      setIsDownloadMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [isDownloadMenuOpen])

  const [isThoughtExpanded, setIsThoughtExpanded] = useState(false)
  const [isResearchExpanded, setIsResearchExpanded] = useState(false)
  const [isPlanExpanded, setIsPlanExpanded] = useState(false)
  const [thinkingStatusIndex, setThinkingStatusIndex] = useState(0)

  const { t } = useTranslation()
  const { showConfirmation } = useAppContext()
  const isUser = message.role === 'user'

  const planContent = typeof message?.researchPlan === 'string' ? message.researchPlan.trim() : ''

  // Dynamic thinking status messages using translations
  const THINKING_STATUS_MESSAGES = [
    t('chat.thinking'),
    t('chat.analyzing'),
    t('chat.workingThroughIt'),
    t('chat.checkingDetails'),
  ]
  const DEEP_RESEARCH_STATUS_MESSAGES = [
    t('chat.deepResearchPlanning'),
    t('chat.deepResearchSynthesizing'),
    t('chat.deepResearchDrafting'),
    t('chat.deepResearchRefining'),
  ]
  const planMarkdown = useMemo(() => {
    if (!planContent) return ''
    const trimmed = planContent.trim()
    if (!trimmed) return ''
    try {
      const parsed = JSON.parse(trimmed)
      const goal = parsed.goal ? `**${t('messageBubble.researchGoal')}:** ${parsed.goal}` : ''

      // New fields: complexity and question_type
      const complexity = parsed.complexity
        ? `**${t('messageBubble.researchComplexity')}:** ${parsed.complexity}`
        : ''
      const questionType = parsed.question_type
        ? `**${t('messageBubble.researchQuestionType')}:** ${parsed.question_type}`
        : ''

      const assumptions = Array.isArray(parsed.assumptions)
        ? parsed.assumptions
            .filter(Boolean)
            .map(item => `- ${item}`)
            .join('\n')
        : ''
      const steps = Array.isArray(parsed.plan)
        ? parsed.plan
            .map(step => {
              if (!step) return ''
              const title = step.step ? `**${step.step}.**` : '**-**'
              const action = step.action ? ` ${step.action}` : ''
              const expected = step.expected_output
                ? `\n  - ${t('messageBubble.researchExpected')}: ${step.expected_output}`
                : ''
              const thought = step.thought
                ? `\n  - ${t('messageBubble.researchThought')}: ${step.thought}`
                : ''
              // New fields: deliverable_format, acceptance_criteria, depth
              const format = step.deliverable_format
                ? `\n  - ${t('messageBubble.researchDeliverableFormat')}: ${step.deliverable_format}`
                : ''
              const criteria = Array.isArray(step.acceptance_criteria)
                ? step.acceptance_criteria
                    .filter(Boolean)
                    .map(item => `\n  - ${t('messageBubble.researchAcceptanceCriteria')}: ${item}`)
                    .join('')
                : ''
              const depth = step.depth
                ? `\n  - ${t('messageBubble.researchDepth')}: ${step.depth}`
                : ''
              const requiresSearch =
                step.requires_search !== undefined
                  ? `\n  - ${t('messageBubble.researchRequiresSearch')}: ${step.requires_search ? '✅' : '❌'}`
                  : ''
              return `${title}${action}${thought}${expected}${format}${depth}${requiresSearch}${criteria}`.trim()
            })
            .filter(Boolean)
            .join('\n\n')
        : ''
      const risks = Array.isArray(parsed.risks)
        ? parsed.risks
            .filter(Boolean)
            .map(item => `- ${item}`)
            .join('\n')
        : ''
      const success = Array.isArray(parsed.success_criteria)
        ? parsed.success_criteria
            .filter(Boolean)
            .map(item => `- ${item}`)
            .join('\n')
        : ''

      const sections = []
      sections.push(`### ${t('messageBubble.researchPlan')}`)

      // New field: research_type
      if (parsed.research_type) {
        const typeLabel =
          parsed.research_type === 'academic'
            ? t('messageBubble.researchTypeAcademic')
            : t('messageBubble.researchTypeGeneral')
        sections.push(`**${t('messageBubble.researchType')}:** ${typeLabel}`)
      }

      if (goal) sections.push(goal)
      // Add new fields after goal
      if (complexity) sections.push(complexity)
      if (questionType) sections.push(questionType)
      if (assumptions) {
        sections.push(`**${t('messageBubble.researchAssumptions')}:**`)
        sections.push(assumptions)
      }
      if (steps) {
        sections.push(`**${t('messageBubble.researchSteps')}:**`)
        sections.push(steps)
      }
      if (risks) {
        sections.push(`**${t('messageBubble.researchRisks')}:**`)
        sections.push(risks)
      }
      if (success) {
        sections.push(`**${t('messageBubble.researchSuccessCriteria')}:**`)
        sections.push(success)
      }
      return sections.filter(Boolean).join('\n\n')
    } catch {
      return `${t('messageBubble.researchPlan')}\n\n${trimmed}`
    }
  }, [planContent, t])

  const { handleDownloadPdf, handleDownloadWord } = useMessageExport({
    message,
    planMarkdown,
    thoughtContent,
    mainContentRef,
    researchExportRef,
    thoughtExportRef,
    conversationTitle,
    t,
  })

  // Sources UI State
  const [isSourcesOpen, setIsSourcesOpen] = useState(false) // Desktop
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false) // Mobile
  const [mobileDrawerSources, setMobileDrawerSources] = useState([]) // Sources to show in mobile drawer (all or specific)
  const [mobileDrawerTitle, setMobileDrawerTitle] = useState(t('sources.title'))

  const handleMobileSourceClick = useCallback(
    (selectedSources, title) => {
      setMobileDrawerSources(selectedSources || mergedMessage.sources)
      setMobileDrawerTitle(title || t('sources.title'))
      setIsMobileDrawerOpen(true)
    },
    [mergedMessage.sources, t],
  )

  const isStreaming =
    message?.isStreaming ??
    ((isLoading && message.role === 'ai' && messageIndex === messages.length - 1) ||
      !!mergedMessage?._isContinuationLoading)
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
  const baseThinkingStatusActive =
    message.role === 'ai' && message.thinkingEnabled !== false && isStreaming && !hasMainText
  const researchStatusText = DEEP_RESEARCH_STATUS_MESSAGES[0]
  const thinkingStatusText =
    THINKING_STATUS_MESSAGES[thinkingStatusIndex] || THINKING_STATUS_MESSAGES[0]
  const statusMessageCount = Math.max(
    DEEP_RESEARCH_STATUS_MESSAGES.length,
    THINKING_STATUS_MESSAGES.length,
  )
  const renderPlainCodeBlock = useCallback(
    (codeText, language) => (
      <div className="relative group my-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-x-auto bg-user-bubble/20 dark:bg-zinc-800/30">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold bg-user-bubble/50 dark:bg-zinc-800/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
          <span>{String(language || 'CODE').toUpperCase()}</span>
          <button className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            Copy
          </button>
        </div>
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={language || 'text'}
          PreTag="div"
          className="code-scrollbar text-sm sm:text-base text-shadow-none! font-code!"
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
          }}
          codeTagProps={{
            style: {
              backgroundColor: 'transparent',
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
    if (!baseThinkingStatusActive) return undefined
    setThinkingStatusIndex(0)
    const intervalId = setInterval(() => {
      setThinkingStatusIndex(prev => (prev + 1) % statusMessageCount)
    }, 1800)
    return () => clearInterval(intervalId)
  }, [baseThinkingStatusActive, statusMessageCount])

  const CodeBlock = useCallback(
    ({ inline, className, children, ...props }) => {
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
          <div className="relative group my-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-x-auto bg-user-bubble/20 dark:bg-zinc-800/30">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold bg-user-bubble/50 dark:bg-zinc-800/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
              <span>{langLabel}</span>
              <button className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                Copy
              </button>
            </div>
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={match[1]}
              PreTag="div"
              className="code-scrollbar text-sm sm:text-base text-shadow-none! font-code!"
              customStyle={{
                margin: 0,
                padding: '1rem',
                background: 'transparent',
                borderRadius: 'inherit',
              }}
              codeTagProps={{
                style: {
                  backgroundColor: 'transparent',
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
    },
    [isDark, mermaidOptions],
  )

  const headingCounterRef = useRef(0)

  const getNextHeadingId = useCallback(() => {
    const id = `heading-${messageIndex}-${headingCounterRef.current}`
    headingCounterRef.current += 1
    return id
  }, [messageIndex])

  const createHeadingComponent = (Tag, className, withAnchors) => {
    const Heading = ({ children, ...props }) => {
      const headingId = withAnchors ? getNextHeadingId() : undefined
      return (
        <Tag
          className={className}
          {...(headingId ? { id: headingId, 'data-heading-id': headingId } : {})}
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </Tag>
      )
    }
    Heading.displayName = `Heading\${Tag}`
    return Heading
  }

  // Handle interactive form submission
  const handleFormSubmit = useCallback(
    formSubmission => {
      if (onFormSubmit) {
        onFormSubmit(formSubmission)
      }
    },
    [onFormSubmit],
  )

  const markdownComponents = useMemo(
    () => ({
      code: ({ inline, className, children, ...props }) => {
        return (
          <CodeBlock inline={inline} className={className} {...props}>
            {children}
          </CodeBlock>
        )
      },
      p: ({ children, ...props }) => (
        <p className="mb-4 last:mb-0" {...props}>
          {parseChildrenWithEmojis(children)}
        </p>
      ),
      h1: createHeadingComponent('h1', 'text-2xl font-bold mb-4 mt-4', false),
      h2: createHeadingComponent('h2', 'text-xl font-bold mb-3 mt-3', false),
      h3: createHeadingComponent('h3', 'text-lg font-bold mb-2 mt-2', false),
      ul: ({ ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
      ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
      li: ({ children, ...props }) => (
        <li className="mb-1" {...props}>
          {parseChildrenWithEmojis(children)}
        </li>
      ),
      blockquote: ({ children, ...props }) => (
        <blockquote
          className="border-l-4 border-gray-300 dark:border-zinc-600 pl-4 italic my-4 text-gray-600 dark:text-gray-400"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </blockquote>
      ),
      table: ({ ...props }) => (
        <div className="overflow-x-auto my-4 w-fit max-w-full rounded-lg border border-gray-200 dark:border-zinc-700 table-scrollbar code-scrollbar">
          <table className="w-auto divide-y divide-gray-200 dark:divide-zinc-700" {...props} />
        </div>
      ),
      thead: ({ ...props }) => <thead className="bg-user-bubble dark:bg-zinc-800" {...props} />,
      tbody: ({ ...props }) => (
        <tbody
          className="bg-user-bubble/50 dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-zinc-700"
          {...props}
        />
      ),
      tr: ({ ...props }) => <tr {...props} />,
      th: ({ children, ...props }) => (
        <th
          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </th>
      ),
      td: ({ children, ...props }) => (
        <td
          className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
          {...props}
        >
          {parseChildrenWithEmojis(children)}
        </td>
      ),

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
              sources={mergedMessage.sources}
              isMobile={isMobile}
              onMobileClick={sources =>
                handleMobileSourceClick(sources, t('sources.citationSources'))
              }
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
    [isDark, mergedMessage.sources, isMobile, handleMobileSourceClick, CodeBlock, t], // Dependencies for markdownComponents
  )

  const markdownComponentsWithAnchors = useMemo(() => {
    // Use a local counter captured in the closure of this memoized value
    let localHeadingCounter = 0

    // Helper to generate IDs using the local counter
    const createLocalHeading = (Tag, className) => {
      const Heading = ({ children, ...props }) => {
        const id = `heading-${messageIndex}-${localHeadingCounter++}`
        return (
          <Tag className={className} id={id} data-heading-id={id} {...props}>
            {parseChildrenWithEmojis(children)}
          </Tag>
        )
      }
      Heading.displayName = `Heading${Tag}`
      return Heading
    }

    return {
      ...markdownComponents,
      h1: createLocalHeading('h1', 'text-2xl font-bold mb-4 mt-4'),
      h2: createLocalHeading('h2', 'text-xl font-bold mb-3 mt-3'),
      h3: createLocalHeading('h3', 'text-lg font-bold mb-2 mt-2'),
    }
  }, [markdownComponents, messageIndex, parseChildrenWithEmojis])

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

    // Check if this user message initiated a Deep Research task
    const nextMessage = messages[messageIndex + 1]
    const isDeepResearchContext =
      nextMessage?.agentName === 'Deep Research Agent' ||
      nextMessage?.agent_name === 'Deep Research Agent'

    return (
      <div
        id={messageId}
        ref={el => {
          containerRef.current = el
          if (typeof bubbleRef === 'function') bubbleRef(el)
        }}
        className={clsx(
          'flex items-center w-full mt-8 group px-3 sm:px-0',
          isDeepResearchContext ? 'justify-center' : 'justify-end',
        )}
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
        <div
          className={clsx(
            'flex flex-col gap-2 w-full',
            isDeepResearchContext ? 'items-center w-full' : 'items-end',
          )}
        >
          {/* Message Content */}
          {(() => {
            if (isDeepResearchContext) {
              return <DeepResearchGoalCard content={contentToRender} />
            }
            return (
              <div
                className={clsx(
                  'relative px-5 py-3.5 rounded-3xl text-base',
                  'bg-primary-500 dark:bg-primary-900 text-white dark:text-gray-100',
                )}
              >
                {quoteToRender && (
                  <div className="mb-2 p-3 bg-white/20 dark:bg-black/20 rounded-3xl text-sm">
                    <div className="font-medium  mb-1">{t('messageBubble.quoting')}</div>
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
            )
          })()}

          {/* Action Buttons */}
          {!isDeepResearchContext && (
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
                  if (!onResend) return
                  showConfirmation({
                    title: t('confirmation.resendTitle'),
                    message: t('confirmation.resendMessage'),
                    confirmText: t('message.resend'),
                    onConfirm: onResend,
                  })
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300  rounded-lg transition-colors"
                title={t('message.resend')}
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => {
                  copyToClipboard(contentToRender)
                  setIsCopied(true)
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300  rounded-lg transition-colors"
                title={t('messageBubble.copy')}
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button
                onClick={() => {
                  if (!onDelete) return
                  showConfirmation({
                    title: t('confirmation.deleteMessageTitle'),
                    message: t('confirmation.deleteUserMessage'),
                    confirmText: t('confirmation.delete'),
                    isDangerous: true,
                    onConfirm: onDelete,
                  })
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
                title={t('common.delete')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const providerMeta = PROVIDER_META[providerId] || {
    label: providerId || 'AI',
    id: providerId,
    fallback: 'AI',
  }
  const resolvedModel = message.model || defaultModel || 'default model'
  const agentName = message.agentName ?? message.agent_name ?? null
  const agentEmoji = message.agentEmoji ?? message.agent_emoji ?? ''
  const agentIsDefault = message.agentIsDefault ?? message.agent_is_default ?? false
  const agentIsDeepResearch =
    message.agent_name == 'Deep Research Agent' || message.agentName == 'Deep Research Agent'
      ? true
      : false
  const displayAgentName = agentIsDefault
    ? t('agents.defaults.name')
    : agentIsDeepResearch
      ? t('deepResearch.agentName')
      : agentName

  const hasThoughtText = !!(thoughtContent && String(thoughtContent).trim())
  const hasPlanText = !!planMarkdown
  const researchPlanLoading = Boolean(message?.researchPlanLoading)
  const researchSteps = Array.isArray(message.researchSteps) ? message.researchSteps : []
  const hasResearchSteps = researchSteps.length > 0
  const hasRunningResearchStep = researchSteps.some(step => step.status === 'running')
  const shouldShowPlan = isDeepResearch && (hasPlanText || researchPlanLoading)
  const shouldShowResearch = isDeepResearch && hasResearchSteps
  const shouldShowThinking =
    !isDeepResearch &&
    message.thinkingEnabled !== false &&
    (isStreaming || hasThoughtText || hasPlanText)
  const shouldShowPlanStatus = isDeepResearch && researchPlanLoading
  const shouldShowResearchStatus = isDeepResearch && hasRunningResearchStep

  const hasRelatedQuestions =
    Array.isArray(mergedMessage.related) && mergedMessage.related.length > 0
  const isRelatedLoading = !!mergedMessage.relatedLoading
  const shouldShowRelated = !isDeepResearch && (hasRelatedQuestions || isRelatedLoading)

  // Debug logging for related questions
  if (mergedMessage._formSubmitted) {
    console.log('[MessageBubble] Related questions check:', {
      messageId: message.id,
      hasRelatedQuestions,
      relatedCount: mergedMessage.related?.length || 0,
      isRelatedLoading,
      shouldShowRelated,
      isDeepResearch,
      mergedRelated: mergedMessage.related,
    })
  }

  return (
    <div
      id={messageId}
      ref={el => {
        containerRef.current = el
        if (typeof bubbleRef === 'function') bubbleRef(el)
      }}
      className="w-full max-w-3xl mb-12 flex flex-col gap-4 relative px-5 sm:px-0"
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
        {agentName ? (
          <>
            <div className="rounded-full shadow-inner flex items-center justify-center overflow-hidden w-10 h-10 bg-gray-100 dark:bg-zinc-800">
              <EmojiDisplay emoji={agentEmoji} size="1.5rem" />
            </div>
            <div className="flex flex-col leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{displayAgentName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                {renderProviderIcon(providerMeta.id, {
                  size: 12,
                  alt: providerMeta.label,
                  compact: true,
                  wrapperClassName: 'w-3 h-3',
                  imgClassName: 'w-full h-full object-contain',
                }) || (
                  <span className="text-[10px] font-semibold">
                    {providerMeta.fallback?.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span>{providerMeta.label}</span>
                {getModelIcon(resolvedModel) && (
                  <img
                    src={getModelIcon(resolvedModel)}
                    alt=""
                    width={12}
                    height={12}
                    className={clsx('w-3 h-3 object-contain', getModelIconClassName(resolvedModel))}
                    loading="lazy"
                  />
                )}
                <span>{resolvedModel}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className=" rounded-full  shadow-inner flex items-center justify-center overflow-hidden">
              {renderProviderIcon(providerMeta.id, {
                size: 30,
                alt: providerMeta.label,
                wrapperClassName: 'p-0 w-10 h-10',
                imgClassName: 'w-full h-full object-contain',
              }) || (
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
                    className={clsx(
                      'w-3.5 h-3.5 object-contain',
                      getModelIconClassName(resolvedModel),
                    )}
                    loading="lazy"
                  />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">{resolvedModel}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Thinking Process Section */}
      {isDeepResearch ? (
        <>
          {shouldShowPlan && (
            <div className="border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setIsPlanExpanded(!isPlanExpanded)}
                className="w-full flex items-center justify-between p-2 bg-user-bubble/30 dark:bg-zinc-800/50 hover:bg-user-bubble dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
                  <EmojiDisplay emoji={'🧭'} size="1.2em" />
                  <span className="text-sm">{t('messageBubble.planProcess')}</span>
                  {!shouldShowPlanStatus && <Check size="1em" />}
                  {shouldShowPlanStatus && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="text-left mr-4">{researchStatusText}</span>
                      <DotLoader />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isPlanExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              {isPlanExpanded && (hasPlanText || shouldShowPlanStatus) && (
                <div className="p-4 bg-user-bubble/30 font-stretch-semi-condensed dark:bg-zinc-800/30 border-t border-gray-200 dark:border-zinc-700 text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-4">
                  <Streamdown
                    mermaid={mermaidOptions}
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {planMarkdown}
                  </Streamdown>
                </div>
              )}
            </div>
          )}

          {shouldShowResearch && (
            <div className="border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setIsResearchExpanded(!isResearchExpanded)}
                className="w-full flex items-center justify-between p-2 bg-user-bubble/30 dark:bg-zinc-800/50 hover:bg-user-bubble dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
                  <EmojiDisplay emoji={'📋'} size="1.2em" />
                  <span className="text-sm">{t('messageBubble.researchProcess')}</span>
                  {!shouldShowResearchStatus && <Check size="1em" />}
                  {shouldShowResearchStatus && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="text-left mr-4">{researchStatusText}</span>
                      <DotLoader />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isResearchExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              {isResearchExpanded && hasResearchSteps && (
                <div className="p-4 bg-user-bubble/30 font-stretch-semi-condensed dark:bg-zinc-800/30 border-t border-gray-200 dark:border-zinc-700 text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-3">
                  {researchSteps.map(step => {
                    const isRunning = step.status === 'running'
                    const isDone = step.status === 'done'
                    const isError = step.status === 'error'
                    const stepToolCalls = getToolCallsForStep(step.step)
                    const durationLabel =
                      typeof step.durationMs === 'number'
                        ? t('messageBubble.researchStepDuration', {
                            duration: (step.durationMs / 1000).toFixed(2),
                          })
                        : null
                    const statusLabel = isError
                      ? t('messageBubble.researchStepStatusError')
                      : isDone
                        ? t('messageBubble.researchStepStatusDone')
                        : t('messageBubble.researchStepStatusRunning')
                    return (
                      <div
                        key={`${step.step}-${step.title}`}
                        className="flex items-start gap-3 rounded-lg border border-gray-200/60 dark:border-zinc-700/60 bg-white/40 dark:bg-zinc-900/30 p-3"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-gray-700 dark:text-gray-200">
                              {t('messageBubble.researchStepLabel', {
                                step: step.step,
                                total: step.total || researchSteps.length,
                              })}
                            </span>
                            <span
                              className={clsx(
                                'px-2 py-0.5 rounded-full text-[11px]',
                                isError
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                  : isDone
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                    : 'bg-gray-200/70 dark:bg-zinc-700/70 text-gray-600 dark:text-gray-400',
                              )}
                            >
                              {statusLabel}
                            </span>
                            {isRunning && <DotLoader />}
                            {durationLabel && (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                {durationLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {step.title}
                            {isRunning ? '...' : ''}
                          </div>
                          {step.error && (
                            <div className="text-[11px] text-red-500 dark:text-red-400">
                              {step.error}
                            </div>
                          )}
                          {stepToolCalls.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <div className="h-[0.5px] my-2 w-full bg-gray-200 dark:bg-zinc-700"></div>
                              {/* <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                {t('messageBubble.toolCalls')}
                              </div> */}
                              {developerMode ? (
                                // Developer Mode: Detailed view
                                <div className="space-y-1">
                                  {stepToolCalls.map(item => (
                                    <div
                                      key={item.id || `${item.name}-${item.arguments}`}
                                      className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400"
                                    >
                                      <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {item.name}
                                      </span>
                                      <span
                                        className={clsx(
                                          'px-2 py-0.5 rounded-full text-[10px]',
                                          item.status === 'error'
                                            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                            : item.status === 'done'
                                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                              : 'bg-gray-200/70 dark:bg-zinc-700/70 text-gray-600 dark:text-gray-400',
                                        )}
                                      >
                                        {item.status === 'error'
                                          ? t('messageBubble.toolStatusError')
                                          : item.status === 'done'
                                            ? t('messageBubble.toolStatusDone')
                                            : t('messageBubble.toolStatusCalling')}
                                      </span>
                                      {item.status !== 'done' && item.status !== 'error' && (
                                        <DotLoader />
                                      )}
                                      {typeof item.durationMs === 'number' && (
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                          {t('messageBubble.toolDuration', {
                                            duration: (item.durationMs / 1000).toFixed(2),
                                          })}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setActiveToolDetail(item)}
                                        className="ml-auto text-[10px] text-primary-600 dark:text-primary-300 hover:underline"
                                      >
                                        {t('messageBubble.toolDetails')}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                // Standard Mode: Simplified view with icons
                                <div className="space-y-1 overflow-hidden">
                                  {stepToolCalls.map(item => {
                                    const iconName = TOOL_ICONS[item.name]
                                    const IconComponent = iconName
                                      ? {
                                          Search,
                                          GraduationCap,
                                          Calculator,
                                          Clock,
                                          FileText,
                                          ScanText,
                                          Wrench,
                                          FormInput,
                                        }[iconName]
                                      : null
                                    return (
                                      <div
                                        key={item.id || `${item.name}-${item.arguments}`}
                                        className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
                                      >
                                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 sm:gap-1.5 w-full">
                                          <span className="font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap flex items-center gap-1">
                                            {IconComponent && (
                                              <IconComponent
                                                size={12}
                                                className="text-gray-500 dark:text-gray-400"
                                              />
                                            )}
                                            {TOOL_TRANSLATION_KEYS[item.name]
                                              ? t(TOOL_TRANSLATION_KEYS[item.name])
                                              : item.name}
                                          </span>
                                          <div className="flex items-center min-w-0">
                                            {Object.keys(TOOL_TRANSLATION_KEYS).includes(
                                              item.name,
                                            ) &&
                                              (() => {
                                                try {
                                                  const args = JSON.parse(item.arguments || '{}')
                                                  if (args.query) {
                                                    return (
                                                      <span className="opacity-75 truncate w-full">
                                                        &quot;{args.query}&quot;
                                                      </span>
                                                    )
                                                  }
                                                } catch {
                                                  return null
                                                }
                                              })()}
                                          </div>
                                          <span
                                            className={clsx(
                                              'px-1.5 py-0.5 rounded-full text-[10px] ml-auto flex-shrink-0 flex items-center justify-center min-w-[20px]',
                                              item.status === 'error'
                                                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                : item.status === 'done'
                                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                                  : 'bg-gray-200/70 dark:bg-zinc-700/70 text-gray-600 dark:text-gray-400',
                                            )}
                                          >
                                            {item.status === 'error' ? (
                                              <X className="w-3 h-3" />
                                            ) : item.status === 'done' ? (
                                              <Check className="w-3 h-3" />
                                            ) : (
                                              <DotLoader />
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        shouldShowThinking && (
          <div className="border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
              className="w-full flex items-center justify-between p-2 bg-user-bubble/30 dark:bg-zinc-800/50 hover:bg-user-bubble dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
                <EmojiDisplay emoji={'🧠'} size="1.2em" />
                {!baseThinkingStatusActive && (
                  <span className="text-sm">{t('messageBubble.thinkingProcess')}</span>
                )}
                {!baseThinkingStatusActive && <Check size="1em" />}
                {baseThinkingStatusActive && (
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

            {isThoughtExpanded && (hasThoughtText || hasPlanText) && (
              <div className="p-4 bg-user-bubble/30 font-stretch-semi-condensed dark:bg-zinc-800/30 border-t border-gray-200 dark:border-zinc-700 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                <Streamdown
                  mermaid={mermaidOptions}
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {[planMarkdown, thoughtContent].filter(Boolean).join('\n\n')}
                </Streamdown>
              </div>
            )}
          </div>
        )
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
        {!mergedMessage.content && (!toolCallHistory || toolCallHistory.length === 0) ? (
          <div className="flex flex-col gap-2 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
          </div>
        ) : mergedMessage._isContinuationLoading ? (
          <div className="flex flex-col gap-2 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
          </div>
        ) : (
          interleavedContent.map((part, idx) => {
            if (part.type === 'tools') {
              // Separate utility tools from interactive forms
              const formTools = part.items.filter(item => item.name === 'interactive_form')
              const regularTools = part.items.filter(item => item.name !== 'interactive_form')

              return (
                <div key={`tools-container-${idx}`} className="flex flex-col gap-4">
                  {/* Render regular tools */}
                  {regularTools.length > 0 &&
                    (developerMode ? (
                      // Developer Mode: Simplified view consistent with Deep Research within a card container
                      <div className="my-4 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-user-bubble/20 dark:bg-zinc-800/30">
                        <div className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-zinc-700">
                          <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
                            <EmojiDisplay emoji={'🔧'} size="1.2em" />{' '}
                            {t('messageBubble.toolCalls')}
                          </div>
                        </div>
                        <div className="px-4 py-3 space-y-2">
                          {regularTools.map(item => (
                            <div
                              key={item.id || `${item.name}-${item.arguments}`}
                              className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400"
                            >
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {item.name}
                              </span>
                              <span
                                className={clsx(
                                  'px-2 py-0.5 rounded-full text-[10px]',
                                  item.status === 'error'
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                    : item.status === 'done'
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                      : 'bg-gray-200/70 dark:bg-zinc-700/70 text-gray-600 dark:text-gray-400',
                                )}
                              >
                                {item.status === 'error'
                                  ? t('messageBubble.toolStatusError')
                                  : item.status === 'done'
                                    ? t('messageBubble.toolStatusDone')
                                    : t('messageBubble.toolStatusCalling')}
                              </span>
                              {item.status !== 'done' && item.status !== 'error' && <DotLoader />}
                              {typeof item.durationMs === 'number' && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                  {t('messageBubble.toolDuration', {
                                    duration: (item.durationMs / 1000).toFixed(2),
                                  })}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveToolDetail(item)}
                                className="ml-auto text-[10px] text-primary-600 dark:text-primary-300 hover:underline"
                              >
                                {t('messageBubble.toolDetails')}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      // Standard Mode: Simplified view
                      <div className="my-4 p-3 border flex flex-col gap-2 border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-user-bubble/20 dark:bg-zinc-800/30">
                        {regularTools.map(item => {
                          const iconName = TOOL_ICONS[item.name]
                          const IconComponent = iconName
                            ? {
                                Search,
                                GraduationCap,
                                Calculator,
                                Clock,
                                FileText,
                                ScanText,
                                Wrench,
                                FormInput,
                              }[iconName]
                            : null
                          return (
                            <div
                              key={item.id || `${item.name}-${item.arguments}`}
                              className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                            >
                              <div className="flex items-center gap-1 sm:gap-2 w-full">
                                <span className="font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                                  {IconComponent && (
                                    <IconComponent
                                      size={14}
                                      className="text-gray-500 dark:text-gray-400"
                                    />
                                  )}
                                  {TOOL_TRANSLATION_KEYS[item.name]
                                    ? t(TOOL_TRANSLATION_KEYS[item.name])
                                    : item.name}
                                </span>
                                <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                                  {Object.keys(TOOL_TRANSLATION_KEYS).includes(item.name) &&
                                    (() => {
                                      try {
                                        const args = JSON.parse(item.arguments || '{}')
                                        if (args.query) {
                                          return (
                                            <span className="opacity-75 truncate w-full">
                                              &quot;{args.query}&quot;
                                            </span>
                                          )
                                        }
                                      } catch {
                                        return null
                                      }
                                    })()}
                                </div>
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 rounded-full text-[11px] ml-auto flex-shrink-0 flex items-center justify-center min-w-[24px]',
                                    item.status === 'error'
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                      : item.status === 'done'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                        : 'bg-gray-200/70 dark:bg-zinc-700/70 text-gray-600 dark:text-gray-400',
                                  )}
                                >
                                  {item.status === 'error' ? (
                                    <X className="w-4 h-4" />
                                  ) : item.status === 'done' ? (
                                    <Check className="w-4 h-4" />
                                  ) : (
                                    <DotLoader />
                                  )}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}

                  {/* Render Interactive Forms */}
                  {isStreaming ? (
                    <div className="my-4  rounded-xl  space-y-4 animate-pulse">
                      <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-1/3"></div>
                      <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-2/3"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/4"></div>
                        <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded w-full"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/4"></div>
                        <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded w-full"></div>
                      </div>
                      <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded w-full mt-4"></div>
                    </div>
                  ) : (
                    formTools.map((item, formIdx) => {
                      try {
                        const formData = JSON.parse(item.arguments)
                        return (
                          <InteractiveForm
                            key={`form-${formIdx}`}
                            formData={formData}
                            onSubmit={handleFormSubmit}
                            messageId={message.id}
                            isSubmitted={!!item._isSubmitted}
                            submittedValues={mergedMessage._formSubmittedValues || {}}
                            developerMode={developerMode}
                            onShowDetails={() => setActiveToolDetail(item)}
                          />
                        )
                      } catch (e) {
                        console.error('Failed to parse interactive form arguments:', e)
                        return (
                          <div
                            key={`form-error-${formIdx}`}
                            className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300"
                          >
                            Error displaying form: {e.message}
                          </div>
                        )
                      }
                    })
                  )}
                </div>
              )
            }

            const contentWithSupports = applyGroundingSupports(
              part.content,
              mergedMessage.groundingSupports,
              mergedMessage.sources,
            )
            const contentWithCitations = formatContentWithSources(
              contentWithSupports,
              mergedMessage.sources,
            )

            return (
              <Streamdown
                key={`text-${idx}`}
                mermaid={mermaidOptions}
                remarkPlugins={[remarkGfm]}
                components={markdownComponentsWithAnchors}
              >
                {contentWithCitations}
              </Streamdown>
            )
          })
        )}
      </div>

      {/* Related Questions */}
      {shouldShowRelated && (
        <div className="border-t border-gray-200 dark:border-zinc-800 pt-4">
          <RelatedQuestions
            t={t}
            questions={hasRelatedQuestions ? mergedMessage.related : []}
            isLoading={isRelatedLoading}
            onRelatedClick={onRelatedClick}
          />
        </div>
      )}

      {/* Action Bar */}
      <MessageActionBar
        t={t}
        isDeepResearch={isDeepResearch}
        isMobile={isMobile}
        message={mergedMessage}
        isSourcesOpen={isSourcesOpen}
        onToggleSources={() => setIsSourcesOpen(prev => !prev)}
        onOpenMobileSources={() =>
          handleMobileSourceClick(mergedMessage.sources, t('sources.allSources'))
        }
        onShare={() => setIsShareModalOpen(true)}
        onRegenerate={() => {
          if (!onRegenerateAnswer) return
          showConfirmation({
            title: t('confirmation.regenerateTitle'),
            message: t('confirmation.regenerateMessage'),
            confirmText: t('message.regenerate'),
            onConfirm: onRegenerateAnswer,
          })
        }}
        onCopy={() => {
          const renderedText = mainContentRef.current?.innerText?.trim() || ''
          const fallbackText = mainContent || ''
          copyToClipboard(renderedText || fallbackText)
          setIsCopied(true)
        }}
        isCopied={isCopied}
        onDownloadPdf={handleDownloadPdf}
        onDownloadWord={handleDownloadWord}
        isDownloadMenuOpen={isDownloadMenuOpen}
        setIsDownloadMenuOpen={setIsDownloadMenuOpen}
        downloadMenuRef={downloadMenuRef}
        onDelete={() => {
          if (!onDelete) return
          showConfirmation({
            title: t('confirmation.deleteMessageTitle'),
            message: t('confirmation.deleteAssistantMessage'),
            confirmText: t('confirmation.delete'),
            isDangerous: true,
            onConfirm: onDelete,
          })
        }}
      />

      {/* Desktop Sources Section (Collapsible) */}
      {!isMobile && mergedMessage.sources && mergedMessage.sources.length > 0 && (
        <DesktopSourcesSection sources={mergedMessage.sources} isOpen={isSourcesOpen} />
      )}

      {/* Mobile Sources Drawer */}
      <MobileSourcesDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        sources={mobileDrawerSources}
        title={mobileDrawerTitle}
      />

      <div className="hidden" aria-hidden="true">
        <div ref={researchExportRef}>
          <Streamdown mermaid={mermaidOptions} remarkPlugins={[remarkGfm]}>
            {planMarkdown}
          </Streamdown>
        </div>
        <div ref={thoughtExportRef}>
          <Streamdown mermaid={mermaidOptions} remarkPlugins={[remarkGfm]}>
            {thoughtContent}
          </Streamdown>
        </div>
      </div>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        message={message}
        conversationTitle={conversationTitle}
      />

      {activeToolDetail &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-y-auto md:overflow-hidden">
            <div className="w-full h-[100vh] md:max-w-4xl md:h-[80vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 md:border border-gray-200 dark:border-zinc-800">
              <div className="h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0 bg-white dark:bg-[#191a1a]">
                <div className="text-base font-semibold text-gray-900 dark:text-white truncate pr-4">
                  {activeToolDetail.name}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveToolDetail(null)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 min-h-0 bg-white dark:bg-[#191a1a]">
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('messageBubble.toolInput')}
                  </div>
                  <div>
                    <Streamdown
                      mermaid={mermaidOptions}
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {(() => {
                        const content = formatJsonForDisplay(activeToolDetail.arguments)
                        const trimmed = content.trim()
                        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                          (trimmed.startsWith('[') && trimmed.endsWith(']'))
                          ? `\`\`\`json\n${content}\n\`\`\``
                          : content
                      })()}
                    </Streamdown>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('messageBubble.toolOutput')}
                  </div>
                  <div>
                    <Streamdown
                      mermaid={mermaidOptions}
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {(() => {
                        const content = formatJsonForDisplay(activeToolDetail.output)
                        const trimmed = content.trim()
                        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                          (trimmed.startsWith('[') && trimmed.endsWith(']'))
                          ? `\`\`\`json\n${content}\n\`\`\``
                          : content
                      })()}
                    </Streamdown>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

const CitationChip = ({ indices, sources, isMobile, onMobileClick, label }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const containerRef = useRef(null)
  const timeoutRef = useRef(null)

  // Memoize the filtered sources for the drawer
  const drawerSources = useMemo(() => {
    if (!sources || !Array.isArray(sources)) return []
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
              const url = source.url || source.uri || source.link || source.href || ''
              const snippet = source.snippet || source.content || ''
              const hostname = getHostname(url)
              const faviconUrl =
                source.icon ||
                (hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32` : '')
              return (
                <a
                  key={idx}
                  href={url}
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
                      <span className="inline-flex items-center gap-1.5">
                        {faviconUrl && (
                          <img src={faviconUrl} alt="" className="h-3 w-3 rounded-sm" />
                        )}
                        <span className="truncate">{hostname}</span>
                      </span>
                    </span>
                    {snippet && (
                      <span className="mt-1 block text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">
                        {snippet}
                      </span>
                    )}
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
        title={t('sources.citationSources')}
      />
    </>
  )
}

export default MessageBubble
