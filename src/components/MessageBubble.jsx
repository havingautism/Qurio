import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

import clsx from 'clsx'
import {
  Check,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Link,
  Copy,
  Pencil,
  Quote,
  Trash2,
  X,
  Search,
  GraduationCap,
  Eye,
  Calculator,
  Clock,
  FileText,
  ScanText,
  SlidersHorizontal,
  Wrench,
  FormInput,
  Globe,
  AlertTriangle,
  Brain,
  BrainCircuit,
  Image as ImageIcon,
  ChevronLeft,
  Newspaper,
  User,
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
import { SEARCH_BACKEND_OPTIONS } from '../lib/searchTools'
import { TOOL_TRANSLATION_KEYS, TOOL_ICONS } from '../lib/toolConstants'
import { splitTextWithUrls } from '../lib/urlHighlight'
import { normalizeExpertBrokenTokenLines } from '../lib/chat/expertTextUtils'
import { getExpertTabIndicators, getExpertTaskCardModel } from '../lib/chat/expertUiUtils'
import {
  buildMessageProcessSteps,
  normalizeMessageStreamBlocks,
} from '../lib/chat/message-bubble/messageBubbleViewModel'
import {
  getToolArgumentsForDisplayWithResolvedBackends,
  getToolDisplayNameWithDetails,
  resolveMessageSearchBackends,
  resolveSearchBackendForTool,
} from '../lib/chat/message-bubble/messageBubbleSearchViewModel'
import {
  extractMessageImageEntries,
  extractMessageImageResults,
  extractMessageVideoResults,
  getVideoEmbedUrl,
  getVideoPlatform,
} from '../lib/chat/message-bubble/messageBubbleMediaViewModel'
import {
  buildContentPartsOutsideWorkflow,
  buildInterleavedContent,
  getWorkflowTextParts,
  getWorkflowThoughtParts,
} from '../lib/chat/message-bubble/messageBubbleContentViewModel'
import {
  createHtmlWidgetItemRenderer,
  createInteractiveFormItemRenderer,
  createPptxFileItemRenderer,
  createToolLoadingCardRenderer,
} from '../lib/chat/message-bubble/messageBubbleToolRenderers'
import {
  buildHeadingId,
  copyTextToClipboard,
  createCodeBlockRenderer,
  createHeadingRenderer,
  createMarkdownComponents,
  createMarkdownComponentsWithAnchors,
  createMarkdownLinkRenderer,
} from '../lib/chat/message-bubble/messageBubbleMarkdownViewModel'
import { getSearchFilterFallbackPresentation } from '../lib/chat/searchFilterPresentation'
import DesktopSourcesSection from './DesktopSourcesSection'
import DesktopSourcesSheet from './DesktopSourcesSheet'
import DotLoader from './DotLoader'
import InteractiveForm from './InteractiveForm'
import DeepResearchGoalCard from './message/DeepResearchGoalCard'
import HtmlWidgetCard from './message/HtmlWidgetCard'
import MessageActionBar from './message/MessageActionBar'
import PipelineDrawer from './message/PipelineDrawer'
import PptxResultCard from './message/PptxResultCard'
import { getHostname } from './message/messageUtils'
import { formatMessageDate } from '../lib/dateUtils'
import RelatedQuestions from './message/RelatedQuestions'
import { useMessageExport } from './message/useMessageExport'
import MobileSourcesDrawer from './MobileSourcesDrawer'
import ShareModal from './ShareModal'
import CitationChip from './message-bubble/CitationChip'
import InlineVideoEmbed from './message-bubble/InlineVideoEmbed'
import MessageImage from './message-bubble/MessageImage'
import SearchSourcesList from './message-bubble/SearchSourcesList'
import WorkflowPanel from './message-bubble/WorkflowPanel'
import UserMessageBubble from './message-bubble/UserMessageBubble'
import MessageBubbleHeader from './message-bubble/MessageBubbleHeader'
import ExpertPlanPanel from './message-bubble/ExpertPlanPanel'
import ExpertTaskCard from './message-bubble/ExpertTaskCard'
import YoutubeLogo from '../assets/youtube.svg?url'
import BilibiliLogo from '../assets/bilibili.png?url'
import useSettings from '../hooks/useSettings'
import {
  AGENT_AVATAR_SHAPE_CIRCLE,
  getAgentAvatarShape,
  getAgentBannerImage,
  hasManualAgentBanner,
} from '../lib/agentAppearance'
import {
  canExpandDocumentCitation,
  buildDocumentCitationPath,
} from '../lib/documentCitationViewModel'
import {
  buildAllSources,
  buildDocumentCitationSources,
  buildHeaderSourceLogos,
  hasNavigableSourceLink,
  resolveDefaultMobileDrawerSources,
  shouldShowWorkflowSourceSummary as resolveShouldShowWorkflowSourceSummary,
} from '../lib/chat/message-bubble/messageBubbleSourcesViewModel'
import {
  buildWorkflowProcessSteps,
  deriveWorkflowState,
  getActiveStreamingStepKind,
} from '../lib/chat/message-bubble/messageBubbleWorkflowViewModel'
import { ensureMessagePipeline } from '../lib/chat/pipelineViewModel'
import { getBackendUrl } from '../lib/settings'

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
  openrouter: {
    label: 'OpenRouter',
    id: 'openrouter',
    fallback: 'R',
  },
  litellm_openai: {
    label: 'LiteLLM OpenAI',
    id: 'litellm_openai',
    fallback: 'L',
  },
  huggingface: {
    label: 'Hugging Face',
    id: 'huggingface',
    fallback: 'H',
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
  deepseek: {
    label: 'DeepSeek',
    id: 'deepseek',
    fallback: 'D',
  },
  volcengine: {
    label: 'Volcengine',
    id: 'volcengine',
    fallback: 'V',
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

const TOOL_ICON_COMPONENTS = {
  Search,
  GraduationCap,
  Eye,
  Calculator,
  Clock,
  FileText,
  ScanText,
  Wrench,
  FormInput,
  Globe,
  Brain,
  BrainCircuit,
  ImageIcon,
  Newspaper,
  User,
}

const SKILL_TOOL_NAMES = new Set([
  'get_skill_instructions',
  'get_skill_reference',
  'get_skill_script',
])
const isSkillToolName = name => SKILL_TOOL_NAMES.has(String(name || ''))
const getToolIconComponent = toolName => {
  const iconName = TOOL_ICONS[toolName]
  return iconName ? TOOL_ICON_COMPONENTS[iconName] || null : null
}

const InTableContext = React.createContext(false)

const sanitizeDisplayText = value => {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\uFFFD+/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/ï¿½+/g, '')
    .replace(/ï»¿/g, '')
}

const isExplicitSchemeUrl = value => /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)

const sanitizeMarkdownUrl = (value, { allowDataImage = false } = {}) => {
  if (typeof value !== 'string') return null
  const href = value.trim()
  if (!href) return null

  if (href.startsWith('citation:')) return href
  if (!isExplicitSchemeUrl(href)) return null

  try {
    const parsed = new URL(href)
    const protocol = parsed.protocol.toLowerCase()
    if (
      protocol === 'http:' ||
      protocol === 'https:' ||
      protocol === 'mailto:' ||
      protocol === 'tel:'
    ) {
      if (protocol === 'https:' && parsed.hostname === 'citation.local') return href
      return href
    }
    if (allowDataImage && protocol === 'data:' && href.startsWith('data:image/')) {
      return href
    }
    return null
  } catch {
    return null
  }
}

const ToolEnter = ({ children, className }) => {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={clsx(
        'origin-top transform-gpu transition-all duration-200 ease-out',
        entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  )
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
  onDelete,
  onRegenerateAnswer,
  onUserRegenerate,
  onQuote,
  onFormSubmit,
  scrapbookEntry = null,
  isLastRenderable = false,
  messageOverride = null,
  headerExtraContent = null,
  compactStreamingTextBlocks = false,
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
  const { agents = [], onEditAgent } = useAppContext()
  const { t, i18n } = useTranslation()
  const isMobile = useIsMobile()

  // Extract message by index
  const message = messageOverride || messages[messageIndex]

  // Simple message reference (no more merging hacks!)
  const mergedMessage = message

  const isStreamingMessage =
    mergedMessage?.isStreaming ??
    (isLoading &&
      mergedMessage?.role === 'ai' &&
      (isLastRenderable || messageIndex === messages.length - 1))

  const baseToolCallHistory = Array.isArray(mergedMessage?.toolCallHistory)
    ? mergedMessage.toolCallHistory
    : []

  const isDeepResearch =
    !!mergedMessage?.deepResearch ||
    !!mergedMessage?.researchPlan ||
    (Array.isArray(mergedMessage?.researchSteps) && mergedMessage.researchSteps.length > 0) ||
    mergedMessage?.agent_name === 'Deep Research Agent' ||
    mergedMessage?.agentName === 'Deep Research Agent'

  const providerId = mergedMessage.provider || apiProvider
  const provider = getProvider(providerId)
  const parsed = provider.parseMessage(mergedMessage)
  const expertResponses = useMemo(() => {
    if (!Array.isArray(mergedMessage?.expertResponses)) return []
    return mergedMessage.expertResponses
      .map(item => ({
        agentId: String(item?.agentId || ''),
        agentName: String(item?.agentName || ''),
        agentEmoji: String(item?.agentEmoji || ''),
        agentRole: String(item?.agentRole || ''),
        task: String(item?.task || ''),
        content: String(item?.content || ''),
        status: String(item?.status || 'pending'),
        provider: item?.provider || null,
        model: item?.model || null,
        thought: typeof item?.thought === 'string' ? item.thought : '',
        thoughtHistory: Array.isArray(item?.thoughtHistory) ? item.thoughtHistory : [],
        toolCallHistory: Array.isArray(item?.toolCallHistory) ? item.toolCallHistory : [],
        streamBlocks: Array.isArray(item?.streamBlocks) ? item.streamBlocks : [],
        searchBackend: typeof item?.searchBackend === 'string' ? item.searchBackend : null,
        searchBackends: Array.isArray(item?.searchBackends) ? item.searchBackends : [],
      }))
      .filter(item => item.agentId)
  }, [mergedMessage?.expertResponses])

  const isExpertMessage = Boolean(mergedMessage?.expertMode) && expertResponses.length > 0
  const [activeExpertAgentId, setActiveExpertAgentId] = useState(
    String(mergedMessage?.expertActiveAgentId || expertResponses[0]?.agentId || ''),
  )
  const [isExpertAgentSelectorOpen, setIsExpertAgentSelectorOpen] = useState(false)
  const [isPipelineOpen, setIsPipelineOpen] = useState(false)
  const expertAgentSelectorRef = useRef(null)
  useEffect(() => {
    setIsPipelineOpen(false)
  }, [mergedMessage?.id, mergedMessage?.localId])
  useEffect(() => {
    const hasCurrent = expertResponses.some(item => item.agentId === activeExpertAgentId)
    if (hasCurrent) return

    const preferred = String(mergedMessage?.expertActiveAgentId || '')
    const hasPreferred = preferred && expertResponses.some(item => item.agentId === preferred)
    if (hasPreferred) {
      setActiveExpertAgentId(preferred)
      return
    }

    setActiveExpertAgentId(String(expertResponses[0]?.agentId || ''))
  }, [mergedMessage?.id, mergedMessage?.expertActiveAgentId, expertResponses, activeExpertAgentId])
  useEffect(() => {
    if (!isExpertAgentSelectorOpen) return undefined

    const handleOutside = event => {
      if (!expertAgentSelectorRef.current?.contains(event.target)) {
        setIsExpertAgentSelectorOpen(false)
      }
    }
    const handleEsc = event => {
      if (event.key === 'Escape') {
        setIsExpertAgentSelectorOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside, { passive: true })
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isExpertAgentSelectorOpen])
  useEffect(() => {
    if (!isMobile && isExpertAgentSelectorOpen) {
      setIsExpertAgentSelectorOpen(false)
    }
  }, [isMobile, isExpertAgentSelectorOpen])
  const activeExpertIndex = Math.max(
    0,
    expertResponses.findIndex(item => item.agentId === activeExpertAgentId),
  )
  const activeExpertResponse = expertResponses[activeExpertIndex] || expertResponses[0] || null
  const expertTeamMode = isExpertMessage ? String(mergedMessage?.teamMode || 'route') : 'route'
  const activeExpertTaskCard = getExpertTaskCardModel({
    teamMode: expertTeamMode,
    response: activeExpertResponse,
  })
  const toolCallHistory =
    isExpertMessage && Array.isArray(activeExpertResponse?.toolCallHistory)
      ? activeExpertResponse.toolCallHistory
      : baseToolCallHistory
  const formToolHistory = toolCallHistory.filter(item => item.name === 'interactive_form')
  const hasInteractiveForm = formToolHistory.length > 0
  const mainContent = isExpertMessage ? activeExpertResponse?.content || '' : parsed.content
  const pipelineFinalContent =
    isExpertMessage && typeof mergedMessage?.content === 'string'
      ? mergedMessage.content
      : mainContent
  const pipelineBuildInput = useMemo(
    () => ({
      ...mergedMessage,
      content: pipelineFinalContent,
      expertMode: isExpertMessage,
      expertResponses,
    }),
    [mergedMessage, pipelineFinalContent, isExpertMessage, expertResponses],
  )
  const hasPipelineData = useMemo(() => {
    if (
      Array.isArray(mergedMessage?.pipelineTrace?.nodes) &&
      mergedMessage.pipelineTrace.nodes.length > 0
    ) {
      return true
    }
    if (isExpertMessage) {
      return expertResponses.some(
        item =>
          String(item?.content || '').trim().length > 0 ||
          (Array.isArray(item?.streamBlocks) && item.streamBlocks.length > 0) ||
          (Array.isArray(item?.toolCallHistory) && item.toolCallHistory.length > 0) ||
          (Array.isArray(item?.thoughtHistory) && item.thoughtHistory.length > 0),
      )
    }
    return (
      String(mainContent || '').trim().length > 0 ||
      (Array.isArray(mergedMessage?.streamBlocks) && mergedMessage.streamBlocks.length > 0) ||
      (Array.isArray(baseToolCallHistory) && baseToolCallHistory.length > 0)
    )
  }, [
    mergedMessage?.pipelineTrace,
    mergedMessage?.streamBlocks,
    isExpertMessage,
    expertResponses,
    mainContent,
    baseToolCallHistory,
  ])
  const [pipelineTrace, setPipelineTrace] = useState(
    () =>
      (Array.isArray(mergedMessage?.pipelineTrace?.nodes) ? mergedMessage.pipelineTrace : null) ||
      null,
  )
  useEffect(() => {
    setPipelineTrace(
      (Array.isArray(mergedMessage?.pipelineTrace?.nodes) ? mergedMessage.pipelineTrace : null) ||
        null,
    )
  }, [mergedMessage?.id, mergedMessage?.localId, mergedMessage?.pipelineTrace])
  useEffect(() => {
    if (!isPipelineOpen) return
    let canceled = false
    if (Array.isArray(mergedMessage?.pipelineTrace?.nodes)) {
      setPipelineTrace(mergedMessage.pipelineTrace)
    }
    const frame = requestAnimationFrame(() => {
      if (canceled) return
      setPipelineTrace(ensureMessagePipeline(pipelineBuildInput))
    })
    return () => {
      canceled = true
      cancelAnimationFrame(frame)
    }
  }, [isPipelineOpen, pipelineBuildInput, mergedMessage?.pipelineTrace])
  useEffect(() => {
    if (!hasPipelineData || isPipelineOpen) return
    if (
      pipelineTrace?.version >= 5 &&
      Array.isArray(pipelineTrace?.nodes) &&
      pipelineTrace.nodes.length > 0
    ) {
      return
    }
    let canceled = false
    const schedule =
      typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback
        : callback => window.setTimeout(callback, 24)
    const cancelSchedule =
      typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback
        : window.clearTimeout
    const token = schedule(() => {
      if (canceled) return
      setPipelineTrace(ensureMessagePipeline(pipelineBuildInput))
    })
    return () => {
      canceled = true
      cancelSchedule(token)
    }
  }, [hasPipelineData, isPipelineOpen, pipelineTrace, pipelineBuildInput])
  const documentCitationSources = useMemo(
    () => buildDocumentCitationSources(mergedMessage.documentSources),
    [mergedMessage.documentSources],
  )
  const shouldShowWorkflowSourceSummary = resolveShouldShowWorkflowSourceSummary({
    isStreamingMessage,
    webSources: mergedMessage.sources,
    documentCitationSources,
  })
  const displayProviderId = isExpertMessage
    ? activeExpertResponse?.provider || providerId
    : providerId
  const displayModel = isExpertMessage ? activeExpertResponse?.model || null : null

  const formatThoughtContentForDisplay = useCallback(value => {
    const raw = sanitizeDisplayText(String(value || '')).trim()
    if (!raw) return ''

    const decodeJsonString = input => {
      if (typeof input !== 'string') return ''
      try {
        return JSON.parse(`"${input.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      } catch {
        return input
      }
    }

    const toStructuredMarkdown = parsed => {
      if (!parsed || typeof parsed !== 'object') return ''
      const lines = []
      if (parsed.expertPlan) {
        lines.push(String(parsed.expertPlan))
      }
      const responses = Array.isArray(parsed.expertResponses) ? parsed.expertResponses : []
      if (responses.length > 0) {
        lines.push(`\n**专家任务分解**`)
        responses.forEach((item, idx) => {
          const name = String(item?.agentName || item?.agent || `专家${idx + 1}`)
          const emoji = String(item?.agentEmoji || '').trim()
          const task = String(item?.task || '').trim()
          if (task) {
            lines.push(`- ${emoji ? `${emoji} ` : ''}${name}: ${task}`)
          }
        })
      }
      if (lines.length > 0) return lines.join('\n')
      return ''
    }

    try {
      const parsed = JSON.parse(raw)
      const markdown = toStructuredMarkdown(parsed)
      if (markdown) return markdown
    } catch {
      // Streaming partial JSON: extract key fields progressively for readability.
      // Regex modified to capture values even if the closing quote hasn't arrived ensuring streaming support.
      const planMatch = raw.match(/"expertPlan"\s*:\s*"((?:\\.|[^"\\])*)(?:"|$)/)
      // For tasks, we use a global regex to capture all occurrences
      const taskMatches = [...raw.matchAll(/"task"\s*:\s*"((?:\\.|[^"\\])*)(?:"|$)/g)]

      const extracted = []
      if (planMatch?.[1]) {
        extracted.push(decodeJsonString(planMatch[1]))
      }
      if (taskMatches.length > 0) {
        extracted.push(`\n**专家任务分解**`)
        taskMatches.forEach((match, idx) => {
          const task = decodeJsonString(match?.[1] || '')
          // Optional: Try to capture the agent name if available near this task
          // This is a best-effort heuristic for streaming
          if (task) extracted.push(`- 专家${idx + 1}: ${task}`)
        })
      }
      if (extracted.length > 0) return extracted.join('\n')
    }

    return raw
  }, [])

  const normalizedStreamBlocks = useMemo(() => {
    const streamSource =
      isExpertMessage && Array.isArray(activeExpertResponse?.streamBlocks)
        ? activeExpertResponse.streamBlocks
        : mergedMessage?.streamBlocks
    return normalizeMessageStreamBlocks({ streamSource })
  }, [isExpertMessage, activeExpertResponse?.streamBlocks, mergedMessage?.streamBlocks])
  const thoughtExportContent = useMemo(
    () =>
      normalizedStreamBlocks
        .filter(item => item.type === 'reasoning' || item.type === 'thought')
        .map(item => formatThoughtContentForDisplay(item.content))
        .filter(Boolean)
        .join('\n\n'),
    [formatThoughtContentForDisplay, normalizedStreamBlocks],
  )
  const hasStartedAnswerTextStream = useMemo(
    () =>
      normalizedStreamBlocks.some(
        block => block.type === 'text' && typeof block.content === 'string' && block.content.trim(),
      ),
    [normalizedStreamBlocks],
  )

  const resolvedSearchBackends = useMemo(() => {
    return resolveMessageSearchBackends({
      isExpertMessage,
      activeExpertResponse,
      mergedMessage,
      toolCallHistory,
    })
  }, [
    isExpertMessage,
    activeExpertResponse?.searchBackend,
    activeExpertResponse?.searchBackends,
    mergedMessage?.searchBackend,
    mergedMessage?.searchBackends,
    toolCallHistory,
  ])

  const getToolDisplayName = useCallback(
    tool => getToolDisplayNameWithDetails(tool, t, TOOL_TRANSLATION_KEYS),
    [t],
  )
  const isSkillToolCall = useCallback(tool => isSkillToolName(tool?.name), [])
  const getSearchBackendForTool = useCallback(
    tool => resolveSearchBackendForTool(tool, resolvedSearchBackends),
    [resolvedSearchBackends],
  )
  const renderSearchBackendVisual = useCallback(backend => {
    if (!backend) return null
    if (backend === 'auto') return <span className="text-xs leading-none">✨</span>
    // Handle YouTube separately (not in SEARCH_BACKEND_OPTIONS)
    if (backend === 'youtube') {
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      )
    }
    const option = SEARCH_BACKEND_OPTIONS.find(item => item.id === backend)
    if (option?.iconUrl) {
      return <img src={option.iconUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
    }
    return <Globe size={12} className="text-gray-400" />
  }, [])
  const renderToolQueryPreview = useCallback(
    (tool, queryClassName = 'w-full truncate opacity-75') => {
      if (!tool || !Object.keys(TOOL_TRANSLATION_KEYS).includes(tool.name)) return null
      try {
        const args =
          typeof tool.arguments === 'string'
            ? JSON.parse(tool.arguments || '{}')
            : tool.arguments || {}
        if (!args?.query) return null
        const backend = getSearchBackendForTool(tool)
        const backendVisual = renderSearchBackendVisual(backend)
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            {backendVisual && (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100/90 dark:bg-zinc-700/80">
                {backendVisual}
              </span>
            )}
            <span className={queryClassName}>&quot;{args.query}&quot;</span>
          </span>
        )
      } catch {
        return null
      }
    },
    [getSearchBackendForTool, renderSearchBackendVisual],
  )

  const nextMsgForFormCheck = messages[messageIndex + 1]
  // In the new HITL flow, an interrupted form is simply one where
  // the next user message isn't a submission for THIS specific run.
  // However, since we now have runId correlation, we can keep it simple.
  const isFormInterrupted =
    nextMsgForFormCheck && nextMsgForFormCheck.role === 'user' && !nextMsgForFormCheck.hitlRunId

  const isFormWaitingForInput =
    hasInteractiveForm && formToolHistory.some(tc => tc.status !== 'done') && !isFormInterrupted

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

  const getToolArgumentsForDisplay = useCallback(
    tool => getToolArgumentsForDisplayWithResolvedBackends(tool, resolvedSearchBackends),
    [resolvedSearchBackends],
  )

  const parseFormPayload = raw => {
    if (!raw) return null
    if (typeof raw === 'object') return raw
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    }
    return null
  }

  const parseHtmlWidgetPayload = raw => {
    if (!raw) return null
    let payload = raw
    if (typeof raw === 'string') {
      try {
        payload = JSON.parse(raw)
      } catch {
        return {
          type: 'html_widget_error',
          code: 'invalid_json',
          message: 'Widget payload is not valid JSON.',
        }
      }
    }
    if (!payload || typeof payload !== 'object') return null

    const payloadType = String(payload.type || '').trim()
    if (payloadType === 'html_widget_error') {
      return {
        type: 'html_widget_error',
        code: String(payload.code || 'invalid_payload'),
        message: String(payload.message || 'HTML widget failed to render.'),
      }
    }

    if (payloadType !== 'html_widget') {
      return {
        type: 'html_widget_error',
        code: 'invalid_schema',
        message: 'Widget payload does not match supported structure.',
      }
    }

    const html = typeof payload.html === 'string' ? payload.html.trim() : ''
    if (!html) {
      return {
        type: 'html_widget_error',
        code: 'empty_html',
        message: 'No HTML content available.',
      }
    }

    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    const rawHeight = Number(payload.height)
    const height = Number.isFinite(rawHeight) ? Math.max(220, Math.min(rawHeight, 900)) : 360
    return {
      type: 'html_widget',
      title,
      html,
      height,
    }
  }

  const parsePptxPayload = raw => {
    if (!raw) return null
    let payload = raw
    if (typeof raw === 'string') {
      try {
        payload = JSON.parse(raw)
      } catch {
        return null
      }
    }
    if (!payload || typeof payload !== 'object') return null
    if (String(payload.type || '').trim() !== 'pptx_file') return null

    const downloadUrl = typeof payload.download_url === 'string' ? payload.download_url.trim() : ''
    if (!downloadUrl) return null

    const filename =
      typeof payload.filename === 'string' ? payload.filename.trim() : 'presentation.pptx'
    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    const slideCount = Number(payload.slide_count)
    const expiresAt = typeof payload.expires_at === 'string' ? payload.expires_at.trim() : ''
    const previewHtml = typeof payload.preview_html === 'string' ? payload.preview_html.trim() : ''
    const previewHeightRaw = Number(payload.preview_height)
    const previewHeight = Number.isFinite(previewHeightRaw)
      ? Math.max(220, Math.min(previewHeightRaw, 900))
      : 560
    const qaIssuesRaw = Array.isArray(payload.qa_issues)
      ? payload.qa_issues.map(item => String(item || '').trim()).filter(Boolean)
      : []
    const renderModeUsed =
      typeof payload.render_mode_used === 'string' ? payload.render_mode_used.trim() : ''
    return {
      type: 'pptx_file',
      filename: filename || 'presentation.pptx',
      title,
      slideCount: Number.isFinite(slideCount) ? Math.max(0, Math.floor(slideCount)) : 0,
      downloadUrl,
      expiresAt,
      previewHtml,
      previewHeight,
      qaIssuesRaw,
      renderModeUsed,
    }
  }

  const resolveBackendDownloadUrl = useCallback(rawUrl => {
    const value = String(rawUrl || '').trim()
    if (!value) return ''
    if (/^https?:\/\//i.test(value)) return value
    const backendBase = String(getBackendUrl() || '').replace(/\/+$/, '')
    if (!backendBase) return value
    return value.startsWith('/') ? `${backendBase}${value}` : `${backendBase}/${value}`
  }, [])

  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))
  const mainContentRef = useRef(null)
  const researchExportRef = useRef(null)
  const thoughtExportRef = useRef(null)
  const containerRef = useRef(null) // Local ref for the wrapper

  // State to track copy success
  const [isCopied, setIsCopied] = useState(false)
  const [activeImageUrl, setActiveImageUrl] = useState(null)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [failedImageUrls, setFailedImageUrls] = useState(new Set())
  // Use ref to store image metadata to avoid triggering markdownComponents rebuild
  const imageMetadataRef = useRef([])
  // Use ref to store video metadata to avoid triggering markdownComponents rebuild
  const videoMetadataRef = useRef([])

  // Extract all image search results from toolCallHistory to get rich metadata (title, source)
  // Update ref without triggering re-renders of markdownComponents
  const allImageResults = useMemo(() => {
    const results = extractMessageImageResults({
      toolCallHistory,
      getHostname,
    })
    // Update ref for use in MessageImage without triggering deps
    imageMetadataRef.current = results
    return results
  }, [toolCallHistory])

  // Extract video search results to get title for iframe accessibility
  // Update ref without triggering re-renders of markdownComponents
  const allVideoResults = useMemo(() => {
    const results = extractMessageVideoResults({ toolCallHistory })
    videoMetadataRef.current = results
    return results
  }, [toolCallHistory])

  // Extract all images rendered in the mainContent markdown
  const messageImages = useMemo(() => {
    return extractMessageImageEntries({
      mainContent,
      allImageResults,
    })
  }, [mainContent, allImageResults])

  // Use ref to store messageImages for stable openGallery callback
  const messageImagesRef = useRef(messageImages)
  messageImagesRef.current = messageImages

  // Stable callback - uses ref to avoid dependency on messageImages
  const openGallery = useCallback(imgSrc => {
    const index = messageImagesRef.current.findIndex(img => img.src === imgSrc)
    if (index !== -1) {
      setGalleryIndex(index)
      setIsGalleryOpen(true)
    } else {
      // Fallback for images not in markdown but somehow rendered
      setActiveImageUrl(imgSrc)
    }
  }, [])

  // Stable callback for image errors to prevent re-renders
  const handleImageError = useCallback(url => {
    setFailedImageUrls(prev => {
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }, [])

  // Sync gallery index and close if empty
  useEffect(() => {
    if (isGalleryOpen) {
      if (messageImages.length === 0) {
        setIsGalleryOpen(false)
      } else if (galleryIndex >= messageImages.length) {
        setGalleryIndex(Math.max(0, messageImages.length - 1))
      }
    }
  }, [messageImages.length, isGalleryOpen, galleryIndex])

  // Handle gallery keyboard navigation
  useEffect(() => {
    if (!isGalleryOpen) return

    const handleKeyDown = e => {
      if (e.key === 'Escape') setIsGalleryOpen(false)
      if (e.key === 'ArrowLeft') {
        setGalleryIndex(prev => (prev - 1 + messageImages.length) % messageImages.length)
      }
      if (e.key === 'ArrowRight') {
        setGalleryIndex(prev => (prev + 1) % messageImages.length)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isGalleryOpen, messageImages.length])

  // Utility function to copy text to clipboard
  const copyToClipboard = useCallback(text => copyTextToClipboard(text), [])

  const renderPlainCodeBlock = useCallback(
    (codeText, language) => (
      <div className="group bg-user-bubble/20 relative mb-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-700 dark:bg-zinc-800/40">
        <div className="bg-user-bubble/50 flex items-center justify-between border-b border-gray-200 px-4 py-2 text-[11px] font-semibold text-gray-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-gray-300">
          <span>{String(language || 'CODE').toUpperCase()}</span>
          <button
            onClick={() => copyToClipboard(codeText)}
            className="rounded-md bg-gray-200 px-2 py-1 text-[11px] text-gray-700 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 dark:bg-zinc-700 dark:text-gray-200"
          >
            Copy
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

  const FormStatusBadge = ({ waiting }) => {
    const { t } = useTranslation()
    const statusLabel = waiting
      ? t('messageBubble.formStatus.waiting')
      : t('messageBubble.formStatus.submitted')
    const statusIcon = waiting ? (
      <Clock size={14} strokeWidth={2.5} />
    ) : (
      <Check size={14} strokeWidth={3} />
    )

    const lineColorClass = waiting
      ? 'from-sky-200/50 via-sky-300/50 to-transparent dark:from-sky-800/30 dark:via-sky-700/30'
      : 'from-emerald-200/50 via-emerald-300/50 to-transparent dark:from-emerald-800/30 dark:via-emerald-700/30'

    const badgeClass = waiting
      ? 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/50'
      : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50'

    return (
      <div className="my-4 flex w-full items-center gap-3 opacity-90">
        <div className={clsx('h-px flex-1 bg-linear-to-r', lineColorClass)} />

        <div
          className={clsx(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm transition-all duration-300',
            'text-[11px] font-bold tracking-wider uppercase',
            badgeClass,
          )}
        >
          {statusIcon}
          <span>{statusLabel}</span>
        </div>

        <div className={clsx('h-px flex-1 bg-linear-to-l', lineColorClass)} />
      </div>
    )
  }

  const interleavedContent = useMemo(
    () =>
      buildInterleavedContent({
        mainContent,
        normalizedStreamBlocks,
        isDeepResearch,
        toolCallHistory,
      }),
    [mainContent, normalizedStreamBlocks, isDeepResearch, toolCallHistory],
  )

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

  const isNodeInAnswerScope = node => {
    if (!node) return false
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    return Boolean(element?.closest?.('[data-answer-scope="true"]'))
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

    if (!isNodeInAnswerScope(selection.anchorNode) || !isNodeInAnswerScope(selection.focusNode)) {
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

  const [isWorkflowExpanded, setIsWorkflowExpanded] = useState(false)

  useEffect(() => {
    setIsWorkflowExpanded(false)
  }, [message?.id])

  const { showConfirmation } = useAppContext()
  const isUser = message.role === 'user'

  const planContent = typeof message?.researchPlan === 'string' ? message.researchPlan.trim() : ''
  const parsedResearchPlan = useMemo(() => {
    if (!planContent) return null
    try {
      const parsed = JSON.parse(planContent)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }, [planContent])

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
  const planStepsForCards = useMemo(() => {
    if (!parsedResearchPlan || !Array.isArray(parsedResearchPlan.plan)) return []
    return parsedResearchPlan.plan.filter(step => step && typeof step === 'object')
  }, [parsedResearchPlan])

  const { handleDownloadPdf, handleDownloadWord } = useMessageExport({
    message,
    planMarkdown,
    thoughtContent: thoughtExportContent,
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
      const resolvedSources = resolveDefaultMobileDrawerSources({
        selectedSources,
        webSources: mergedMessage.sources,
        documentCitationSources,
      })
      setMobileDrawerSources(resolvedSources)
      setMobileDrawerTitle(title || t('sources.title'))
      setIsMobileDrawerOpen(true)
    },
    [documentCitationSources, mergedMessage.sources, t],
  )

  const isStreaming = isStreamingMessage
  const persistedFinalAnswerDurationMs = Number.isFinite(mergedMessage?.finalAnswerDurationMs)
    ? Number(mergedMessage.finalAnswerDurationMs)
    : null
  const answerWallClockActiveStartRef = useRef(null)
  const answerWallClockAccumulatedMsRef = useRef(0)
  const [wallClockElapsedSec, setWallClockElapsedSec] = useState(0)
  const [wallClockFinalSec, setWallClockFinalSec] = useState(null)
  const searchLiveStartRef = useRef(null)
  const [searchLiveElapsedSec, setSearchLiveElapsedSec] = useState(0)

  const [expandedToolsSteps, setExpandedToolsSteps] = useState(new Set())
  const thoughtDurationMemoryRef = useRef(0)
  const toggleToolsStep = useCallback(idx => {
    setExpandedToolsSteps(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  useEffect(() => {
    answerWallClockActiveStartRef.current = null
    answerWallClockAccumulatedMsRef.current = 0
    thoughtDurationMemoryRef.current = 0
    searchLiveStartRef.current = null
    setWallClockElapsedSec(0)
    setWallClockFinalSec(null)
    setSearchLiveElapsedSec(0)
    setExpandedToolsSteps(new Set())
  }, [mergedMessage?.id, mergedMessage?.localId, messageIndex])

  useEffect(() => {
    const hasAnswerOutputSignal =
      hasStartedAnswerTextStream ||
      (isExpertMessage
        ? typeof mainContent === 'string' && mainContent.trim().length > 0
        : typeof message?.content === 'string' && message.content.trim().length > 0)
    const lastStreamType =
      normalizedStreamBlocks.length > 0
        ? String(normalizedStreamBlocks[normalizedStreamBlocks.length - 1]?.type || '')
        : ''
    // If stream blocks are available, only count wall-clock while actual text is streaming.
    // This keeps fallback timer paused during interleaved reasoning/tool phases.
    const shouldRunAnswerTimer =
      isStreaming &&
      hasAnswerOutputSignal &&
      (normalizedStreamBlocks.length === 0 || lastStreamType === 'text')

    if (shouldRunAnswerTimer) {
      if (!Number.isFinite(answerWallClockActiveStartRef.current)) {
        answerWallClockActiveStartRef.current = Date.now()
      }
      const tick = () => {
        const activeStart = Number.isFinite(answerWallClockActiveStartRef.current)
          ? answerWallClockActiveStartRef.current
          : Date.now()
        const totalMs = answerWallClockAccumulatedMsRef.current + (Date.now() - activeStart)
        setWallClockElapsedSec(Math.max(0, Math.round(totalMs / 1000)))
      }
      tick()
      const timer = window.setInterval(tick, 500)
      return () => window.clearInterval(timer)
    }

    if (Number.isFinite(answerWallClockActiveStartRef.current)) {
      answerWallClockAccumulatedMsRef.current += Math.max(
        0,
        Date.now() - answerWallClockActiveStartRef.current,
      )
      answerWallClockActiveStartRef.current = null
      setWallClockElapsedSec(
        Math.max(0, Math.round(answerWallClockAccumulatedMsRef.current / 1000)),
      )
    }

    if (!isStreaming && answerWallClockAccumulatedMsRef.current > 0) {
      setWallClockFinalSec(Math.max(0, Math.round(answerWallClockAccumulatedMsRef.current / 1000)))
    }

    return undefined
  }, [
    isStreaming,
    hasStartedAnswerTextStream,
    isExpertMessage,
    mainContent,
    message?.content,
    normalizedStreamBlocks,
  ])

  const answerTextDurationMsFromBlocks = useMemo(
    () =>
      normalizedStreamBlocks
        .filter(
          block =>
            block.type === 'text' &&
            typeof block.content === 'string' &&
            block.content.trim().length > 0 &&
            typeof block.durationMs === 'number' &&
            block.durationMs > 0,
        )
        .reduce((sum, block) => sum + block.durationMs, 0),
    [normalizedStreamBlocks],
  )
  const answerGenerationDurationMs = useMemo(() => {
    if (Number.isFinite(persistedFinalAnswerDurationMs) && persistedFinalAnswerDurationMs > 0) {
      return persistedFinalAnswerDurationMs
    }
    if (answerTextDurationMsFromBlocks > 0) {
      return answerTextDurationMsFromBlocks
    }
    if (typeof wallClockFinalSec === 'number' && wallClockFinalSec > 0) {
      return wallClockFinalSec * 1000
    }
    if (typeof wallClockElapsedSec === 'number' && wallClockElapsedSec > 0) {
      return wallClockElapsedSec * 1000
    }
    return 0
  }, [
    answerTextDurationMsFromBlocks,
    persistedFinalAnswerDurationMs,
    wallClockElapsedSec,
    wallClockFinalSec,
  ])

  const hasMainText = (() => {
    if (isExpertMessage) {
      return typeof mainContent === 'string' && mainContent.trim().length > 0
    }
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
  const shouldShowInitialSkeleton = !hasMainText && isStreaming && !isDeepResearch

  const skeletonFadeMs = 320
  const [renderInitialSkeleton, setRenderInitialSkeleton] = useState(shouldShowInitialSkeleton)
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(shouldShowInitialSkeleton)
  useEffect(() => {
    if (shouldShowInitialSkeleton) {
      setRenderInitialSkeleton(true)
      const frame = requestAnimationFrame(() => setShowInitialSkeleton(true))
      return () => cancelAnimationFrame(frame)
    }
    setShowInitialSkeleton(false)
    const timer = setTimeout(() => setRenderInitialSkeleton(false), skeletonFadeMs)
    return () => clearTimeout(timer)
  }, [shouldShowInitialSkeleton, skeletonFadeMs])
  const researchStatusText = DEEP_RESEARCH_STATUS_MESSAGES[0]

  const CodeBlock = useMemo(
    () =>
      createCodeBlockRenderer({
        ReactSyntaxHighlighter: SyntaxHighlighter,
        isDark,
        oneDark,
        oneLight,
        StreamdownComponent: Streamdown,
        mermaidOptions,
        copyToClipboard,
      }),
    [copyToClipboard, isDark, mermaidOptions],
  )

  const headingCounterRef = useRef(0)

  const getNextHeadingId = useCallback(() => {
    const id = buildHeadingId(messageIndex, headingCounterRef.current)
    headingCounterRef.current += 1
    return id
  }, [messageIndex])

  const createHeadingComponent = useCallback(
    (Tag, className, withAnchors) =>
      createHeadingRenderer({
        Tag,
        className,
        withAnchors,
        getNextHeadingId,
        parseChildrenWithEmojis,
      }),
    [getNextHeadingId, parseChildrenWithEmojis],
  )

  // Handle interactive form submission
  const handleFormSubmit = useCallback(
    formSubmission => {
      if (onFormSubmit) {
        onFormSubmit(formSubmission)
      }
    },
    [onFormSubmit],
  )

  const MarkdownLinkRenderer = useMemo(
    () =>
      createMarkdownLinkRenderer({
        InTableContext,
        sanitizeMarkdownUrl,
        CitationChip,
        documentCitationSources,
        isMobile,
        handleMobileSourceClick,
        t,
        parseChildrenWithEmojis,
        getVideoEmbedUrl,
        getVideoPlatform,
        videoMetadataRef,
        InlineVideoEmbed,
        YoutubeLogo,
        BilibiliLogo,
        clsx,
      }),
    [
      documentCitationSources,
      getVideoEmbedUrl,
      getVideoPlatform,
      handleMobileSourceClick,
      isMobile,
      parseChildrenWithEmojis,
      t,
    ],
  )

  const markdownComponents = useMemo(
    () =>
      createMarkdownComponents({
        React,
        CodeBlock,
        parseChildrenWithEmojis,
        createHeadingComponent,
        MarkdownLinkRenderer,
        sanitizeMarkdownUrl,
        MessageImage,
        openGallery,
        failedImageUrls,
        imageMetadataRef,
        handleImageError,
        InTableContext,
      }),
    [
      CodeBlock,
      MarkdownLinkRenderer,
      createHeadingComponent,
      failedImageUrls,
      handleImageError,
      openGallery,
      parseChildrenWithEmojis,
    ],
  )

  const markdownComponentsWithAnchors = useMemo(
    () =>
      createMarkdownComponentsWithAnchors({
        markdownComponents,
        messageIndex,
        parseChildrenWithEmojis,
      }),
    [markdownComponents, messageIndex, parseChildrenWithEmojis],
  )

  const workflowThoughtParts = useMemo(
    () => getWorkflowThoughtParts(interleavedContent),
    [interleavedContent],
  )
  const isDeepThinkingStreaming = isStreaming && !hasMainText && workflowThoughtParts.length > 0
  const workflowTextParts = useMemo(
    () => getWorkflowTextParts(interleavedContent),
    [interleavedContent],
  )
  const contentPartsOutsideWorkflow = useMemo(
    () =>
      buildContentPartsOutsideWorkflow({
        interleavedContent,
        isExpertMessage,
        compactStreamingTextBlocks,
        parsePptxPayload,
      }),
    [compactStreamingTextBlocks, interleavedContent, isExpertMessage, parsePptxPayload],
  )
  const allSources = useMemo(
    () =>
      buildAllSources({
        webSources: mergedMessage.sources,
        documentCitationSources,
      }),
    [documentCitationSources, mergedMessage.sources],
  )
  const shouldShowSourcesDrawer = !isStreaming && allSources.length > 0
  const processSteps = useMemo(() => {
    return buildMessageProcessSteps({
      isDeepResearch,
      normalizedStreamBlocks,
      toolCallHistory,
      mergedSources: mergedMessage.sources,
    })
  }, [
    isDeepResearch,
    mergedMessage.sources,
    normalizedStreamBlocks,
    toolCallHistory,
  ])
  const hasFormSubmissionStatus = useMemo(
    () => toolCallHistory.some(item => item?.name === 'form_submission_status'),
    [toolCallHistory],
  )
  const renderToolItems = useCallback(
    (items, idx) => {
      const regularTools = (Array.isArray(items) ? items : []).filter(
        item => item.name !== 'interactive_form' && item.name !== 'form_submission_status',
      )
      if (regularTools.length === 0) return null

      const isChinese = i18n.language && i18n.language.startsWith('zh')
      const separator = isChinese ? '、' : ','
      const uniqueTools = Array.from(
        new Map(
          regularTools.map(tool => [
            `${tool.name}::${typeof getToolDisplayName === 'function' ? getToolDisplayName(tool) : tool.name}`,
            tool,
          ]),
        ).values(),
      )

      const expandedKey = `inline-${idx}`
      const isExpanded = expandedToolsSteps.has(expandedKey)
      const displayTools = isExpanded ? uniqueTools : uniqueTools.slice(0, 2)
      const hasMore = uniqueTools.length > 2

      const prefixLabel = t('messageBubble.workflowToolCalledPrefix', '已调用')

      return (
        <div
          key={`tools-inline-row-${idx}`}
          className="group/toolrow mb-4 flex w-full items-center gap-3"
        >
          {/* Label Section */}
          <div className="shrink-0 text-[11px] leading-none font-bold tracking-wider text-gray-400 uppercase select-none dark:text-zinc-500">
            {prefixLabel}
          </div>

          {/* Tools Flow Section */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {displayTools.map((tool, toolIndex) => {
              const ToolIcon = getToolIconComponent(tool.name)
              const toolName =
                typeof getToolDisplayName === 'function' ? getToolDisplayName(tool) : tool.name

              return (
                <div
                  key={`${tool.name}-${toolIndex}`}
                  className="group/toolitem flex items-center gap-1.5 rounded-lg border border-gray-200/60 bg-white/50 px-2.5 py-1.5 transition-all hover:border-blue-200 hover:bg-white hover:shadow-sm dark:border-zinc-700/50 dark:bg-zinc-800/30 dark:hover:border-blue-900/50 dark:hover:bg-zinc-800/80"
                >
                  {ToolIcon ? (
                    <ToolIcon
                      size={13}
                      className="shrink-0 text-gray-400 transition-colors group-hover/toolitem:text-blue-500"
                    />
                  ) : (
                    <Wrench
                      size={13}
                      className="shrink-0 text-gray-400 transition-colors group-hover/toolitem:text-blue-500"
                    />
                  )}
                  <span className="truncate text-xs font-medium text-gray-600 transition-colors group-hover/toolitem:text-gray-900 dark:text-zinc-400 dark:group-hover/toolitem:text-zinc-200">
                    {toolName}
                  </span>
                </div>
              )
            })}
            {!isExpanded && hasMore && (
              <div className="flex h-7 items-center px-1 text-gray-300 dark:text-zinc-700">
                <span className="text-sm tracking-widest">...</span>
              </div>
            )}
          </div>

          {/* Action Section */}
          {hasMore && (
            <div
              onClick={() => toggleToolsStep(expandedKey)}
              className="hover:text-primary-600 dark:hover:text-primary-400 mt-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
              title={
                isExpanded
                  ? t('common.collapse', '收起')
                  : t('common.expand', `展开剩余 ${uniqueTools.length - 2} 项`)
              }
            >
              <div
                className={clsx(
                  'transition-transform duration-300',
                  isExpanded ? 'rotate-180' : 'rotate-0',
                )}
              >
                <ChevronDown size={16} />
              </div>
            </div>
          )}
        </div>
      )
    },
    [t, getToolDisplayName, i18n.language, expandedToolsSteps, toggleToolsStep],
  )
  const renderWorkflowToolCapsule = useCallback(
    (item, compact = false) => {
      if (!item) return null

      const ToolIcon = getToolIconComponent(item.name)
      const isError = item.status === 'error'
      const isCalling = item.status === 'calling' || item.status === 'running'
      const toolName = getToolDisplayName(item)
      const statusLabel = isError
        ? t('messageBubble.toolStatusError', '失败')
        : isCalling
          ? t('messageBubble.toolStatusCalling', '调用中')
          : t('messageBubble.toolStatusDone', '已完成')
      return (
        <div
          className={clsx(
            'inline-flex max-w-full items-center rounded-full border shadow-[0_1px_2px_rgba(0,0,0,0.02)]',
            compact ? 'gap-1.5 px-2.5 py-1.5 text-xs!' : 'x-2.5 gap-2 py-1.5 text-xs!',
            isError
              ? 'border-red-200/70 bg-red-50/70 text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
              : 'border-primary-200/35 dark:border-primary-700/20 bg-white/65 text-gray-600 dark:bg-zinc-800/40 dark:text-gray-300',
          )}
        >
          <span
            className={clsx('flex min-w-0 items-center font-medium', compact ? 'gap-1' : 'gap-1.5')}
          >
            {isError ? (
              <AlertTriangle size={compact ? 13 : 14} className="shrink-0" />
            ) : ToolIcon ? (
              <ToolIcon size={compact ? 13 : 14} className="shrink-0 opacity-70" />
            ) : (
              <Wrench size={compact ? 13 : 14} className="shrink-0 opacity-70" />
            )}
            <span className="truncate">{toolName}</span>
          </span>
          {isCalling && <DotLoader size="sm" />}
          <span className="sr-only">{statusLabel}</span>
        </div>
      )
    },
    [t, getToolDisplayName],
  )
  const expertPlanBlock = useMemo(
    () => workflowTextParts.find(part => typeof part?.content === 'string' && part.content.trim()),
    [workflowTextParts],
  )

  const renderToolLoadingCard = useMemo(
    () =>
      createToolLoadingCardRenderer({
        React,
        DotLoader,
        t,
      }),
    [t],
  )

  const renderInteractiveFormItem = useMemo(
    () =>
      createInteractiveFormItemRenderer({
        React,
        parseFormPayload,
        messages,
        messageIndex,
        handleFormSubmit,
        messageId: message.id,
        developerMode,
        setActiveToolDetail,
        InteractiveForm,
        isStreaming,
        getToolDisplayName,
        t,
        renderToolLoadingCard,
      }),
    [
      developerMode,
      getToolDisplayName,
      handleFormSubmit,
      isStreaming,
      message.id,
      messageIndex,
      messages,
      parseFormPayload,
      renderToolLoadingCard,
      setActiveToolDetail,
      t,
    ],
  )

  const renderHtmlWidgetItem = useMemo(
    () =>
      createHtmlWidgetItemRenderer({
        React,
        parseHtmlWidgetPayload,
        isStreaming,
        getToolDisplayName,
        t,
        renderToolLoadingCard,
        HtmlWidgetCard,
      }),
    [getToolDisplayName, isStreaming, parseHtmlWidgetPayload, renderToolLoadingCard, t],
  )

  const renderPptxFileItem = useMemo(
    () =>
      createPptxFileItemRenderer({
        React,
        parsePptxPayload,
        isStreaming,
        getToolDisplayName,
        t,
        renderToolLoadingCard,
        PptxResultCard,
        resolveBackendDownloadUrl,
      }),
    [
      getToolDisplayName,
      isStreaming,
      parsePptxPayload,
      renderToolLoadingCard,
      resolveBackendDownloadUrl,
      t,
    ],
  )

  const firstTextPartDisplayIndex = contentPartsOutsideWorkflow.findIndex(
    part => part.type === 'text',
  )
  const renderedMainContent = contentPartsOutsideWorkflow.map((part, idx) => {
    if (part.type === 'text') {
      const sanitizedMainText =
        isExpertMessage && typeof part.content === 'string'
          ? normalizeExpertBrokenTokenLines(part.content)
          : sanitizeDisplayText(part.content)
      const showStatusBeforeText = hasFormSubmissionStatus && idx === firstTextPartDisplayIndex
      const isTextEmpty = !sanitizedMainText || !sanitizedMainText.trim()

      if (isTextEmpty && !showStatusBeforeText) return null

      return (
        <React.Fragment key={part.key || `text-outside-${idx}`}>
          {showStatusBeforeText && <FormStatusBadge waiting={false} />}
          {!isTextEmpty && (
            <div
              data-answer-scope="true"
              className={clsx(
                'mb-4 transition-all duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]',
                hasMainText ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
              )}
            >
              <Streamdown
                mermaid={mermaidOptions}
                remarkPlugins={[remarkGfm]}
                components={markdownComponentsWithAnchors}
                isAnimating={isStreaming}
              >
                {sanitizedMainText}
              </Streamdown>
            </div>
          )}
        </React.Fragment>
      )
    }

    if (part.type === 'tools') {
      if (isDeepResearch) return null

      return renderToolItems(part.items, part.key || idx)
    }

    if (part.type === 'interactive_form') {
      return (
        <React.Fragment key={part.key || `interactive-form-outside-${idx}`}>
          {part.items.map((item, formIdx) =>
            renderInteractiveFormItem(item, `form-inline-${part.key || idx}-${item.id || formIdx}`),
          )}
        </React.Fragment>
      )
    }

    if (part.type === 'html_widget') {
      return (
        <React.Fragment key={part.key || `html-widget-outside-${idx}`}>
          {part.items.map((item, widgetIdx) =>
            renderHtmlWidgetItem(item, `html-widget-${part.key || idx}-${item.id || widgetIdx}`),
          )}
        </React.Fragment>
      )
    }

    if (part.type === 'pptx_file') {
      return (
        <React.Fragment key={part.key || `pptx-file-outside-${idx}`}>
          {Number(part.retryCountHidden) > 0 ? (
            <div className="mb-3 text-xs text-zinc-400">
              {t('messageBubble.pptRetriesHidden', {
                defaultValue: 'Earlier PPT attempts were hidden. Showing the latest result.',
              })}
            </div>
          ) : null}
          {part.items.map((item, fileIdx) =>
            renderPptxFileItem(item, `pptx-file-${part.key || idx}-${item.id || fileIdx}`),
          )}
        </React.Fragment>
      )
    }

    return null
  })

  const targetAgentId = message.agentId || message.agent_id
  const targetAgent = useMemo(() => {
    if (!targetAgentId) return null
    return agents.find(a => String(a.id) === String(targetAgentId))
  }, [agents, targetAgentId])

  const handleAgentClick = useCallback(
    e => {
      if (targetAgent && onEditAgent) {
        e.stopPropagation()
        onEditAgent(targetAgent)
      }
    },
    [targetAgent, onEditAgent],
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
    const contentText =
      typeof contentToRender === 'string' ? contentToRender : String(contentToRender ?? '')
    const highlightedParts = splitTextWithUrls(contentText)

    // Check if this user message initiated a Deep Research task
    const nextMessage = messages[messageIndex + 1]
    const isDeepResearchContext =
      !!message?.deepResearch ||
      !!nextMessage?.deepResearch ||
      nextMessage?.agentName === 'Deep Research Agent' ||
      nextMessage?.agent_name === 'Deep Research Agent'
    const nextUserIndex = messages.findIndex((m, idx) => idx > messageIndex && m.role === 'user')
    const replyScanEnd = nextUserIndex === -1 ? messages.length : nextUserIndex
    const hasAssistantReplyForCurrentQuestion = messages
      .slice(messageIndex + 1, replyScanEnd)
      .some(m => m?.role === 'ai')
    const canResendThisQuestion =
      !!onUserRegenerate && !isDeepResearchContext && !hasAssistantReplyForCurrentQuestion

    return (
      <UserMessageBubble
        message={message}
        messageId={messageId}
        bubbleRef={bubbleRef}
        containerRef={containerRef}
        handleMouseUp={handleMouseUp}
        handleTouchEnd={handleTouchEnd}
        handleContextMenu={handleContextMenu}
        activeImageUrl={activeImageUrl}
        setActiveImageUrl={setActiveImageUrl}
        t={t}
        i18nLanguage={i18n.language}
        isMobile={isMobile}
        isDeepResearchContext={isDeepResearchContext}
        contentToRender={contentToRender}
        quoteToRender={quoteToRender}
        imagesToRender={imagesToRender}
        canResendThisQuestion={canResendThisQuestion}
        isLoading={isLoading}
        showConfirmation={showConfirmation}
        onUserRegenerate={onUserRegenerate}
        onEdit={onEdit}
        copyToClipboard={copyToClipboard}
        setIsCopied={setIsCopied}
        isCopied={isCopied}
        onDelete={onDelete}
      />
    )
  }

  const providerMeta = PROVIDER_META[displayProviderId] || {
    label: displayProviderId || 'AI',
    id: displayProviderId,
    fallback: 'AI',
  }

  // Dynamic Agent Info Logic
  const expertAgentName = isExpertMessage ? activeExpertResponse?.agentName : null
  const expertAgentEmoji = isExpertMessage ? activeExpertResponse?.agentEmoji : null
  const expertAgent = isExpertMessage
    ? agents.find(a => String(a.id) === String(activeExpertResponse?.agentId || ''))
    : null

  const resolvedModel = displayModel || message.model || defaultModel || 'default model'
  const agentName = expertAgentName || message.agentName || message.agent_name || null
  const agentEmoji = expertAgentEmoji || message.agentEmoji || message.agent_emoji || ''
  const displayAgent = expertAgent || targetAgent || null
  const agentIsDefault =
    !isExpertMessage && (message.agentIsDefault ?? message.agent_is_default ?? false)
  const agentIsDeepResearch =
    message.agent_name == 'Deep Research Agent' || message.agentName == 'Deep Research Agent'
      ? true
      : false

  const displayAgentName = agentIsDefault
    ? t('agents.defaults.name')
    : agentIsDeepResearch
      ? t('deepResearch.agentName')
      : agentName
  const displayAgentShape = getAgentAvatarShape(displayAgent)
  const agentBannerImage = getAgentBannerImage(displayAgent)
  const hasAgentBanner = hasManualAgentBanner(displayAgent)

  const researchPlanLoading = Boolean(message?.researchPlanLoading)
  const researchSteps = useMemo(() => {
    const steps = Array.isArray(message.researchSteps) ? [...message.researchSteps] : []
    const toNum = value => {
      const num = Number(value)
      return Number.isFinite(num) ? num : null
    }
    steps.sort((a, b) => {
      const aNum = toNum(a?.step)
      const bNum = toNum(b?.step)
      if (aNum !== null && bNum !== null) return aNum - bNum
      if (aNum !== null) return -1
      if (bNum !== null) return 1
      const aOrder = Number.isFinite(a?.streamOrder)
        ? Number(a.streamOrder)
        : Number.MAX_SAFE_INTEGER
      const bOrder = Number.isFinite(b?.streamOrder)
        ? Number(b.streamOrder)
        : Number.MAX_SAFE_INTEGER
      return aOrder - bOrder
    })
    return steps
  }, [message.researchSteps])
  const hasResearchSteps = researchSteps.length > 0
  const hasActiveResearchStep = researchSteps.some(
    step => step.status === 'running' || step.status === 'pending',
  )
  const shouldShowPlanStatus = isDeepResearch && researchPlanLoading
  const totalResearchSteps = useMemo(() => {
    if (!hasResearchSteps) return 0
    const maxStep = researchSteps.reduce((max, step) => {
      const value = Number(step?.step)
      return Number.isFinite(value) ? Math.max(max, value) : max
    }, 0)
    const declaredTotal = researchSteps.reduce((max, step) => {
      const value = Number(step?.total)
      return Number.isFinite(value) ? Math.max(max, value) : max
    }, 0)
    return Math.max(maxStep, declaredTotal, researchSteps.length)
  }, [hasResearchSteps, researchSteps])
  const researchProgressPercent = useMemo(() => {
    if (!hasResearchSteps || totalResearchSteps <= 0) return 0
    const completedCount = researchSteps.filter(
      step => step?.status === 'done' || step?.status === 'error',
    ).length
    const runningCount = researchSteps.filter(step => step?.status === 'running').length
    let progressUnits = completedCount
    if (runningCount > 0 && completedCount < totalResearchSteps) {
      progressUnits += 0.5
    }
    if (!isStreaming && !hasActiveResearchStep) {
      progressUnits = totalResearchSteps
    }
    const raw = (progressUnits / totalResearchSteps) * 100
    return Math.max(0, Math.min(100, Math.round(raw)))
  }, [hasResearchSteps, totalResearchSteps, researchSteps, isStreaming, hasActiveResearchStep])
  const researchStepsDurationMs = useMemo(
    () =>
      researchSteps.reduce(
        (sum, step) => sum + (typeof step.durationMs === 'number' ? step.durationMs : 0),
        0,
      ),
    [researchSteps],
  )
  const deepResearchCompletedDurationSec = useMemo(() => {
    if (!isDeepResearch) return null

    const totalMs = researchStepsDurationMs + answerGenerationDurationMs
    return totalMs > 0 ? Math.max(0, Math.round(totalMs / 1000)) : 0
  }, [answerGenerationDurationMs, isDeepResearch, researchStepsDurationMs])
  const deepResearchHeaderText = useMemo(() => {
    if (!isDeepResearch) return ''
    if (!isStreaming) {
      return t('messageBubble.completedResearch', {
        duration: Math.max(0, Number(deepResearchCompletedDurationSec) || 0),
      })
    }
    if (shouldShowPlanStatus && !hasResearchSteps) {
      return t('messageBubble.researchPlanningInProgress', '研究规划中')
    }
    if (hasResearchSteps) {
      return `${t('chat.deepResearchResearching', '正在研究中')} (${researchProgressPercent}%)`
    }
    return t('messageBubble.statusThinking', '正在思考分析')
  }, [
    isDeepResearch,
    isStreaming,
    shouldShowPlanStatus,
    hasResearchSteps,
    researchProgressPercent,
    deepResearchCompletedDurationSec,
    t,
  ])

  const resolvedRelatedQuestions = (() => {
    const direct = mergedMessage.related
    if (Array.isArray(direct)) return direct
    if (Array.isArray(mergedMessage.relatedQuestions)) return mergedMessage.relatedQuestions
    if (Array.isArray(mergedMessage.related_questions)) return mergedMessage.related_questions
    if (typeof direct === 'string') {
      try {
        const parsed = JSON.parse(direct)
        if (Array.isArray(parsed)) return parsed
        if (Array.isArray(parsed?.questions)) return parsed.questions
        if (Array.isArray(parsed?.relatedQuestions)) return parsed.relatedQuestions
        if (Array.isArray(parsed?.related_questions)) return parsed.related_questions
      } catch {
        // ignore
      }
    }
    return []
  })()
  const hasRelatedQuestions = resolvedRelatedQuestions.length > 0
  const isRelatedLoading = !!mergedMessage.relatedLoading
  const shouldShowRelated = !isDeepResearch && (hasRelatedQuestions || isRelatedLoading)
  const isLatestAssistantMessage = useMemo(() => {
    const isAssistantRole = role => role === 'ai' || role === 'assistant'
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      if (!isAssistantRole(messages[idx]?.role)) continue
      return idx === messageIndex
    }
    return isLastRenderable
  }, [messages, messageIndex, isLastRenderable])
  const workflowContainerRef = useRef(null)
  const workflowProcessSteps = useMemo(
    () =>
      buildWorkflowProcessSteps({
        processSteps,
        isDeepResearch,
        researchSteps,
        isStreaming,
        hasMainText,
        wallClockFinalSec,
        answerGenerationDurationMs,
      }),
    [
      answerGenerationDurationMs,
      hasMainText,
      isDeepResearch,
      isStreaming,
      processSteps,
      researchSteps,
      wallClockFinalSec,
    ],
  )
  const {
    hasWorkflowFinalAnswerStep,
    finalAnswerWorkflowStep,
    workflowSearchStep,
    workflowThoughtStep,
    workflowToolItems,
    workflowSearchDurationMs,
    processDurationMs,
    processDurationSec,
    completedDurationSec,
    finalAnswerDurationMsForDisplay,
    shouldShowWorkflowFinalAnswer,
  } = useMemo(
    () =>
      deriveWorkflowState({
        workflowProcessSteps,
        answerGenerationDurationMs,
        hasMainText,
        isStreaming,
      }),
    [answerGenerationDurationMs, hasMainText, isStreaming, workflowProcessSteps],
  )
  useEffect(() => {
    const thoughtMs = workflowThoughtStep?.durationMs
    if (typeof thoughtMs === 'number' && thoughtMs > 0) {
      thoughtDurationMemoryRef.current = thoughtMs
    }
  }, [workflowThoughtStep?.durationMs])
  const displayWorkflowThoughtDurationMs = useMemo(() => {
    const thoughtMs = workflowThoughtStep?.durationMs
    if (typeof thoughtMs === 'number' && thoughtMs > 0) return thoughtMs
    if (thoughtDurationMemoryRef.current > 0) return thoughtDurationMemoryRef.current
    return null
  }, [workflowThoughtStep?.durationMs])
  const activeStreamingStepKind = useMemo(
    () =>
      getActiveStreamingStepKind({
        isStreaming,
        normalizedStreamBlocks,
        hasStartedAnswerTextStream,
        processSteps,
      }),
    [hasStartedAnswerTextStream, isStreaming, normalizedStreamBlocks, processSteps],
  )
  const isSearchStreamingActive = isStreaming && activeStreamingStepKind === 'search'
  useEffect(() => {
    if (isSearchStreamingActive) {
      if (!Number.isFinite(searchLiveStartRef.current)) {
        searchLiveStartRef.current = Date.now()
      }

      const tick = () => {
        const startMs = Number.isFinite(searchLiveStartRef.current)
          ? searchLiveStartRef.current
          : Date.now()
        const elapsed = Math.max(0, Math.round((Date.now() - startMs) / 1000))
        setSearchLiveElapsedSec(elapsed)
      }

      tick()
      const timer = window.setInterval(tick, 500)
      return () => window.clearInterval(timer)
    }

    if (!isStreaming) {
      searchLiveStartRef.current = null
      setSearchLiveElapsedSec(0)
    }

    return undefined
  }, [isSearchStreamingActive, isStreaming])
  const headerSourceLogos = useMemo(() => {
    return buildHeaderSourceLogos({
      allSources,
      getHostname,
    })
  }, [allSources])

  // Auto-scroll effect for thinking process
  useEffect(() => {
    if (isStreaming && isWorkflowExpanded && workflowContainerRef.current) {
      const container = workflowContainerRef.current
      // Use requestAnimationFrame for smooth scrolling during rapid updates
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  }, [isStreaming, isWorkflowExpanded, workflowProcessSteps, processDurationMs])

  const workflowPanel = (
    <WorkflowPanel
      workflowProcessSteps={workflowProcessSteps}
      isExpertMessage={isExpertMessage}
      isWorkflowExpanded={isWorkflowExpanded}
      setIsWorkflowExpanded={setIsWorkflowExpanded}
      isDeepResearch={isDeepResearch}
      deepResearchHeaderText={deepResearchHeaderText}
      isStreaming={isStreaming}
      hasStartedAnswerTextStream={hasStartedAnswerTextStream}
      hasWorkflowFinalAnswerStep={hasWorkflowFinalAnswerStep}
      activeStreamingStepKind={activeStreamingStepKind}
      t={t}
      completedDurationSec={completedDurationSec}
      shouldShowWorkflowSourceSummary={shouldShowWorkflowSourceSummary}
      allSources={allSources}
      isMobile={isMobile}
      handleMobileSourceClick={handleMobileSourceClick}
      setIsSourcesOpen={setIsSourcesOpen}
      headerSourceLogos={headerSourceLogos}
      workflowContainerRef={workflowContainerRef}
      displayWorkflowThoughtDurationMs={displayWorkflowThoughtDurationMs}
      formatThoughtContentForDisplay={formatThoughtContentForDisplay}
      mermaidOptions={mermaidOptions}
      markdownComponents={markdownComponents}
      researchStepsCount={researchSteps.length}
      getToolCallsForStep={getToolCallsForStep}
      renderToolQueryPreview={renderToolQueryPreview}
      getToolDisplayName={getToolDisplayName}
      renderWorkflowToolCapsule={renderWorkflowToolCapsule}
      searchLiveElapsedSec={searchLiveElapsedSec}
      expandedToolsSteps={expandedToolsSteps}
      toggleToolsStep={toggleToolsStep}
      shouldShowWorkflowFinalAnswer={shouldShowWorkflowFinalAnswer}
      finalAnswerDurationMsForDisplay={finalAnswerDurationMsForDisplay}
    />
  )
  // Debug logging for related questions
  // if (mergedMessage._formSubmitted) {
  //   console.log('[MessageBubble] Related questions check:', {
  //     messageId: message.id,
  //     hasRelatedQuestions,
  //     relatedCount: mergedMessage.related?.length || 0,
  //     isRelatedLoading,
  //     shouldShowRelated,
  //     isDeepResearch,
  //     mergedRelated: mergedMessage.related,
  //   })
  // }

  return (
    <div
      id={messageId}
      ref={el => {
        containerRef.current = el
        if (typeof bubbleRef === 'function') bubbleRef(el)
      }}
      className="relative mb-12 flex w-full max-w-3xl flex-col gap-0 px-5 sm:px-0"
      onMouseUp={handleMouseUp}
      onTouchEnd={handleTouchEnd}
      onContextMenu={handleContextMenu}
    >
      {/* Selection Menu - Rendered via portal to avoid transform issues */}
      {selectionMenu &&
        createPortal(
          <div
            className={clsx(
              'selection-menu fixed z-50 flex -translate-x-1/2 transform items-center shadow-lg',
              isMobile
                ? 'rounded-full border border-gray-700/50 bg-gray-900/98 px-3 py-1.5 text-white backdrop-blur-md dark:bg-zinc-800/98'
                : '-translate-y-full rounded-lg bg-gray-900 p-1 text-white dark:bg-zinc-700',
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
                'flex items-center gap-1.5 rounded-full text-xs font-medium transition-all',
                isMobile
                  ? 'px-3 py-1.5 hover:bg-gray-800 active:bg-gray-700'
                  : 'px-2 py-1.5 whitespace-nowrap hover:bg-gray-700 dark:hover:bg-zinc-600',
              )}
              onClick={e => {
                e.stopPropagation()
                onQuote && onQuote({ text: selectionMenu.text, message: mergedMessage })
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
                isMobile ? 'h-4 w-px bg-gray-600' : 'h-3 w-px bg-gray-700 dark:bg-zinc-600',
              )}
            />
            <button
              className={clsx(
                'flex items-center gap-1.5 rounded-full text-xs font-medium transition-all',
                isMobile
                  ? 'px-3 py-1.5 hover:bg-gray-800 active:bg-gray-700'
                  : 'px-2 py-1.5 whitespace-nowrap hover:bg-gray-700 dark:hover:bg-zinc-600',
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

      <ExpertPlanPanel
        isExpertMessage={isExpertMessage}
        expertPlanBlock={expertPlanBlock}
        t={t}
        mermaidOptions={mermaidOptions}
        markdownComponents={markdownComponents}
        sanitizeDisplayText={sanitizeDisplayText}
      />

      <MessageBubbleHeader
        isExpertMessage={isExpertMessage}
        isMobile={isMobile}
        expertAgentSelectorRef={expertAgentSelectorRef}
        isExpertAgentSelectorOpen={isExpertAgentSelectorOpen}
        setIsExpertAgentSelectorOpen={setIsExpertAgentSelectorOpen}
        activeExpertResponse={activeExpertResponse}
        expertAgent={expertAgent}
        expertResponses={expertResponses}
        agents={agents}
        setActiveExpertAgentId={setActiveExpertAgentId}
        t={t}
        hasAgentBanner={hasAgentBanner}
        agentBannerImage={agentBannerImage}
        displayAgent={displayAgent}
        agentEmoji={agentEmoji}
        displayAgentName={displayAgentName}
        providerMeta={providerMeta}
        resolvedModel={resolvedModel}
        handleAgentClick={handleAgentClick}
        targetAgent={targetAgent}
        agentName={agentName}
        displayAgentShape={displayAgentShape}
        renderProviderIcon={renderProviderIcon}
        getModelIcon={getModelIcon}
        getModelIconClassName={getModelIconClassName}
      />
      {headerExtraContent}

      {/* Sources Section - REMOVED (Moved to toolbar) */}

      {/* Main Content */}
      <div
        ref={mainContentRef}
        className="message-content prose dark:prose-invert max-w-none font-sans leading-relaxed text-gray-800 dark:text-gray-200 [&_blockquote]:max-w-full [&_blockquote]:overflow-x-auto [&_p]:max-w-full [&_p]:overflow-x-auto [&_p]:whitespace-pre-wrap [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:inline-table [&_table]:w-auto [&_table]:table-auto"
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
        <>
          <ExpertTaskCard
            isExpertMessage={isExpertMessage}
            activeExpertTaskCard={activeExpertTaskCard}
            expertTeamMode={expertTeamMode}
            t={t}
          />
          {workflowPanel}
          {renderedMainContent}
          {renderInitialSkeleton && (
            <div
              className={clsx(
                'my-4 inline-flex items-center gap-2 transition-opacity duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]',
                showInitialSkeleton ? 'opacity-100' : 'opacity-0',
              )}
            >
              {/* {isDeepThinkingStreaming && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('messageBubble.deepThinkingStreaming')}
                </span>
              )} */}
              <DotLoader />
            </div>
          )}
          {!isDeepResearch && isStreaming && hasMainText && (
            <div className="my-4 inline-flex items-center pl-1">
              <DotLoader />
            </div>
          )}
          {isDeepResearch && isStreaming && !hasMainText && !hasActiveResearchStep && (
            <div className="my-4 flex items-center gap-2 pl-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('messageBubble.deepThinkingStreaming')}
              </span>
              <DotLoader />
            </div>
          )}
        </>
      </div>

      {isFormWaitingForInput && <FormStatusBadge waiting />}

      {/* Related Questions */}
      {shouldShowRelated && (
        <div className="border-t border-gray-200/60 pt-4 dark:border-zinc-800/50">
          <RelatedQuestions
            t={t}
            questions={hasRelatedQuestions ? resolvedRelatedQuestions : []}
            isLoading={isRelatedLoading}
            onRelatedClick={onRelatedClick}
            defaultExpanded={isLatestAssistantMessage}
            resetKey={mergedMessage?.id || mergedMessage?.localId || messageIndex}
          />
        </div>
      )}

      {/* Action Bar */}
      <MessageActionBar
        t={t}
        isDeepResearch={isDeepResearch}
        isMobile={isMobile}
        onShare={() => setIsShareModalOpen(true)}
        onRegenerate={
          onRegenerateAnswer
            ? () => {
                showConfirmation({
                  title: t('confirmation.regenerateTitle'),
                  message: t('confirmation.regenerateMessage'),
                  confirmText: t('message.regenerate'),
                  onConfirm: onRegenerateAnswer,
                })
              }
            : undefined
        }
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
        onOpenPipeline={hasPipelineData ? () => setIsPipelineOpen(true) : undefined}
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

      {/* Desktop Sources Drawer */}
      {!isMobile && shouldShowSourcesDrawer && (
        <DesktopSourcesSheet
          isOpen={isSourcesOpen}
          onClose={() => setIsSourcesOpen(false)}
          sources={allSources}
          title={t('sources.citationSources', '参考资料')}
        />
      )}

      {/* Mobile Sources Drawer */}
      <MobileSourcesDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        sources={mobileDrawerSources}
        title={mobileDrawerTitle}
      />

      <PipelineDrawer
        isOpen={isPipelineOpen}
        onClose={() => setIsPipelineOpen(false)}
        pipeline={pipelineTrace}
        t={t}
      />

      <div className="hidden" aria-hidden="true">
        <div ref={researchExportRef}>
          <Streamdown mermaid={mermaidOptions} remarkPlugins={[remarkGfm]}>
            {planMarkdown}
          </Streamdown>
        </div>
        <div ref={thoughtExportRef}>
          <Streamdown mermaid={mermaidOptions} remarkPlugins={[remarkGfm]}>
            {thoughtExportContent}
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
          <div className="fixed inset-0 z-10000 flex items-start justify-center overflow-y-auto bg-black/50 p-0 backdrop-blur-sm md:items-center md:overflow-hidden md:p-4">
            <div className="flex h-screen w-full flex-col overflow-hidden rounded-none border-0 border-gray-200 bg-white shadow-2xl md:h-[80vh] md:max-w-4xl md:rounded-2xl md:border dark:border-zinc-800 dark:bg-[#191a1a]">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 dark:border-zinc-800 dark:bg-[#191a1a]">
                <div className="truncate pr-4 text-base font-semibold text-gray-900 dark:text-white">
                  {developerMode ? activeToolDetail?.name : getToolDisplayName(activeToolDetail)}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveToolDetail(null)}
                  className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-white p-4 sm:p-6 dark:bg-[#191a1a]">
                <div>
                  <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('messageBubble.toolInput')}
                  </div>
                  <div>
                    <Streamdown
                      mermaid={mermaidOptions}
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {(() => {
                        const content = formatJsonForDisplay(
                          getToolArgumentsForDisplay(activeToolDetail),
                        )
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
                  <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        // If it's already JSON-like, it probably used the json code block logic in formatJsonForDisplay or similar
                        if (
                          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                          (trimmed.startsWith('[') && trimmed.endsWith(']'))
                        ) {
                          return `\`\`\`json\n${content}\n\`\`\``
                        }
                        // If it's a non-empty string, wrap it in a text code block for better readability
                        if (trimmed.length > 0) {
                          return `\`\`\`TEXT\n${content}\n\`\`\``
                        }
                        return content
                      })()}
                    </Streamdown>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Image Gallery Portal */}
      {isGalleryOpen &&
        messageImages.length > 0 &&
        createPortal(
          <div
            className="animate-in fade-in fixed inset-0 z-10001 flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl duration-300"
            onClick={() => setIsGalleryOpen(false)}
          >
            {/* Close Button */}
            <button
              className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-3 text-white backdrop-blur-md transition-colors hover:bg-white/20"
              onClick={() => setIsGalleryOpen(false)}
            >
              <X size={24} />
            </button>

            {/* Image Counter */}
            <div className="absolute top-6 left-6 z-10 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-md">
              {galleryIndex + 1} / {messageImages.length}
            </div>

            {/* Navigation Controls */}
            {messageImages.length > 1 && (
              <>
                <button
                  className="absolute top-1/2 left-4 z-10 -translate-y-1/2 rounded-full bg-white/5 p-4 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-white/15 active:scale-95"
                  onClick={e => {
                    e.stopPropagation()
                    setGalleryIndex(
                      prev => (prev - 1 + messageImages.length) % messageImages.length,
                    )
                  }}
                >
                  <ChevronLeft size={32} />
                </button>
                <button
                  className="absolute top-1/2 right-4 z-10 -translate-y-1/2 rounded-full bg-white/5 p-4 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-white/15 active:scale-95"
                  onClick={e => {
                    e.stopPropagation()
                    setGalleryIndex(prev => (prev + 1) % messageImages.length)
                  }}
                >
                  <ChevronRight size={32} />
                </button>
              </>
            )}

            {/* Main Image Container */}
            <div
              className="relative flex max-w-[95vw] items-center justify-center md:px-12"
              onClick={e => e.stopPropagation()}
            >
              {messageImages[galleryIndex] &&
              !failedImageUrls.has(messageImages[galleryIndex].src) ? (
                <div className="inline-flex max-w-full flex-col gap-3">
                  <img
                    key={messageImages[galleryIndex].src}
                    src={messageImages[galleryIndex].src}
                    alt={messageImages[galleryIndex].alt}
                    className="animate-in zoom-in-95 max-h-[72vh] max-w-[95vw] rounded-lg object-contain shadow-2xl transition-all duration-300"
                  />

                  {/* Caption & Source Area */}
                  {(messageImages[galleryIndex].title || messageImages[galleryIndex].source) && (
                    <div className="rounded-lg bg-black/70 p-4 text-white backdrop-blur-sm">
                      {messageImages[galleryIndex].title && (
                        <h3 className="mb-1 line-clamp-2 text-base font-semibold md:text-lg">
                          {messageImages[galleryIndex].title}
                        </h3>
                      )}
                      {messageImages[galleryIndex].source && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm opacity-60">
                            {t('messageBubble.source', 'Source')}:
                          </span>
                          <a
                            href={messageImages[galleryIndex].sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-300 flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            <Globe size={14} className="opacity-70" />
                            {messageImages[galleryIndex].source}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 text-white/80">
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
                    <AlertTriangle size={32} className="text-white/60" />
                    <p className="font-medium">
                      {t('messageBubble.imageLoadError', 'Image failed to load')}
                    </p>
                    {messageImages[galleryIndex].sourceUrl && (
                      <a
                        href={messageImages[galleryIndex].sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-300 hover:text-primary-200 mt-1 flex items-center gap-2 text-sm font-medium underline-offset-4 transition-colors hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        <Globe size={14} />
                        {t('messageBubble.viewOriginalSource', 'Try opening original link')}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default React.memo(MessageBubble)
