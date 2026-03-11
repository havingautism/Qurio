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
import DesktopSourcesSection from './DesktopSourcesSection'
import DesktopSourcesSheet from './DesktopSourcesSheet'
import DotLoader from './DotLoader'
import EmojiDisplay from './EmojiDisplay'
import AgentAvatar from './AgentAvatar'
import AgentBannerSurface from './AgentBannerSurface'
import InteractiveForm from './InteractiveForm'
import DeepResearchGoalCard from './message/DeepResearchGoalCard'
import MessageActionBar from './message/MessageActionBar'
import {
  applyGroundingSupports,
  formatContentWithSources,
  getHostname,
} from './message/messageUtils'
import { formatMessageDate } from '../lib/dateUtils'
import RelatedQuestions from './message/RelatedQuestions'
import { useMessageExport } from './message/useMessageExport'
import MobileSourcesDrawer from './MobileSourcesDrawer'
import DocumentSourcesPanel from './DocumentSourcesPanel'
import ShareModal from './ShareModal'
import YoutubeLogo from '../assets/youtube.svg?url'
import BilibiliLogo from '../assets/bilibili.png?url'
import useSettings from '../hooks/useSettings'
import ScrapbookContextBanner from './ScrapbookContextBanner'
import {
  AGENT_AVATAR_SHAPE_CIRCLE,
  getAgentAvatarShape,
  getAgentBannerImage,
  hasManualAgentBanner,
} from '../lib/agentAppearance'

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

const InlineVideoEmbed = memo(({ embedUrl, title = 'Video' }) => {
  const iframeSrc = useMemo(() => {
    if (!embedUrl) return null
    try {
      const parsed = new URL(embedUrl)
      parsed.searchParams.set('autoplay', '0')
      parsed.searchParams.set('auto_play', '0')
      return parsed.toString()
    } catch {
      return embedUrl
    }
  }, [embedUrl])

  if (!iframeSrc) return null

  return (
    <span className="my-3 block aspect-video w-full max-w-md overflow-hidden rounded-lg">
      <iframe
        src={iframeSrc}
        title={title}
        loading="lazy"
        fetchPriority="low"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </span>
  )
})
InlineVideoEmbed.displayName = 'InlineVideoEmbed'

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

const MessageImage = memo(({ src, alt, openGallery, onImageError, isFailed, imageMetadataRef }) => {
  const { t } = useTranslation()
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Get metadata from ref to avoid prop changes during streaming
  const metadata = imageMetadataRef?.current?.find(r => r.src === src)
  const sourceUrl = metadata?.sourceUrl
  const sourceName = metadata?.source

  // Effectively remove the img from DOM on error to prevent broken icon
  if (isFailed || hasError) {
    const displayHostname = sourceUrl ? getHostname(sourceUrl) : null

    return (
      <span className="my-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
        <span className="mb-2 flex items-center gap-2 text-gray-400">
          <AlertTriangle size={16} />
          <span className="text-xs font-medium">
            {t('messageBubble.imageLoadError', 'Image failed to load')}
          </span>
        </span>
        <span className="mb-1 line-clamp-1 text-[10px] text-gray-500 opacity-70">
          {typeof alt === 'string' ? alt : src}
        </span>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mt-1 flex items-center gap-1.25 text-[10px] font-medium transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Globe size={11} className="opacity-70" />
            {t('messageBubble.viewOriginalSource', 'Try opening original link')}
            {displayHostname ? ` (${displayHostname})` : ''}
          </a>
        )}
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'group relative my-2 inline-block overflow-hidden rounded-lg shadow-sm transition-all duration-500 hover:shadow-lg active:shadow-md',
        isLoaded ? 'opacity-100' : 'opacity-0',
      )}
    >
      <img
        src={src}
        alt={typeof alt === 'string' ? alt : ''}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setHasError(true)
          onImageError(src)
        }}
        onClick={() => openGallery(src)}
        className="cursor-zoom-in transition-all duration-500 ease-out group-hover:scale-110 group-hover:brightness-105 active:scale-95"
      />
    </span>
  )
})

MessageImage.displayName = 'MessageImage'

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

const SearchSourcesList = React.memo(({ sources }) => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)

  if (!sources || sources.length === 0) return null

  // Decide threshold, e.g., 6 items
  const THRESHOLD = 6
  const hasMore = sources.length > THRESHOLD
  const displaySources = isExpanded ? sources : sources.slice(0, THRESHOLD)

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {displaySources.map((src, sIdx) => {
        const url = src?.url || src?.uri || src?.link || src?.href || ''
        let hostname = t('sources.source')
        try {
          hostname = new URL(url).hostname.replace(/^www\./, '')
        } catch (e) {}
        return (
          <a
            key={`src-${sIdx}`}
            href={url || '#'}
            target={url ? '_blank' : undefined}
            rel={url ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100/80 px-2.5 py-1.5 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <img
              src={src.icon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`}
              alt=""
              className="h-3.5 w-3.5 rounded-full bg-white object-cover"
            />
            <span className="max-w-[140px] truncate text-[12px]! font-medium text-gray-600 dark:text-gray-300">
              {src.media || src.title || hostname}
            </span>
          </a>
        )
      })}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex cursor-pointer items-center gap-0.5 rounded-lg bg-transparent px-2.5 py-1.5 text-[12px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
        >
          {isExpanded ? (
            <>
              {t('common.collapse', { defaultValue: '收起' })}
              <ChevronUp size={14} className="ml-0.5" />
            </>
          ) : (
            <>
              {t('common.expand', { defaultValue: '展开' })}
              <ChevronDown size={14} className="ml-0.5" />
            </>
          )}
        </button>
      )}
    </div>
  )
})

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
  const expertAgentSelectorRef = useRef(null)
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
  const toolCallHistory =
    isExpertMessage && Array.isArray(activeExpertResponse?.toolCallHistory)
      ? activeExpertResponse.toolCallHistory
      : baseToolCallHistory
  const formToolHistory = toolCallHistory.filter(item => item.name === 'interactive_form')
  const hasInteractiveForm = formToolHistory.length > 0
  const mainContent = isExpertMessage ? activeExpertResponse?.content || '' : parsed.content
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
    if (!Array.isArray(streamSource)) return []
    return streamSource
      .map((item, index) => ({
        seq: Number.isFinite(item?.seq) ? Number(item.seq) : index + 1,
        type: String(item?.type || '').toLowerCase(),
        content: typeof item?.content === 'string' ? item.content : '',
        toolCallId: item?.tool_call_id || item?.toolCallId || null,
        name: item?.name || null,
        status: item?.status || null,
        arguments: item?.arguments ?? null,
        output: item?.output ?? null,
        durationMs: Number.isFinite(item?.duration_ms) ? Number(item.duration_ms) : null,
      }))
      .filter(item => item.type)
      .sort((a, b) => a.seq - b.seq)
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
    const explicitBackends = isExpertMessage
      ? activeExpertResponse?.searchBackends
      : mergedMessage?.searchBackends
    if (Array.isArray(explicitBackends) && explicitBackends.length > 0) {
      return explicitBackends.map(item => String(item)).filter(Boolean)
    }
    const explicitBackend = isExpertMessage
      ? activeExpertResponse?.searchBackend
      : mergedMessage?.searchBackend
    if (typeof explicitBackend === 'string' && explicitBackend) {
      return [explicitBackend]
    }
    for (const item of toolCallHistory) {
      if (!item || (item.name !== 'web_search' && item.name !== 'search_news')) continue
      if (!item.arguments) continue
      if (typeof item.arguments === 'object') {
        if (Array.isArray(item.arguments.backends) && item.arguments.backends.length > 0) {
          return item.arguments.backends.map(value => String(value)).filter(Boolean)
        }
        if (item.arguments.backend) return [String(item.arguments.backend)]
        continue
      }
      if (typeof item.arguments !== 'string') continue
      try {
        const parsed = JSON.parse(item.arguments)
        if (!parsed || typeof parsed !== 'object') continue
        if (Array.isArray(parsed.backends) && parsed.backends.length > 0) {
          return parsed.backends.map(value => String(value)).filter(Boolean)
        }
        if (parsed.backend) return [String(parsed.backend)]
      } catch {
        continue
      }
    }
    return []
  }, [
    isExpertMessage,
    activeExpertResponse?.searchBackend,
    activeExpertResponse?.searchBackends,
    mergedMessage?.searchBackend,
    mergedMessage?.searchBackends,
    toolCallHistory,
  ])

  const getToolDisplayName = useCallback(
    tool => {
      if (!tool) return ''
      const baseName = TOOL_TRANSLATION_KEYS[tool.name]
        ? t(TOOL_TRANSLATION_KEYS[tool.name])
        : tool.name
      const parseArguments = rawArguments => {
        if (!rawArguments) return null
        if (typeof rawArguments === 'object') return rawArguments
        if (typeof rawArguments !== 'string') return null
        try {
          const parsed = JSON.parse(rawArguments)
          return parsed && typeof parsed === 'object' ? parsed : null
        } catch {
          return null
        }
      }
      const getFileName = filePath => {
        if (!filePath || typeof filePath !== 'string') return ''
        const normalized = filePath.replace(/\\/g, '/')
        const segments = normalized.split('/').filter(Boolean)
        return segments[segments.length - 1] || filePath
      }

      const parsedArguments = parseArguments(tool.arguments)
      let detail = ''

      if (tool.name === 'execute_skill_script' || tool.name === 'get_skill_script') {
        detail = getFileName(parsedArguments?.script_path)
      } else if (tool.name === 'install_skill_dependency') {
        detail =
          typeof parsedArguments?.package_name === 'string'
            ? parsedArguments.package_name.trim()
            : ''
      }

      return detail ? `${baseName} (${detail})` : baseName
    },
    [t],
  )
  const isSkillToolCall = useCallback(tool => isSkillToolName(tool?.name), [])
  const getSearchBackendForTool = useCallback(
    tool => {
      if (!tool) return null
      const isWebSearch = tool.name === 'web_search' || tool.name === 'search_news'
      const isImageSearch =
        tool.name === 'duckduckgo_image_search' ||
        tool.name === 'google_image_search' ||
        tool.name === 'bing_image_search' ||
        tool.name === 'serpapi_image_search'
      const isVideoSearch =
        tool.name === 'duckduckgo_video_search' || tool.name === 'search_youtube'

      if (!isWebSearch && !isImageSearch && !isVideoSearch) return null

      if (isImageSearch) {
        if (tool.name.includes('google')) return 'google'
        if (tool.name.includes('bing')) return 'bing'
        if (tool.name.includes('duckduckgo')) return 'duckduckgo'
        // serpapi_image_search uses 'engine' parameter (e.g., 'google_images', 'bing_images')
        const args = tool.arguments
        if (args && typeof args === 'object' && typeof args.engine === 'string') {
          if (args.engine.includes('google')) return 'google'
          if (args.engine.includes('bing')) return 'bing'
          if (args.engine.includes('yahoo')) return 'yahoo'
        }
      }

      if (isVideoSearch) {
        if (tool.name === 'search_youtube') return 'youtube'
        if (tool.name.includes('duckduckgo')) return 'duckduckgo'
      }

      const args = tool.arguments
      if (args && typeof args === 'object') {
        if (typeof args.backend === 'string' && args.backend) return args.backend
        if (Array.isArray(args.backends) && args.backends.length > 0)
          return String(args.backends[0])
      }
      if (typeof args === 'string') {
        try {
          const parsed = JSON.parse(args)
          if (parsed && typeof parsed === 'object') {
            // Handle 'engine' parameter for serpapi_image_search
            if (typeof parsed.engine === 'string' && parsed.engine) {
              if (parsed.engine.includes('google')) return 'google'
              if (parsed.engine.includes('bing')) return 'bing'
              if (parsed.engine.includes('yahoo')) return 'yahoo'
            }
            if (typeof parsed.backend === 'string' && parsed.backend) return parsed.backend
            if (Array.isArray(parsed.backends) && parsed.backends.length > 0) {
              return String(parsed.backends[0])
            }
          }
        } catch {
          // ignore parse failure
        }
      }
      if (resolvedSearchBackends.length > 0) return resolvedSearchBackends[0]
      return null
    },
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
    tool => {
      if (!tool || !tool.arguments) return tool?.arguments
      if (tool.name !== 'web_search' && tool.name !== 'search_news') return tool.arguments
      if (resolvedSearchBackends.length === 0) return tool.arguments

      if (typeof tool.arguments === 'object') {
        if (tool.arguments.backend || tool.arguments.backends) return tool.arguments
        return resolvedSearchBackends.length > 1
          ? {
              ...tool.arguments,
              backend: resolvedSearchBackends[0],
              backends: resolvedSearchBackends,
            }
          : { ...tool.arguments, backend: resolvedSearchBackends[0] }
      }

      if (typeof tool.arguments === 'string') {
        try {
          const parsed = JSON.parse(tool.arguments)
          if (!parsed || typeof parsed !== 'object') return tool.arguments
          if (parsed.backend || parsed.backends) return tool.arguments
          return JSON.stringify(
            resolvedSearchBackends.length > 1
              ? { ...parsed, backend: resolvedSearchBackends[0], backends: resolvedSearchBackends }
              : { ...parsed, backend: resolvedSearchBackends[0] },
          )
        } catch {
          return tool.arguments
        }
      }

      return tool.arguments
    },
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
  const [isDocumentSourcesOpen, setIsDocumentSourcesOpen] = useState(false)

  // Use ref to store image metadata to avoid triggering markdownComponents rebuild
  const imageMetadataRef = useRef([])
  // Use ref to store video metadata to avoid triggering markdownComponents rebuild
  const videoMetadataRef = useRef([])

  // Extract all image search results from toolCallHistory to get rich metadata (title, source)
  // Update ref without triggering re-renders of markdownComponents
  const allImageResults = useMemo(() => {
    const results = []
    const imageSearchTools = [
      'duckduckgo_image_search',
      'google_image_search',
      'bing_image_search',
      'serpapi_image_search',
    ]
    toolCallHistory.forEach(tc => {
      // Handle all image search tool names
      if (imageSearchTools.includes(tc.name)) {
        try {
          const output = typeof tc.output === 'string' ? JSON.parse(tc.output) : tc.output
          if (Array.isArray(output)) {
            output.forEach(item => {
              const imgUrl = item.image || item.url || item.thumbnailUrl || item.thumbnail
              const sourceUrl = item.url || item.parentPage || ''
              const hostname = sourceUrl ? getHostname(sourceUrl) : ''

              if (imgUrl) {
                results.push({
                  src: imgUrl,
                  title: item.title || '',
                  source: hostname || item.source || '',
                  sourceUrl: sourceUrl,
                })
              }
            })
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    })
    // Update ref for use in MessageImage without triggering deps
    imageMetadataRef.current = results
    return results
  }, [toolCallHistory])

  // Extract video search results to get title for iframe accessibility
  // Update ref without triggering re-renders of markdownComponents
  const allVideoResults = useMemo(() => {
    const results = []
    const videoSearchTools = ['duckduckgo_video_search', 'search_youtube']
    toolCallHistory.forEach(tc => {
      if (videoSearchTools.includes(tc.name)) {
        try {
          const output = typeof tc.output === 'string' ? JSON.parse(tc.output) : tc.output
          let videoList = []
          if (Array.isArray(output)) {
            videoList = output
          } else if (output && typeof output === 'object') {
            videoList = output.video_results || output.videos || []
          }
          videoList.forEach(item => {
            const videoUrl = item.link || item.url || item.content || ''
            if (videoUrl) {
              results.push({
                url: videoUrl,
                title: item.title || '',
              })
            }
          })
        } catch (e) {
          // ignore parse errors
        }
      }
    })
    videoMetadataRef.current = results
    return results
  }, [toolCallHistory])

  // Helper function to convert supported video URLs to embed URL
  const getVideoEmbedUrl = useCallback(url => {
    if (!url) return null

    // YouTube: various formats
    const ytPatterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ]
    for (const pattern of ytPatterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return `https://www.youtube.com/embed/${match[1]}`
      }
    }

    // Bilibili: normal video links and player links
    try {
      const normalizedUrl = url.startsWith('//') ? `https:${url}` : url
      const parsed = new URL(normalizedUrl)
      const hostname = parsed.hostname.toLowerCase()

      const buildBilibiliEmbedUrl = ({ bvid, aid, cid, page }) => {
        const params = new URLSearchParams()
        params.set('isOutside', 'true')
        if (aid) params.set('aid', aid)
        if (bvid) params.set('bvid', bvid)
        if (cid) params.set('cid', cid)
        params.set('p', page || '1')
        return `https://player.bilibili.com/player.html?${params.toString()}`
      }

      // Example: player.bilibili.com/player.html?...&bvid=...&cid=...&p=1
      if (hostname.includes('player.bilibili.com') && parsed.pathname.includes('/player.html')) {
        const bvid = parsed.searchParams.get('bvid')
        const aid = parsed.searchParams.get('aid')
        const cid = parsed.searchParams.get('cid')
        const page = parsed.searchParams.get('p') || parsed.searchParams.get('page')
        if (bvid || aid || cid) {
          return buildBilibiliEmbedUrl({ bvid, aid, cid, page })
        }
      }

      // Example: www.bilibili.com/video/BV... or www.bilibili.com/video/av...
      if (hostname.includes('bilibili.com')) {
        const bvidMatch = parsed.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i)
        const aidMatch = parsed.pathname.match(/\/video\/av(\d+)/i)
        const page = parsed.searchParams.get('p') || parsed.searchParams.get('page')

        if (bvidMatch?.[1]) {
          return buildBilibiliEmbedUrl({ bvid: bvidMatch[1], page })
        }
        if (aidMatch?.[1]) {
          return buildBilibiliEmbedUrl({ aid: aidMatch[1], page })
        }
      }
    } catch {
      // ignore URL parse errors
    }

    return null
  }, [])

  const getVideoPlatform = useCallback(url => {
    if (!url) return null

    try {
      const normalizedUrl = url.startsWith('//') ? `https:${url}` : url
      const parsed = new URL(normalizedUrl)
      const hostname = parsed.hostname.toLowerCase()

      if (
        hostname.includes('youtube.com') ||
        hostname.includes('youtu.be') ||
        hostname.includes('youtube-nocookie.com')
      ) {
        return 'youtube'
      }

      if (hostname.includes('player.bilibili.com') || hostname.includes('bilibili.com')) {
        return 'bilibili'
      }
    } catch {
      // ignore parse errors
    }

    return null
  }, [])

  // Extract all images rendered in the mainContent markdown
  const messageImages = useMemo(() => {
    if (!mainContent) return []
    // Regex to find ![alt](url)
    const regex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
    const found = []
    let match
    while ((match = regex.exec(mainContent)) !== null) {
      const alt = match[1]
      const src = match[2]
      // Match with allImageResults to find rich metadata
      const metadata = allImageResults.find(r => r.src === src)
      found.push({
        src,
        alt: alt || metadata?.title || '',
        title: metadata?.title || alt || '',
        source: metadata?.source || '',
        sourceUrl: metadata?.sourceUrl || '',
      })
    }
    // Do not filter out failed images to preserve index alignment with markdown rendering
    return found
  }, [mainContent, allImageResults, failedImageUrls])

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

  useEffect(() => {
    setIsDocumentSourcesOpen(false)
  }, [message?.id])

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

  const interleavedContent = useMemo(() => {
    const rawContent = mainContent || ''
    const parts = []
    if (normalizedStreamBlocks.length === 0) {
      return [{ type: 'text', content: rawContent }]
    }

    for (const block of normalizedStreamBlocks) {
      if (block.type === 'text') {
        if (block.content) parts.push({ type: 'text', content: block.content })
        continue
      }
      if (block.type === 'reasoning' || block.type === 'thought') {
        if (!isDeepResearch && block.content) {
          const lastPart = parts[parts.length - 1]
          if (lastPart?.type === 'thought') {
            lastPart.content = `${lastPart.content || ''}${block.content || ''}`
            const prevDuration = Number.isFinite(lastPart.durationMs)
              ? Number(lastPart.durationMs)
              : 0
            const nextDuration = Number.isFinite(block.durationMs) ? Number(block.durationMs) : 0
            lastPart.durationMs = prevDuration + nextDuration
          } else {
            parts.push({
              type: 'thought',
              key: `stream-thought-${block.seq}`,
              content: block.content,
              durationMs: block.durationMs,
            })
          }
        }
        continue
      }
      if (block.type === 'workflow_text') {
        if (!isDeepResearch && block.content) {
          parts.push({
            type: 'workflow_text',
            key: `stream-workflow-text-${block.seq}`,
            content: block.content,
          })
        }
        continue
      }
      if (block.type === 'tool' || block.type === 'tool_call' || block.type === 'tool_result') {
        const matchedTool =
          toolCallHistory.find(item => item?.id && item.id === block.toolCallId) || null
        const toolItem =
          matchedTool ||
          (block.toolCallId
            ? {
                id: block.toolCallId,
                name: block.name || 'tool',
                status: block.status || 'done',
                arguments: block.arguments,
                output: block.output,
                durationMs: block.durationMs,
              }
            : null)
        if (toolItem) {
          parts.push({
            type: 'tools',
            key: `stream-tool-${block.type || 'tool'}-${block.toolCallId || 'na'}-${block.seq}`,
            items: [toolItem],
          })
        }
      }
    }

    if (!isDeepResearch && parts.length > 1) {
      const firstNonThoughtIndex = parts.findIndex(part => part.type !== 'thought')
      if (firstNonThoughtIndex > 0 && parts[firstNonThoughtIndex]?.type === 'text') {
        const thoughtPrefix = parts
          .slice(0, firstNonThoughtIndex)
          .filter(part => part.type === 'thought')
          .map(part => String(part.content || ''))
          .join('')
        const textPart = String(parts[firstNonThoughtIndex].content || '')
        const compactThought = thoughtPrefix.replace(/\s+/g, '')
        const compactText = textPart.replace(/\s+/g, '')
        if (compactThought && compactText) {
          const minLen = Math.min(compactThought.length, compactText.length)
          if (minLen >= 24) {
            let common = 0
            while (common < minLen && compactThought[common] === compactText[common]) common += 1
            const overlapRatio = common / minLen
            if (overlapRatio >= 0.92) {
              const trimmedText = textPart.trimStart()
              if (trimmedText.startsWith(thoughtPrefix)) {
                const deduped = trimmedText.slice(thoughtPrefix.length).trimStart()
                if (deduped) {
                  parts[firstNonThoughtIndex] = { ...parts[firstNonThoughtIndex], content: deduped }
                } else {
                  parts.splice(firstNonThoughtIndex, 1)
                }
              } else if (compactText.startsWith(compactThought)) {
                parts.splice(firstNonThoughtIndex, 1)
              }
            }
          }
        }
      }
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: rawContent }]
  }, [mainContent, toolCallHistory, isDeepResearch, normalizedStreamBlocks])

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

  const [isResearchExpanded, setIsResearchExpanded] = useState(false)
  const [isPlanExpanded, setIsPlanExpanded] = useState(false)
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
      setMobileDrawerSources(selectedSources || mergedMessage.sources)
      setMobileDrawerTitle(title || t('sources.title'))
      setIsMobileDrawerOpen(true)
    },
    [mergedMessage.sources, t],
  )

  const isStreaming = isStreamingMessage
  const persistedFinalAnswerDurationMs = Number.isFinite(mergedMessage?.finalAnswerDurationMs)
    ? Number(mergedMessage.finalAnswerDurationMs)
    : null
  const wallClockStartRef = useRef(null)
  const [wallClockElapsedSec, setWallClockElapsedSec] = useState(0)
  const [wallClockFinalSec, setWallClockFinalSec] = useState(null)
  const searchLiveStartRef = useRef(null)
  const [searchLiveElapsedSec, setSearchLiveElapsedSec] = useState(0)

  const [expandedToolsSteps, setExpandedToolsSteps] = useState(new Set())
  const toggleToolsStep = useCallback(idx => {
    setExpandedToolsSteps(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  useEffect(() => {
    wallClockStartRef.current = null
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

    if (isStreaming && hasAnswerOutputSignal) {
      if (!Number.isFinite(wallClockStartRef.current)) {
        // Start total timer when the default model actually begins emitting answer text.
        wallClockStartRef.current = Date.now()
      }

      const tick = () => {
        const startMs = Number.isFinite(wallClockStartRef.current)
          ? wallClockStartRef.current
          : Date.now()
        const elapsed = Math.max(0, Math.round((Date.now() - startMs) / 1000))
        setWallClockElapsedSec(elapsed)
      }

      tick()
      const timer = window.setInterval(tick, 500)
      return () => window.clearInterval(timer)
    }

    if (Number.isFinite(wallClockStartRef.current)) {
      const elapsed = Math.max(0, Math.round((Date.now() - wallClockStartRef.current) / 1000))
      setWallClockElapsedSec(elapsed)
      setWallClockFinalSec(prev => (typeof prev === 'number' ? prev : elapsed))
    }

    return undefined
  }, [isStreaming, hasStartedAnswerTextStream, isExpertMessage, mainContent, message?.content])

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

  const CodeBlock = useCallback(
    ({ inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1].toLowerCase() : ''
      const langLabel = match ? match[1].toUpperCase() : 'CODE'
      const rawCodeText = String(children)
      const codeText = rawCodeText.replace(/\n$/, '')
      const isBlock =
        !inline && (language || rawCodeText.includes('\n') || className?.includes('language-'))

      if (isBlock && language === 'mermaid') {
        return (
          <div className="mb-4">
            <Streamdown mode="static" mermaid={mermaidOptions} controls={{ mermaid: true }}>
              {`\`\`\`mermaid\n${codeText}\n\`\`\``}
            </Streamdown>
          </div>
        )
      }

      if (isBlock) {
        return (
          <div className="group bg-user-bubble/20 relative mb-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-700 dark:bg-zinc-800/40">
            <div className="bg-user-bubble/50 flex items-center justify-between border-b border-gray-200 px-4 py-2 text-[11px] font-semibold text-gray-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-gray-300">
              <span>{langLabel}</span>
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

      return (
        <code
          className={`${className} bg-user-bubble rounded-md px-1.5 py-0.5 font-mono text-sm text-black dark:bg-zinc-800 dark:text-white`}
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

  const createHeadingComponent = useCallback(
    (Tag, className, withAnchors) => {
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
    },
    [getNextHeadingId],
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

  const MarkdownLinkRenderer = useMemo(() => {
    const LinkRenderer = ({ href, children, ...props }) => {
      const isInTable = React.useContext(InTableContext)
      const safeHref = sanitizeMarkdownUrl(href)
      let citationIndices = null

      if (safeHref?.startsWith('citation:')) {
        citationIndices = safeHref
          .replace('citation:', '')
          .split(',')
          .map(Number)
          .filter(n => !isNaN(n))
      } else if (safeHref?.startsWith('https://citation.local/')) {
        const path = safeHref.replace('https://citation.local/', '')
        citationIndices = path
          .split(',')
          .map(Number)
          .filter(n => !isNaN(n))
      }

      if (citationIndices) {
        return (
          <CitationChip
            indices={citationIndices}
            sources={mergedMessage.sources}
            isMobile={isMobile}
            onMobileClick={sources =>
              handleMobileSourceClick(sources, t('sources.citationSources'))
            }
            label={children}
          />
        )
      }
      if (!safeHref) {
        return <span {...props}>{parseChildrenWithEmojis(children)}</span>
      }

      const embedUrl = getVideoEmbedUrl(safeHref)
      if (embedUrl) {
        const videoInfo = videoMetadataRef.current.find(v => v.url === safeHref)
        if (isInTable) {
          const platform = getVideoPlatform(safeHref)
          const platformMeta =
            platform === 'youtube'
              ? {
                  label: 'YouTube',
                  logo: YoutubeLogo,
                  className: 'bg-red-600 text-white',
                }
              : platform === 'bilibili'
                ? {
                    label: 'Bilibili',
                    logo: BilibiliLogo,
                    className: 'bg-sky-500 text-white',
                  }
                : {
                    label: '视频',
                    logo: null,
                    className: 'bg-rose-500 text-white',
                  }

          return (
            <a
              href={safeHref}
              target="_blank"
              rel="noreferrer"
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                platformMeta.className,
              )}
              title={videoInfo?.title || platformMeta.label}
            >
              {platformMeta.logo ? (
                <img
                  src={platformMeta.logo}
                  alt={platformMeta.label}
                  className="h-3.5 w-3.5 shrink-0 rounded-sm bg-white/90 p-[1px]"
                  loading="lazy"
                />
              ) : null}
              <span>{platformMeta.label}</span>
            </a>
          )
        }
        return <InlineVideoEmbed embedUrl={embedUrl} title={videoInfo?.title || 'Video'} />
      }

      return (
        <a
          href={safeHref}
          {...props}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-primary-300/50 dark:hover:bg-primary-700/50 dark:bg-primary-900/50 bg-primary-200/50 text-primary-700 dark:text-primary-300 mx-0.5 rounded-lg px-1 py-0.5 text-[12px]"
        >
          {parseChildrenWithEmojis(children)}
        </a>
      )
    }
    LinkRenderer.displayName = 'MarkdownLinkRenderer'
    return LinkRenderer
  }, [
    mergedMessage.sources,
    isMobile,
    handleMobileSourceClick,
    t,
    getVideoEmbedUrl,
    getVideoPlatform,
  ])

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
        <p className="mb-4" {...props}>
          {parseChildrenWithEmojis(children)}
        </p>
      ),
      h1: createHeadingComponent('h1', 'text-2xl font-bold mb-4', false),
      h2: createHeadingComponent('h2', 'text-xl font-bold mb-4', false),
      h3: createHeadingComponent('h3', 'text-lg font-bold mb-4', false),
      ul: ({ ...props }) => <ul className="mb-4 list-disc space-y-1 pl-5" {...props} />,
      ol: ({ ...props }) => <ol className="mb-4 list-decimal space-y-1 pl-5" {...props} />,
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
      tr: ({ ...props }) => <tr {...props} />,
      th: ({ children, ...props }) => (
        <th
          className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
          {...props}
        >
          <InTableContext.Provider value>
            {parseChildrenWithEmojis(children)}
          </InTableContext.Provider>
        </th>
      ),
      td: ({ children, ...props }) => (
        <td
          className="px-4 py-3 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300"
          {...props}
        >
          <InTableContext.Provider value>
            {parseChildrenWithEmojis(children)}
          </InTableContext.Provider>
        </td>
      ),
      a: MarkdownLinkRenderer,
      img: ({ src, alt }) => {
        const safeSrc = sanitizeMarkdownUrl(src, { allowDataImage: true })
        if (!safeSrc) return null

        return (
          <MessageImage
            src={safeSrc}
            alt={alt}
            openGallery={openGallery}
            isFailed={failedImageUrls.has(safeSrc)}
            imageMetadataRef={imageMetadataRef}
            onImageError={handleImageError}
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
    [
      isDark,
      mergedMessage.sources,
      isMobile,
      handleMobileSourceClick,
      CodeBlock,
      t,
      openGallery,
      handleImageError,
      failedImageUrls,
      getVideoEmbedUrl,
      getVideoPlatform,
      // Note: imageMetadataRef and videoMetadataRef are excluded as they're stable refs that don't trigger re-renders
    ], // Dependencies for markdownComponents
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
      h2: createLocalHeading('h2', 'text-xl font-bold mb-4'),
      h3: createLocalHeading('h3', 'text-lg font-bold mb-4'),
    }
  }, [markdownComponents, messageIndex, parseChildrenWithEmojis])

  const workflowThoughtParts = useMemo(
    () => interleavedContent.filter(part => part.type === 'thought'),
    [interleavedContent],
  )
  const isDeepThinkingStreaming = isStreaming && !hasMainText && workflowThoughtParts.length > 0
  const workflowTextParts = useMemo(
    () => interleavedContent.filter(part => part.type === 'workflow_text'),
    [interleavedContent],
  )
  const contentPartsOutsideWorkflow = useMemo(() => {
    const rawParts = []

    for (let i = 0; i < interleavedContent.length; i++) {
      const part = interleavedContent[i]

      if (part.type === 'text') {
        rawParts.push({ type: 'text', key: `text-${i}`, content: part.content })
        continue
      }

      if (part.type === 'tools' && Array.isArray(part.items)) {
        const formItems = part.items.filter(item => item?.name === 'interactive_form')
        const regularTools = part.items.filter(
          item => item?.name !== 'interactive_form' && item?.name !== 'form_submission_status',
        )

        if (regularTools.length > 0) {
          let prevToolPart = null
          for (let j = rawParts.length - 1; j >= 0; j--) {
            const rp = rawParts[j]
            // Skip over empty/whitespace text blocks when looking for a tool block to merge into
            if (rp.type === 'text' && (!rp.content || !rp.content.trim())) continue
            if (rp.type === 'tools') prevToolPart = rp
            break
          }

          if (prevToolPart) {
            // Merge into previous tools block
            prevToolPart.items = [...prevToolPart.items, ...regularTools]
          } else {
            // Create new tools block
            rawParts.push({
              type: 'tools',
              key: part.key || `tools-${i}`,
              items: [...regularTools],
            })
          }
        }

        if (formItems.length > 0) {
          rawParts.push({
            type: 'interactive_form',
            key: `${part.key || `interactive-form-${i}`}-form`,
            items: formItems,
          })
        }
      }
    }

    // Some streaming paths (e.g. expert synthetic message) can produce many tiny
    // adjacent text segments; merge them before rendering to avoid per-chunk line breaks.
    const shouldMergeAdjacentText = isExpertMessage || compactStreamingTextBlocks
    if (!shouldMergeAdjacentText) return rawParts
    const merged = []
    for (const part of rawParts) {
      const prev = merged[merged.length - 1]
      if (part.type === 'text' && prev?.type === 'text') {
        prev.content = `${prev.content || ''}${part.content || ''}`
        continue
      }
      merged.push({ ...part })
    }
    return merged
  }, [compactStreamingTextBlocks, interleavedContent, isExpertMessage])
  const SEARCH_STEP_TOOLS = useMemo(
    () =>
      new Set([
        'Tavily_web_search',
        'Tavily_academic_search',
        'web_search_using_tavily',
        'web_search_with_tavily',
        'extract_url_content',
        'web_search',
        'search_news',
        'search_arxiv_and_return_articles',
        'search_wikipedia',
      ]),
    [],
  )
  const processSteps = useMemo(() => {
    if (isDeepResearch) return []
    const toolById = new Map()
    for (const tool of toolCallHistory) {
      if (tool?.id) toolById.set(String(tool.id), tool)
    }
    const steps = []
    const parseToolQuery = tool => {
      if (!tool) return ''
      const args = tool.arguments
      if (args && typeof args === 'object' && typeof args.query === 'string') return args.query
      if (typeof args === 'string') {
        try {
          const parsed = JSON.parse(args)
          if (parsed && typeof parsed === 'object' && typeof parsed.query === 'string') {
            return parsed.query
          }
        } catch {
          return ''
        }
      }
      return ''
    }

    const addToolToStep = (targetStep, tool) => {
      const key = tool?.id
        ? String(tool.id)
        : `${tool?.name || 'tool'}:${String(tool?.arguments || '')}:${String(tool?.output || '')}`
      if (!targetStep._toolKeys.has(key)) {
        targetStep._toolKeys.add(key)
        targetStep.items.push(tool)
        if (typeof tool.durationMs === 'number') {
          targetStep.durationMs = (targetStep.durationMs || 0) + tool.durationMs
        }
        const query = parseToolQuery(tool)
        if (query && !targetStep._querySet.has(query)) {
          targetStep._querySet.add(query)
          targetStep.queries.push(query)
        }
      }
    }

    for (const block of normalizedStreamBlocks) {
      if ((block.type === 'reasoning' || block.type === 'thought') && block.content) {
        const lastStep = steps[steps.length - 1]
        if (lastStep?.kind === 'thought') {
          lastStep.content = `${lastStep.content || ''}${block.content || ''}`
          const prevDuration = Number.isFinite(lastStep.durationMs)
            ? Number(lastStep.durationMs)
            : 0
          const nextDuration = Number.isFinite(block.durationMs) ? Number(block.durationMs) : 0
          lastStep.durationMs = prevDuration + nextDuration
        } else {
          steps.push({
            kind: 'thought',
            content: block.content,
            durationMs: Number.isFinite(block.durationMs) ? Number(block.durationMs) : 0,
          })
        }
        continue
      }

      if (block.type === 'tool_call' || block.type === 'tool_result' || block.type === 'tool') {
        const fallbackTool = {
          id: block.toolCallId || null,
          name: block.name || 'tool',
          status: block.status || 'done',
          arguments: block.arguments ?? null,
          output: block.output ?? null,
          durationMs: Number.isFinite(block.durationMs) ? Number(block.durationMs) : null,
        }
        const tool = (block.toolCallId && toolById.get(String(block.toolCallId))) || fallbackTool
        if (
          !tool?.name ||
          tool.name === 'interactive_form' ||
          tool.name === 'form_submission_status'
        ) {
          continue
        }

        const isSearchTool = SEARCH_STEP_TOOLS.has(String(tool.name))
        if (isSearchTool) {
          const lastStep = steps[steps.length - 1]
          if (lastStep?.kind === 'search') {
            addToolToStep(lastStep, tool)
          } else {
            const newSearchStep = {
              kind: 'search',
              items: [],
              queries: [],
              sources: [],
              durationMs: 0,
              _toolKeys: new Set(),
              _querySet: new Set(),
            }
            steps.push(newSearchStep)
            addToolToStep(newSearchStep, tool)
          }
          continue
        }

        const lastStep = steps[steps.length - 1]
        if (lastStep?.kind === 'tools') {
          if (!lastStep._toolKeys.has(String(tool.id || `${tool.name}:${lastStep.items.length}`))) {
            lastStep._toolKeys.add(String(tool.id || `${tool.name}:${lastStep.items.length}`))
            lastStep.items.push(tool)
          }
        } else {
          steps.push({
            kind: 'tools',
            items: [tool],
            _toolKeys: new Set([String(tool.id || `${tool.name}:0`)]),
          })
        }
        continue
      }
    }

    const _allSourcesList = Array.isArray(mergedMessage.sources) ? [...mergedMessage.sources] : []
    const unallocatedSources = new Set(_allSourcesList)

    steps.forEach(step => {
      if (step.kind === 'search') {
        const matchedSources = []
        // Process each tool execution to extract sources directly if possible
        step.items.forEach(t => {
          if (!t.output) return
          let parsed = null
          if (typeof t.output === 'string') {
            try {
              parsed = JSON.parse(t.output)
            } catch (e) {
              const match = t.output.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
              if (match) {
                try {
                  parsed = JSON.parse(match[0])
                } catch (err) {}
              }
            }
          } else if (typeof t.output === 'object') {
            parsed = t.output
          }

          if (parsed) {
            const results =
              parsed.results || parsed.data || parsed.items || (Array.isArray(parsed) ? parsed : [])
            if (Array.isArray(results)) {
              results.forEach(result => {
                const url = result?.url || result?.link || result?.href
                if (url) {
                  matchedSources.push({
                    url,
                    title: result.title || url,
                    snippet: result.snippet || result.description || '',
                    media: result.media || '',
                    icon: result.icon || '',
                  })
                }
              })
            }
          }
        })

        // Fallback: if we couldn't parse directly from output, match by text containment
        if (matchedSources.length === 0) {
          const stepOutputs = step.items
            .map(t => {
              let text = String(t.output || '')
              if (typeof t.output === 'object') {
                try {
                  text = JSON.stringify(t.output)
                } catch (e) {}
              }
              return text
            })
            .join('\n')

          for (const src of unallocatedSources) {
            if (
              (src.url && stepOutputs.includes(src.url)) ||
              (src.title && stepOutputs.includes(src.title)) ||
              (src.id && stepOutputs.includes(`"${src.id}"`))
            ) {
              matchedSources.push(src)
              unallocatedSources.delete(src)
            }
          }
        }

        // Deduplicate matched sources by URL
        const seenUrls = new Set()
        step.sources = matchedSources.filter(src => {
          if (!src.url) return false
          if (seenUrls.has(src.url)) return false
          seenUrls.add(src.url)
          return true
        })
      }
    })

    return steps.map(step => {
      const nextStep = { ...step }
      delete nextStep._toolKeys
      delete nextStep._querySet
      return nextStep
    })
  }, [
    SEARCH_STEP_TOOLS,
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
          className="group/toolrow mb-4 flex w-full items-start gap-3"
        >
          {/* Label Section */}
          <div className="mt-1.5 shrink-0 text-[11px] font-bold tracking-wider text-gray-400 uppercase select-none dark:text-zinc-500">
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
    item => {
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
      const workflowPrefix = isError
        ? t('messageBubble.workflowToolFailedPrefix', '调用失败')
        : isCalling
          ? t('messageBubble.workflowToolCallingPrefix', '调用中')
          : t('messageBubble.workflowToolCalledPrefix', '已调用')

      return (
        <div
          className={clsx(
            'inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-xs! shadow-[0_1px_2px_rgba(0,0,0,0.02)]',
            isError
              ? 'border-red-200/70 bg-red-50/70 text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
              : 'border-primary-200/35 dark:border-primary-700/20 bg-white/65 text-gray-600 dark:bg-zinc-800/40 dark:text-gray-300',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            {isError ? (
              <AlertTriangle size={14} className="shrink-0" />
            ) : ToolIcon ? (
              <ToolIcon size={14} className="shrink-0 opacity-70" />
            ) : (
              <Wrench size={14} className="shrink-0 opacity-70" />
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

  const renderInteractiveFormItem = (item, formKey) => {
    const formData = parseFormPayload(item.arguments) || parseFormPayload(item.output)

    const nextMsg = messages[messageIndex + 1]
    const isInterrupted = nextMsg && nextMsg.role === 'user' && !nextMsg.hitlRunId

    // If the tool status is 'done', it means the form was submitted.
    // Also disable if the user interrupted the flow with a new message.
    const isSubmitted = item.status === 'done'
    const shouldDisableForm = isSubmitted || isInterrupted

    if (formData) {
      return (
        <InteractiveForm
          key={formKey}
          formData={formData}
          onSubmit={handleFormSubmit}
          messageId={message.id}
          isSubmitted={shouldDisableForm}
          submittedValues={parseFormPayload(item.result) || parseFormPayload(item.output) || {}}
          developerMode={developerMode}
          onShowDetails={() => setActiveToolDetail(item)}
        />
      )
    }

    const shouldShowSkeleton = isStreaming || item.status !== 'done'
    if (shouldShowSkeleton) {
      return (
        <div key={`form-skeleton-${formKey}`} className="mb-4 flex items-center py-3">
          <DotLoader />
        </div>
      )
    }

    console.error('Failed to parse interactive form arguments:', item)
    return (
      <div
        key={`form-error-${formKey}`}
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
      >
        Error displaying form
      </div>
    )
  }

  const firstTextPartDisplayIndex = contentPartsOutsideWorkflow.findIndex(
    part => part.type === 'text',
  )
  const renderedMainContent = contentPartsOutsideWorkflow.map((part, idx) => {
    if (part.type === 'text') {
      const contentWithSupports = applyGroundingSupports(
        part.content,
        mergedMessage.groundingSupports,
        mergedMessage.sources,
      )
      const contentWithCitations = formatContentWithSources(
        contentWithSupports,
        mergedMessage.sources,
      )
      const sanitizedMainText =
        isExpertMessage && typeof contentWithCitations === 'string'
          ? normalizeExpertBrokenTokenLines(contentWithCitations)
          : sanitizeDisplayText(contentWithCitations)
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
      <div
        id={messageId}
        ref={el => {
          containerRef.current = el
          if (typeof bubbleRef === 'function') bubbleRef(el)
        }}
        className={clsx('group mt-2.5 flex w-full flex-col gap-1 px-3 sm:px-0')}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        {activeImageUrl &&
          createPortal(
            <div
              className="fixed inset-0 z-10000 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              onClick={() => setActiveImageUrl(null)}
            >
              <button
                onClick={() => setActiveImageUrl(null)}
                className="absolute top-4 right-4 rounded-full bg-black/70 p-2 text-white transition-colors hover:bg-black/80"
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
        {/* User Message Timestamp (Centered Above) */}
        {message.created_at && (
          <div className="my-1 flex w-full justify-center text-xs text-gray-400 select-none dark:text-gray-500">
            {formatMessageDate(message.created_at, t, i18n.language)}
          </div>
        )}

        {/* Scrapbook context banner - shown only for the first message of an associated conversation */}
        {messageIndex === 0 && scrapbookEntry && (
          <div className="mx-auto my-2 w-full max-w-3xl px-0 sm:px-5">
            <ScrapbookContextBanner scrapbookEntry={scrapbookEntry} variant="top" />
          </div>
        )}
        {/* Message Row Wrapper */}
        <div
          className={clsx(
            'mb-4 flex w-full items-center gap-2',
            isDeepResearchContext ? 'justify-center' : 'justify-end',
          )}
        >
          <div
            className={clsx(
              'flex flex-col gap-2',
              // For Deep Research: centered and wide
              // For Standard: right-aligned (user) or left-aligned (AI) but constrained width
              isDeepResearchContext
                ? 'w-full max-w-full items-center'
                : 'max-w-[85%] items-end sm:max-w-[42rem]',
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
                    'relative w-fit max-w-full rounded-[28px] border px-3.5 py-2.5 text-base shadow-[0_10px_24px_-20px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:max-w-[42rem]',
                    'border-primary-300/30 bg-primary-500/88 dark:border-primary-400/20 dark:bg-primary-900/58 text-white dark:text-gray-100',
                  )}
                >
                  {quoteToRender && (
                    <div className="mb-2 rounded-[22px] border border-white/18 bg-white/16 p-3 text-sm dark:border-white/10 dark:bg-black/18">
                      <div className="mb-1 font-medium">{t('messageBubble.quoting')}</div>
                      <div className="line-clamp-2 italic">{quoteToRender.text}</div>
                    </div>
                  )}
                  {imagesToRender.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {imagesToRender.map((img, idx) => (
                        <img
                          key={idx}
                          src={img?.url || img?.image_url?.url}
                          alt="User uploaded"
                          className="h-auto max-h-60 max-w-full cursor-zoom-in rounded-lg object-cover"
                          onClick={event => {
                            event.stopPropagation()
                            setActiveImageUrl(img?.url || img?.image_url?.url)
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div
                    className="message-content wrap-break-word whitespace-pre-wrap"
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
                    {highlightedParts.map((part, index) =>
                      part.type === 'url' ? (
                        <span
                          key={`url-${index}`}
                          className="rounded-sm bg-white/18 px-1 text-white underline decoration-white/70"
                        >
                          {part.value}
                        </span>
                      ) : (
                        <span key={`text-${index}`}>{part.value}</span>
                      ),
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Action Buttons */}
            {!isDeepResearchContext && (
              <div className="flex items-center gap-1 px-1">
                <div className="flex items-center gap-1">
                  {canResendThisQuestion && (
                    <button
                      disabled={isLoading}
                      onClick={() => {
                        if (isLoading) return
                        showConfirmation({
                          title: t('confirmation.resendTitle'),
                          message: t('confirmation.resendMessage'),
                          confirmText: t('common.confirm'),
                          onConfirm: onUserRegenerate,
                        })
                      }}
                      className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                      title={t('messageBubble.regenerate')}
                    >
                      <RotateCcw size={14} />
                      <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[70px] group-hover/icon:opacity-100 sm:block">
                        {t('messageBubble.regenerate')}
                      </span>
                    </button>
                  )}
                  {onEdit && (
                    <button
                      disabled={isLoading}
                      onClick={() => onEdit()}
                      className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                      title={t('messageBubble.edit')}
                    >
                      <Pencil size={14} />
                      <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[50px] group-hover/icon:opacity-100 sm:block">
                        {t('messageBubble.edit')}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      copyToClipboard(contentToRender)
                      setIsCopied(true)
                    }}
                    className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                    title={t('messageBubble.copy')}
                  >
                    {isCopied ? (
                      <>
                        <Check size={14} className="text-emerald-500" />
                        <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap text-emerald-500 opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[60px] group-hover/icon:opacity-100 sm:block">
                          {t('message.copied')}
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[50px] group-hover/icon:opacity-100 sm:block">
                          {t('message.copy')}
                        </span>
                      </>
                    )}
                  </button>
                  <button
                    disabled={isLoading}
                    onClick={() => {
                      if (isLoading) return
                      if (!onDelete) return
                      showConfirmation({
                        title: t('confirmation.deleteMessageTitle'),
                        message: t('confirmation.deleteUserMessage'),
                        confirmText: t('confirmation.delete'),
                        isDangerous: true,
                        onConfirm: onDelete,
                      })
                    }}
                    className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    title={t('common.delete')}
                  >
                    <Trash2 size={14} />
                    <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[60px] group-hover/icon:opacity-100 sm:block">
                      {t('common.delete')}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
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

  const renderExpertTabs = () => {
    if (!isExpertMessage) return null

    if (isMobile) {
      return (
        <div className="relative mb-4 w-full" ref={expertAgentSelectorRef}>
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
              setIsExpertAgentSelectorOpen(prev => !prev)
            }}
            className="flex h-12 w-full items-center justify-between gap-2 rounded-full bg-white/90 py-2 pr-3 pl-3 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-xl transition-all dark:bg-zinc-900/90 dark:text-gray-200"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <AgentAvatar
                agent={expertAgent || { emoji: activeExpertResponse?.agentEmoji }}
                emoji={activeExpertResponse?.agentEmoji}
                size="1.15rem"
              />
              <span className="truncate text-left text-sm font-semibold">
                {activeExpertResponse?.agentName || activeExpertResponse?.agentId}
              </span>
            </span>
            <ChevronDown
              size={15}
              className={clsx(
                'shrink-0 text-gray-400 transition-transform duration-200',
                isExpertAgentSelectorOpen && 'rotate-180',
              )}
            />
          </button>

          {isExpertAgentSelectorOpen && (
            <div
              className="absolute top-full left-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200/60 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/95"
              onMouseDown={e => e.stopPropagation()}
            >
              {expertResponses.map(item => {
                const isActive = item.agentId === activeExpertResponse?.agentId
                return (
                  <button
                    type="button"
                    key={item.agentId}
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setActiveExpertAgentId(item.agentId)
                      setIsExpertAgentSelectorOpen(false)
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors',
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-gray-900 dark:text-gray-100'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-zinc-800/80',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <AgentAvatar
                        agent={
                          agents.find(a => String(a.id) === String(item.agentId)) || {
                            emoji: item.agentEmoji,
                          }
                        }
                        emoji={item.agentEmoji}
                        size="1.3rem"
                      />
                      <span className="text-base font-semibold">{item.agentName || item.agentId}</span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <span
                        className={clsx(
                          'rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wider uppercase',
                          item.agentRole === 'leader'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
                        )}
                      >
                        {item.agentRole === 'leader'
                          ? t('agents.role.leader')
                          : t('agents.role.member')}
                      </span>
                      {item.status === 'error' && (
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                      )}
                      {item.status === 'ready' && (
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                      )}
                      {item.status === 'active' && (
                        <span className="bg-primary-500 h-2 w-2 animate-pulse rounded-full" />
                      )}
                      {item.status === 'waiting' && (
                        <Clock size={12} className="animate-spin-slow text-amber-500" />
                      )}
                      {isActive && <Check size={14} className="text-primary-500" />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="md:code-scrollbar mb-4 flex w-full flex-wrap gap-1 rounded-xl border border-gray-200/70 bg-gray-100/85 p-1 md:w-fit md:max-w-full md:flex-nowrap md:gap-1.5 md:overflow-x-auto md:p-1.5 dark:border-zinc-700/60 dark:bg-zinc-800/55">
        {expertResponses.map(item => {
          const isActive = item.agentId === activeExpertResponse?.agentId
          return (
            <button
              type="button"
              key={item.agentId}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                setActiveExpertAgentId(item.agentId)
              }}
              className={clsx(
                'relative flex min-w-0 flex-1 basis-[calc(50%-0.125rem)] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 sm:basis-auto sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:text-[15px] md:min-h-11 md:flex-none md:px-5 md:py-2 md:text-base',
                isActive
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5 dark:bg-zinc-700 dark:text-gray-100 dark:ring-white/10'
                  : 'text-gray-500 hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-zinc-700/60 dark:hover:text-gray-300',
                item.status === 'active' && 'ring-primary-500/50 ring-2',
              )}
            >
              <AgentAvatar
                agent={
                  agents.find(a => String(a.id) === String(item.agentId)) || {
                    emoji: item.agentEmoji,
                  }
                }
                emoji={item.agentEmoji}
                size="1.35em"
              />
              <span className="min-w-0 truncate">{item.agentName || item.agentId}</span>
              <span
                className={clsx(
                  'ml-1.5 shrink-0 rounded-[4px] px-1.5 py-[3px] text-[9px] font-bold tracking-wide uppercase sm:text-[10px] md:text-[11px]',
                  item.agentRole === 'leader'
                    ? 'bg-amber-100/80 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                    : 'bg-gray-200/50 text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-500',
                )}
              >
                {item.agentRole === 'leader' ? t('agents.role.leader') : t('agents.role.member')}
              </span>

              {/* Status Indicators */}
              {item.status === 'active' && (
                <div className="animate-status-halo ring-primary-500/50 pointer-events-none absolute inset-[-1px] z-10 rounded-lg ring-1" />
              )}
              {item.status === 'ready' && (
                <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                </span>
              )}
              {item.status === 'error' && (
                <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                </span>
              )}
              {item.status === 'waiting' && item.agentRole === 'leader' && (
                <Clock size={12} className="animate-spin-slow ml-1 text-amber-500" />
              )}
            </button>
          )
        })}
      </div>
    )
  }

  const hasPlanText = !!planMarkdown
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
  const shouldShowPlan = isDeepResearch && (hasPlanText || researchPlanLoading)
  const shouldShowResearch = isDeepResearch && hasResearchSteps
  const shouldShowPlanStatus = isDeepResearch && researchPlanLoading
  const shouldShowResearchStatus = isDeepResearch && hasActiveResearchStep

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
  const allSources = useMemo(
    () => (Array.isArray(mergedMessage.sources) ? mergedMessage.sources : []),
    [mergedMessage.sources],
  )
  const workflowProcessSteps = useMemo(() => {
    const base = Array.isArray(processSteps) ? [...processSteps] : []
    if (isDeepResearch) return base

    const shouldShowAnswerStep = Boolean(
      isStreaming || hasMainText || base.length > 0 || typeof wallClockFinalSec === 'number',
    )
    if (!shouldShowAnswerStep) return base

    let finalMs = 0
    if (
      !isStreaming &&
      Number.isFinite(persistedFinalAnswerDurationMs) &&
      persistedFinalAnswerDurationMs > 0
    ) {
      finalMs = persistedFinalAnswerDurationMs
    } else {
      const answerDurationSec =
        typeof wallClockFinalSec === 'number'
          ? wallClockFinalSec
          : typeof wallClockElapsedSec === 'number'
            ? wallClockElapsedSec
            : 0
      finalMs = answerDurationSec > 0 ? Math.max(0, Number(answerDurationSec) * 1000) : 0
    }

    const sumOfBaseMs = base.reduce((sum, step) => {
      if (typeof step.durationMs === 'number') return sum + step.durationMs
      if (step.kind === 'tools' && Array.isArray(step.items)) {
        return (
          sum +
          step.items.reduce(
            (s, it) => s + (typeof it.durationMs === 'number' ? it.durationMs : 0),
            0,
          )
        )
      }
      return sum
    }, 0)

    const cumulativeMs = sumOfBaseMs + finalMs

    base.push({
      kind: 'final_answer',
      status: isStreaming ? 'running' : 'done',
      durationMs: cumulativeMs > 0 ? cumulativeMs : null,
    })
    return base
  }, [
    processSteps,
    wallClockFinalSec,
    isStreaming,
    hasMainText,
    wallClockElapsedSec,
    isDeepResearch,
    persistedFinalAnswerDurationMs,
  ])
  const hasWorkflowFinalAnswerStep = useMemo(
    () => workflowProcessSteps.some(step => step?.kind === 'final_answer'),
    [workflowProcessSteps],
  )
  const finalAnswerWorkflowStep = useMemo(() => {
    for (let i = workflowProcessSteps.length - 1; i >= 0; i -= 1) {
      if (workflowProcessSteps[i]?.kind === 'final_answer') return workflowProcessSteps[i]
    }
    return null
  }, [workflowProcessSteps])
  const workflowSearchStep = useMemo(
    () => workflowProcessSteps.find(step => step.kind === 'search') || null,
    [workflowProcessSteps],
  )
  const workflowThoughtStep = useMemo(() => {
    const thoughtParts = workflowProcessSteps.filter(step => step.kind === 'thought')
    if (thoughtParts.length === 0) return null
    return {
      content: thoughtParts.map(step => String(step.content || '')).join(''),
      durationMs: thoughtParts.reduce(
        (sum, step) => sum + (typeof step.durationMs === 'number' ? step.durationMs : 0),
        0,
      ),
    }
  }, [workflowProcessSteps])
  const workflowToolItems = useMemo(
    () =>
      workflowProcessSteps
        .filter(step => step.kind === 'tools' && Array.isArray(step.items))
        .flatMap(step => step.items || []),
    [workflowProcessSteps],
  )
  const workflowSearchDurationMs = useMemo(
    () =>
      workflowProcessSteps
        .filter(step => step.kind === 'search')
        .reduce(
          (sum, step) => sum + (typeof step.durationMs === 'number' ? step.durationMs : 0),
          0,
        ),
    [workflowProcessSteps],
  )
  const processDurationMs = useMemo(() => {
    const thoughtMs = workflowThoughtStep?.durationMs || 0
    const searchMs = workflowSearchDurationMs || 0
    const toolMs = workflowToolItems.reduce(
      (sum, item) => sum + (typeof item.durationMs === 'number' ? item.durationMs : 0),
      0,
    )
    return thoughtMs + searchMs + toolMs
  }, [workflowThoughtStep?.durationMs, workflowSearchDurationMs, workflowToolItems])
  const processDurationSec = Math.max(0, Math.round(processDurationMs / 1000))
  const completedDurationSec = useMemo(() => {
    let finalMs = 0
    if (
      !isStreaming &&
      Number.isFinite(persistedFinalAnswerDurationMs) &&
      persistedFinalAnswerDurationMs > 0
    ) {
      finalMs = persistedFinalAnswerDurationMs
    } else if (typeof wallClockFinalSec === 'number') {
      finalMs = wallClockFinalSec * 1000
    } else if (typeof wallClockElapsedSec === 'number' && wallClockElapsedSec > 0) {
      finalMs = wallClockElapsedSec * 1000
    }

    const totalMs = processDurationMs + finalMs
    return totalMs > 0 ? Math.max(0, Math.round(totalMs / 1000)) : null
  }, [
    isStreaming,
    persistedFinalAnswerDurationMs,
    processDurationMs,
    wallClockElapsedSec,
    wallClockFinalSec,
  ])
  const finalAnswerDurationMsForDisplay = useMemo(() => {
    // Return cumulative duration for 'final_answer' step display
    if (typeof completedDurationSec === 'number' && completedDurationSec > 0) {
      return completedDurationSec * 1000
    }
    // Fallback if completedDuration doesn't evaluate
    if (Number.isFinite(persistedFinalAnswerDurationMs) && persistedFinalAnswerDurationMs > 0) {
      return persistedFinalAnswerDurationMs + processDurationMs
    }
    return null
  }, [persistedFinalAnswerDurationMs, finalAnswerWorkflowStep?.durationMs, completedDurationSec])
  const activeStreamingStepKind = useMemo(() => {
    if (!isStreaming) return null

    const lastStreamBlock = normalizedStreamBlocks[normalizedStreamBlocks.length - 1]
    const lastStreamType = String(lastStreamBlock?.type || '')
    if (lastStreamType === 'text' && hasStartedAnswerTextStream) {
      return 'final_answer'
    }

    const lastProcessStep = processSteps[processSteps.length - 1]
    if (lastProcessStep?.kind === 'search') return 'search'
    if (lastProcessStep?.kind === 'tools') return 'tools'
    if (lastProcessStep?.kind === 'thought') return 'thought'

    if (hasStartedAnswerTextStream) return 'final_answer'
    return null
  }, [isStreaming, normalizedStreamBlocks, hasStartedAnswerTextStream, processSteps])
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
  const shouldShowWorkflowFinalAnswer = hasMainText && !isStreaming
  const headerSourceLogos = useMemo(() => {
    const logos = []
    for (const source of allSources) {
      const url = source?.url || source?.uri || source?.link || source?.href || ''
      const host = getHostname(url)
      const icon =
        source?.icon || (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : '')
      if (icon) logos.push(icon)
      if (logos.length >= 3) break
    }
    return logos
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

  const workflowPanel =
    workflowProcessSteps.length > 0 ? (
      <details
        className={clsx('group', !isExpertMessage && 'mt-0 mb-4', isExpertMessage && 'mt-4 mb-4')}
        open={isWorkflowExpanded}
        onToggle={event => setIsWorkflowExpanded(event.currentTarget.open)}
      >
        <summary
          className={clsx(
            'flex cursor-pointer list-none items-center justify-between gap-3 py-1.5 text-gray-700 select-none hover:text-gray-900 dark:text-gray-200 dark:hover:text-white',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              {isStreaming ? (
                <>
                  <span>
                    {(() => {
                      if (activeStreamingStepKind === 'final_answer')
                        return t('messageBubble.statusGeneratingAnswer', '正在生成正文')
                      if (activeStreamingStepKind === 'search')
                        return t('messageBubble.statusSearching', '正在搜索')
                      if (activeStreamingStepKind === 'tools')
                        return t('messageBubble.statusCallingTools', '正在调用工具')
                      return t('messageBubble.statusThinking', '正在思考分析')
                    })()}
                  </span>
                  <DotLoader size="sm" />
                </>
              ) : (
                t('messageBubble.completedAnswer', { duration: completedDurationSec })
              )}
            </span>
            {isWorkflowExpanded ? (
              <ChevronDown size={16} className="opacity-60" />
            ) : (
              <ChevronRight size={16} className="opacity-60" />
            )}
          </div>
          {allSources.length > 0 && (
            <button
              type="button"
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                if (isMobile) {
                  handleMobileSourceClick(allSources, t('sources.allSources'))
                  return
                }
                setIsSourcesOpen(prev => !prev)
              }}
              className={clsx(
                'glass-elite-chip inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200',
              )}
            >
              <span className="flex -space-x-2">
                {headerSourceLogos.map((icon, idx) => (
                  <img
                    key={`header-source-${idx}`}
                    src={icon}
                    alt=""
                    className="h-5 w-5 rounded-full border border-white/80 bg-white object-cover dark:border-zinc-800"
                  />
                ))}
              </span>
              <span className="text-xs!">
                {t('sources.allSources')} {allSources.length}
              </span>
              {/* <ChevronRight size={14} className="opacity-60" /> */}
            </button>
          )}
        </summary>
        <div className="glass-elite-soft mt-3 rounded-2xl px-3 py-4">
          <div
            ref={workflowContainerRef}
            className={clsx(
              'max-h-[350px] overflow-y-auto pr-3 sm:max-h-[420px] sm:pr-4',
              'no-scrollbar',
            )}
            style={{ scrollbarGutter: 'stable' }}
          >
            <div className="relative pl-7">
              {workflowProcessSteps.map((step, idx) => {
                const isNotLast =
                  idx < workflowProcessSteps.length - 1 ||
                  allSources.length > 0 ||
                  shouldShowWorkflowFinalAnswer

                if (step.kind === 'thought') {
                  if (!step.content) return null
                  return (
                    <div key={`thought-${idx}`} className="relative mb-4">
                      {isNotLast && (
                        <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                      )}
                      <div className="absolute top-0.75 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                        <BrainCircuit size={16} />
                      </div>
                      <div className="text-base leading-relaxed text-gray-600 dark:text-gray-300">
                        <Streamdown
                          mermaid={mermaidOptions}
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {formatThoughtContentForDisplay(step.content)}
                        </Streamdown>
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'search') {
                  const hasQueries = step.queries && step.queries.length > 0
                  if (!hasQueries) return null
                  const isActiveSearch =
                    isStreaming &&
                    (activeStreamingStepKind === 'search' ||
                      step?.status === 'running' ||
                      step.items?.some(
                        item => item?.status === 'calling' || item?.status === 'running',
                      ))
                  const displaySearchDurationMs =
                    isActiveSearch && searchLiveElapsedSec > 0
                      ? searchLiveElapsedSec * 1000
                      : typeof step.durationMs === 'number'
                        ? step.durationMs
                        : null

                  return (
                    <div key={`search-${idx}`} className="relative mb-4">
                      {isNotLast && (
                        <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                      )}

                      <div className="absolute top-0.75 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                        <Search size={16} />
                      </div>

                      <div className="mb-2 flex items-center justify-between text-lg font-semibold text-gray-700 dark:text-gray-200">
                        <div className="flex items-center gap-2">
                          {(() => {
                            if (isActiveSearch) {
                              return (
                                <>
                                  <span>{t('messageBubble.statusSearching', '正在搜索...')}</span>
                                  <DotLoader size="sm" />
                                </>
                              )
                            }
                            const count = step.sources?.length || 0
                            return t('messageBubble.searchFound', { count })
                          })()}
                        </div>
                        {(() => {
                          if (typeof displaySearchDurationMs === 'number') {
                            return (
                              <span className="shrink-0 text-xs! font-normal text-gray-500 dark:text-gray-400">
                                {t('messageBubble.toolDuration', {
                                  duration: (displaySearchDurationMs / 1000).toFixed(1),
                                })}
                              </span>
                            )
                          }
                          return null
                        })()}
                      </div>

                      <div className="text-base leading-relaxed text-gray-600 dark:text-gray-300">
                        {/* Search Queries row */}
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {step.queries.map(query => (
                            <span
                              key={`query-${query}`}
                              className="inline-flex items-center rounded-lg border border-gray-200/80 bg-white px-2.5 py-1 text-[11px]! text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300"
                            >
                              <Search size={12} className="mr-1.5 opacity-70" />
                              {query}
                            </span>
                          ))}
                        </div>

                        {/* Sources row */}
                        {step.sources && step.sources.length > 0 && (
                          <div className="mb-2">
                            <SearchSourcesList sources={step.sources} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'tools') {
                  if (!step.items || step.items.length === 0) return null
                  const isExpanded = expandedToolsSteps.has(idx)
                  const displayItems = isExpanded ? step.items : step.items.slice(0, 2)
                  const hasMoreItems = step.items.length > 2

                  return (
                    <div key={`tools-${idx}`} className="relative mb-4">
                      {isNotLast && (
                        <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                      )}
                      <div className="absolute top-0.75 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                        <Wrench size={16} />
                      </div>

                      <div className="flex w-full flex-col gap-3 md:flex-row md:items-start md:gap-4">
                        {/* Label Section */}
                        <div className="shrink-0 text-[11px] font-bold tracking-wider text-gray-400 uppercase select-none md:mt-1.5 dark:text-zinc-500">
                          {t('messageBubble.workflowToolCalledPrefix', '已调用')}
                        </div>

                        {/* Vertical Tools List Section */}
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="space-y-2">
                            {displayItems.map((item, itemIdx) => {
                              const hasDuration = typeof item.durationMs === 'number'
                              const isLastItem = itemIdx === displayItems.length - 1
                              return (
                                <div
                                  key={item.id || `${item.name}-${item.arguments}`}
                                  className="group/workflowitem space-y-1.5"
                                >
                                  <div className="flex items-center gap-3 overflow-x-hidden">
                                    <div className="min-w-0">{renderWorkflowToolCapsule(item)}</div>

                                    {/* PC Desktop: Action items inline with the last item */}
                                    {isLastItem && hasMoreItems && (
                                      <div className="hidden items-center gap-2 md:flex">
                                        {!isExpanded && (
                                          <span className="ml-1 text-sm tracking-widest text-gray-300 dark:text-zinc-700">
                                            ...
                                          </span>
                                        )}
                                        <div
                                          onClick={() => toggleToolsStep(idx)}
                                          className="group/tooltoggle flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                                          title={
                                            isExpanded
                                              ? t('common.collapse', '收起')
                                              : t(
                                                  'common.expand',
                                                  `展开剩余 ${step.items.length - 2} 项`,
                                                )
                                          }
                                        >
                                          <div
                                            className={clsx(
                                              'transition-transform duration-300',
                                              isExpanded ? 'rotate-180' : 'rotate-0',
                                              'group-hover/tooltoggle:text-primary-600 dark:group-hover/tooltoggle:text-primary-400',
                                            )}
                                          >
                                            <ChevronDown size={14} />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {hasDuration && (
                                      <span className="ml-auto shrink-0 text-xs! whitespace-nowrap text-gray-500 dark:text-gray-400">
                                        {t('messageBubble.toolDuration', {
                                          duration: (item.durationMs / 1000).toFixed(2),
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="pl-1 text-base text-gray-600 transition-colors group-hover/workflowitem:text-gray-900 dark:text-gray-300 dark:group-hover/workflowitem:text-zinc-200">
                                    {renderToolQueryPreview(item, 'truncate opacity-80')}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* Mobile Only: Action items at the bottom inline */}
                          {hasMoreItems && (
                            <div className="flex items-center gap-2 pt-1 md:hidden">
                              {!isExpanded && (
                                <span className="text-sm tracking-widest text-gray-300 dark:text-zinc-700">
                                  ...
                                </span>
                              )}
                              <div
                                onClick={() => toggleToolsStep(idx)}
                                className="group/tooltoggle flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                              >
                                <div
                                  className={clsx(
                                    'transition-transform duration-300',
                                    isExpanded ? 'rotate-180' : 'rotate-0',
                                    'group-hover/tooltoggle:text-primary-600 dark:group-hover/tooltoggle:text-primary-400',
                                  )}
                                >
                                  <ChevronDown size={14} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'final_answer') return null

                return null
              })}

              {allSources.length > 0 && (
                <div className="relative mb-4 pt-2">
                  {(shouldShowWorkflowFinalAnswer || hasWorkflowFinalAnswerStep) && (
                    <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                  )}
                  <div className="absolute top-2.5 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                    <Link size={16} />
                  </div>
                  <div className="mb-3 text-base font-semibold text-gray-700 dark:text-gray-200">
                    {t('messageBubble.organizedSources', '整理参考资料')}
                  </div>
                  <DesktopSourcesSection sources={allSources} isOpen />
                </div>
              )}
              {hasWorkflowFinalAnswerStep && (
                <div className="relative">
                  <div className="absolute top-0.5 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                    {isStreaming ? <DotLoader size="6px" gap="3px" /> : <Check size={16} />}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-base font-medium text-gray-600 dark:text-gray-300">
                      <span>
                        {isStreaming
                          ? t('messageBubble.statusGeneratingAnswer', '正文生成中')
                          : t('messageBubble.finalAnswerStep', '生成最终回答')}
                      </span>
                    </div>
                    {typeof finalAnswerDurationMsForDisplay === 'number' && (
                      <span className="shrink-0 text-xs! text-gray-500 dark:text-gray-400">
                        {t('messageBubble.toolDuration', {
                          duration: (finalAnswerDurationMsForDisplay / 1000).toFixed(1),
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {shouldShowWorkflowFinalAnswer && !hasWorkflowFinalAnswerStep && (
                <div className="relative">
                  <div className="absolute top-0.5 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                    <DotLoader size="6px" gap="3px" />
                  </div>
                  <div className="text-base font-medium text-gray-600 dark:text-gray-300">
                    {t('messageBubble.finalAnswerStep')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </details>
    ) : null
  const expertPlanPanel =
    isExpertMessage && expertPlanBlock ? (
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <BrainCircuit size={15} className="text-primary-500/80 dark:text-primary-300/75" />
          <span className="text-sm font-medium tracking-tight">
            {t('messageBubble.expertPlan')}
          </span>
        </div>
        <div className="border-primary-200/45 bg-primary-50/30 dark:border-primary-700/25 dark:bg-primary-900/12 rounded-xl border px-3.5 py-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          <Streamdown
            mermaid={mermaidOptions}
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {sanitizeDisplayText(
              formatContentWithSources(
                applyGroundingSupports(
                  expertPlanBlock.content,
                  mergedMessage.groundingSupports,
                  mergedMessage.sources,
                ),
                mergedMessage.sources,
              ),
            )}
          </Streamdown>
        </div>
      </div>
    ) : null

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

      {expertPlanPanel}

      {/* Provider/Model Header Container */}
      <div className="mb-4 flex flex-col gap-1">
        {/* Expert Tabs (Moved Top) */}
        {renderExpertTabs()}

        {/* Avatar and Info Row */}
        <div className="text-gray-900 dark:text-gray-100">
          {hasAgentBanner ? (
            <AgentBannerSurface
              imageSrc={agentBannerImage}
              imageAlt={displayAgentName || 'Agent banner'}
              agent={displayAgent || { emoji: agentEmoji, name: displayAgentName }}
              displayName={displayAgentName}
              providerId={providerMeta.id}
              providerLabel={providerMeta.label}
              providerFallback={providerMeta.fallback}
              model={resolvedModel}
              onAvatarClick={handleAgentClick}
              isAvatarClickable={Boolean(targetAgent)}
            />
          ) : (
            <div className="relative flex items-center gap-3">
              {agentName ? (
                <>
                  <div
                    className={clsx(
                      'inline-flex max-w-[min(88%,34rem)] items-center gap-3',
                      hasAgentBanner &&
                        'self-end rounded-[28px] border border-black/8 bg-white/32 px-3 py-2 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md dark:border-white/12 dark:bg-black/22 dark:shadow-[0_14px_30px_-18px_rgba(0,0,0,0.9)]',
                    )}
                  >
                    <div
                      onClick={handleAgentClick}
                      className={clsx(
                        targetAgent && 'cursor-pointer transition-opacity hover:opacity-80',
                      )}
                    >
                      <AgentAvatar
                        agent={displayAgent || { emoji: agentEmoji, name: displayAgentName }}
                        emoji={agentEmoji}
                        size="2.5rem"
                        className={clsx(
                          'shadow-inner transition hover:scale-105',
                          hasAgentBanner
                            ? 'border-black/10 bg-white/24 dark:border-white/20 dark:bg-white/10'
                            : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-zinc-800',
                          displayAgentShape === AGENT_AVATAR_SHAPE_CIRCLE
                            ? 'rounded-full'
                            : 'rounded-[22%]',
                        )}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col leading-tight">
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={clsx(
                              'text-sm font-semibold',
                              hasAgentBanner &&
                                'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
                            )}
                          >
                            {displayAgentName}
                          </span>
                        </div>
                      </div>
                      <div
                        className={clsx(
                          'flex w-fit max-w-full items-center gap-1.5 rounded-full text-xs',
                          hasAgentBanner
                            ? 'bg-black/18 px-2.5 py-1 text-white/96 ring-1 ring-white/22 dark:bg-black/30 dark:text-white/92 dark:ring-white/10'
                            : 'text-gray-500 dark:text-gray-400',
                        )}
                      >
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
                        <span className="truncate">{providerMeta.label}</span>
                        {getModelIcon(resolvedModel) && (
                          <img
                            src={getModelIcon(resolvedModel)}
                            alt=""
                            width={12}
                            height={12}
                            className={clsx(
                              'h-3 w-3 object-contain',
                              getModelIconClassName(resolvedModel),
                            )}
                            loading="lazy"
                          />
                        )}
                        <span className="truncate">{resolvedModel}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    onClick={handleAgentClick}
                    className={clsx(
                      'flex items-center justify-center overflow-hidden rounded-full shadow-inner',
                      hasAgentBanner ? 'bg-white/14' : '',
                      targetAgent && 'cursor-pointer transition-opacity hover:opacity-80',
                    )}
                  >
                    {renderProviderIcon(providerMeta.id, {
                      size: 30,
                      alt: providerMeta.label,
                      wrapperClassName: 'p-0 w-10 h-10',
                      imgClassName: 'w-full h-full object-contain',
                    }) || (
                      <span
                        className={clsx(
                          'text-sm font-semibold',
                          hasAgentBanner ? 'text-white' : 'text-gray-700 dark:text-gray-200',
                        )}
                      >
                        {providerMeta.fallback?.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex grow flex-col leading-tight">
                    <div className="flex w-full items-center justify-between">
                      <span className="text-sm font-semibold">{providerMeta.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {getModelIcon(resolvedModel) && (
                        <img
                          src={getModelIcon(resolvedModel)}
                          alt=""
                          width={14}
                          height={14}
                          className={clsx(
                            'h-3.5 w-3.5 object-contain',
                            getModelIconClassName(resolvedModel),
                          )}
                          loading="lazy"
                        />
                      )}
                      <span
                        className={clsx(
                          'text-xs',
                          hasAgentBanner ? 'text-white/82' : 'text-gray-500 dark:text-gray-400',
                        )}
                      >
                        {resolvedModel}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {headerExtraContent}

      {/* Thinking Process Section */}
      {isDeepResearch ? (
        <>
          {shouldShowPlan && (
            <div className="mb-4">
              <button
                onClick={() => setIsPlanExpanded(!isPlanExpanded)}
                className="flex w-full items-center justify-between py-1 text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <BrainCircuit
                    size={15}
                    className="text-primary-500/80 dark:text-primary-300/75"
                  />
                  <span className="text-sm">{t('messageBubble.planProcess')}</span>
                  {!shouldShowPlanStatus && <Check size="1em" />}
                  {shouldShowPlanStatus && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="mr-4 text-left transition-opacity duration-200 ease-out">
                        {researchStatusText}
                      </span>
                      <DotLoader />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isPlanExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              {isPlanExpanded && (hasPlanText || shouldShowPlanStatus) && (
                <div className="mt-1 border-l border-gray-300/80 pl-4 text-sm leading-relaxed text-gray-600 font-stretch-semi-condensed dark:border-zinc-700/80 dark:text-gray-400">
                  {planStepsForCards.length > 0 ? (
                    <div className="space-y-4">
                      <div className="border-primary-200/38 dark:border-primary-700/22 rounded-lg border bg-white/72 p-3 dark:bg-zinc-800/62">
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                          {parsedResearchPlan?.research_type
                            ? `${t('messageBubble.researchType')}: ${
                                parsedResearchPlan.research_type === 'academic'
                                  ? t('messageBubble.researchTypeAcademic')
                                  : t('messageBubble.researchTypeGeneral')
                              }`
                            : t('messageBubble.researchPlan')}
                        </div>
                        {parsedResearchPlan?.goal && (
                          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            {parsedResearchPlan.goal}
                          </div>
                        )}
                        {(parsedResearchPlan?.complexity || parsedResearchPlan?.question_type) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            {parsedResearchPlan?.complexity && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-zinc-700/70">
                                {t('messageBubble.researchComplexity')}:{' '}
                                {parsedResearchPlan.complexity}
                              </span>
                            )}
                            {parsedResearchPlan?.question_type && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-zinc-700/70">
                                {t('messageBubble.researchQuestionType')}:{' '}
                                {parsedResearchPlan.question_type}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {planStepsForCards.map((step, stepIdx) => {
                        const criteria = Array.isArray(step.acceptance_criteria)
                          ? step.acceptance_criteria.filter(Boolean)
                          : []
                        return (
                          <div
                            key={`plan-step-card-${step.step || stepIdx}`}
                            className="border-primary-200/38 dark:border-primary-700/22 rounded-lg border bg-white/72 p-3 dark:bg-zinc-800/62"
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-gray-700 dark:text-gray-200">
                                {t('messageBubble.researchStepLabel', {
                                  step: step.step || stepIdx + 1,
                                  total: planStepsForCards.length,
                                })}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                              {step.action || '-'}
                            </div>
                            <div className="mt-2 space-y-1 text-[12px] text-gray-600 dark:text-gray-400">
                              {step.thought && (
                                <div>
                                  {t('messageBubble.researchThought')}: {step.thought}
                                </div>
                              )}
                              {step.expected_output && (
                                <div>
                                  {t('messageBubble.researchExpected')}: {step.expected_output}
                                </div>
                              )}
                              {step.deliverable_format && (
                                <div>
                                  {t('messageBubble.researchDeliverableFormat')}:{' '}
                                  {step.deliverable_format}
                                </div>
                              )}
                              {step.depth && (
                                <div>
                                  {t('messageBubble.researchDepth')}: {step.depth}
                                </div>
                              )}
                              {typeof step.requires_search === 'boolean' && (
                                <div>
                                  {t('messageBubble.researchRequiresSearch')}:{' '}
                                  {step.requires_search ? '✅' : '❌'}
                                </div>
                              )}
                              {criteria.map((item, idx) => (
                                <div key={`plan-criteria-${stepIdx}-${idx}`}>
                                  {t('messageBubble.researchAcceptanceCriteria')}: {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="[&>div>p:last-child]:mb-0!">
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
            </div>
          )}

          {shouldShowResearch && (
            <div className="mb-4">
              <button
                onClick={() => setIsResearchExpanded(!isResearchExpanded)}
                className="flex w-full items-center justify-between py-1 text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <BrainCircuit
                    size={15}
                    className="text-primary-500/80 dark:text-primary-300/75"
                  />
                  <span className="text-sm">{t('messageBubble.researchProcess')}</span>
                  {!shouldShowResearchStatus && <Check size="1em" />}
                  {shouldShowResearchStatus && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="mr-4 text-left transition-opacity duration-200 ease-out">
                        {researchStatusText}
                      </span>
                      <DotLoader />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isResearchExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              {isResearchExpanded && hasResearchSteps && (
                <div className="mt-1 border-l border-gray-300/80 pl-4 text-sm leading-relaxed text-gray-600 font-stretch-semi-condensed dark:border-zinc-700/80 dark:text-gray-400 [&>div>p:last-child]:mb-0!">
                  {researchSteps.map(step => {
                    const isRunning = step.status === 'running'
                    const isPending = step.status === 'pending'
                    const isActive = isRunning || isPending
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
                        : isRunning
                          ? t('messageBubble.researchStepStatusRunning')
                          : t('messageBubble.researchStepStatusPending')
                    return (
                      <div
                        key={
                          step.stepKey ||
                          (Number.isFinite(Number(step.step))
                            ? `research-step-${Number(step.step)}`
                            : `research-step-${step.streamOrder ?? step.title ?? 'unknown'}`)
                        }
                        className="border-primary-200/38 dark:border-primary-700/22 mb-4 flex items-start gap-3 rounded-lg border bg-white/72 p-3 dark:bg-zinc-800/62"
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
                                'rounded-full px-2 py-0.5 text-[11px]',
                                isError
                                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                  : isDone
                                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-200/70 text-gray-600 dark:bg-zinc-700/70 dark:text-gray-400',
                              )}
                            >
                              {statusLabel}
                            </span>
                            {isActive && <DotLoader />}
                            {durationLabel && (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                {durationLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {step.title}
                            {isActive ? '...' : ''}
                          </div>
                          {step.error && (
                            <div className="text-[11px] text-red-500 dark:text-red-400">
                              {step.error}
                            </div>
                          )}
                          {stepToolCalls.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <div className="my-2 h-[0.5px] w-full bg-gray-200 dark:bg-zinc-700"></div>
                              {/* <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                {t('messageBubble.toolCalls')}
                              </div> */}
                              <div className="space-y-1 overflow-hidden">
                                {stepToolCalls.map(item => {
                                  const IconComponent = getToolIconComponent(item.name)
                                  return (
                                    <div
                                      key={item.id || `${item.name}-${item.arguments}`}
                                      className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
                                    >
                                      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-1 sm:gap-1.5">
                                        <span className="flex items-center gap-1 font-medium whitespace-nowrap text-gray-600 dark:text-gray-300">
                                          {item.status === 'error' ? (
                                            <AlertTriangle
                                              size={12}
                                              className="text-red-500 dark:text-red-400"
                                            />
                                          ) : (
                                            IconComponent && (
                                              <IconComponent
                                                size={12}
                                                className="text-gray-500 dark:text-gray-400"
                                              />
                                            )
                                          )}
                                          {item.status === 'error'
                                            ? t('messageBubble.toolCallError')
                                            : getToolDisplayName(item)}
                                        </span>
                                        <div className="flex min-w-0 items-center">
                                          {renderToolQueryPreview(item)}
                                        </div>
                                        {typeof item.durationMs === 'number' && (
                                          <span className="text-[10px] whitespace-nowrap text-gray-500 dark:text-gray-400">
                                            {t('messageBubble.toolDuration', {
                                              duration: (item.durationMs / 1000).toFixed(2),
                                            })}
                                          </span>
                                        )}
                                        <span
                                          className={clsx(
                                            'ml-auto flex min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px]',
                                            item.status === 'error'
                                              ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                              : item.status === 'done'
                                                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-gray-200/70 text-gray-600 dark:bg-zinc-700/70 dark:text-gray-400',
                                          )}
                                        >
                                          {item.status === 'error' ? (
                                            <X className="h-3 w-3" />
                                          ) : item.status === 'done' ? (
                                            <Check className="h-3 w-3" />
                                          ) : (
                                            <DotLoader />
                                          )}
                                        </span>
                                        {developerMode ? (
                                          <button
                                            type="button"
                                            onClick={() => setActiveToolDetail(item)}
                                            className="text-primary-600 dark:text-primary-300 justify-self-end text-[10px] whitespace-nowrap hover:underline"
                                          >
                                            {t('messageBubble.toolDetails')}
                                          </button>
                                        ) : (
                                          <span aria-hidden="true" />
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
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
      ) : null}

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
          {isExpertMessage && activeExpertResponse?.task && (
            <div className="border-primary-200/50 bg-primary-50/26 dark:border-primary-700/30 dark:bg-primary-900/12 mb-4 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
              <div className="flex items-start gap-2.5">
                <span className="bg-primary-500 mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span>{activeExpertResponse.task}</span>
              </div>
            </div>
          )}
          {workflowPanel}
          {renderedMainContent}
          {renderInitialSkeleton && (
            <div
              className={clsx(
                'mb-4 inline-flex items-center gap-2 transition-opacity duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]',
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
            <div className="mb-4 inline-flex items-center pl-1">
              <DotLoader />
            </div>
          )}
          {isDeepResearch && isStreaming && !hasMainText && !hasActiveResearchStep && (
            <div className="mt-4 flex items-center gap-2 pl-1">
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
        message={mergedMessage}
        isSourcesOpen={isSourcesOpen}
        documentSources={mergedMessage.documentSources}
        isDocumentSourcesOpen={isDocumentSourcesOpen}
        onToggleSources={() => setIsSourcesOpen(prev => !prev)}
        onToggleDocumentSources={() => setIsDocumentSourcesOpen(prev => !prev)}
        onOpenMobileSources={() =>
          handleMobileSourceClick(mergedMessage.sources, t('sources.allSources'))
        }
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

      {/* Document Sources Panel */}
      {mergedMessage.documentSources && mergedMessage.documentSources.length > 0 && (
        <DocumentSourcesPanel
          sources={mergedMessage.documentSources}
          isOpen={isDocumentSourcesOpen}
          onClose={() => setIsDocumentSourcesOpen(false)}
        />
      )}

      {/* Desktop Sources Drawer */}
      {!isMobile && mergedMessage.sources && mergedMessage.sources.length > 0 && (
        <DesktopSourcesSheet
          isOpen={isSourcesOpen}
          onClose={() => setIsSourcesOpen(false)}
          sources={mergedMessage.sources}
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
            className="animate-in fade-in fixed inset-0 z-[10001] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl duration-300"
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
          className="bg-primary-200/50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 hover:bg-primary-300/50 dark:hover:bg-primary-700/50 mx-0.5 cursor-pointer rounded-lg px-1 py-0.5 text-[12px] transition-colors"
        >
          {parseChildrenWithEmojis(label)}
        </span>
      </span>

      {isOpen &&
        !isMobile &&
        createPortal(
          <div
            className="citation-dropdown fixed z-9999 flex w-64 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
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
                  className="flex items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-100 text-[9px] font-medium text-gray-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-xs font-medium text-gray-800 dark:text-gray-200">
                      {source.title}
                    </span>
                    <span className="block truncate text-[10px]! text-gray-400 dark:text-gray-500">
                      <span className="inline-flex items-center gap-1.5">
                        {faviconUrl && (
                          <img src={faviconUrl} alt="" className="h-3 w-3 rounded-sm" />
                        )}
                        <span className="truncate">{hostname}</span>
                      </span>
                    </span>
                    {snippet && (
                      <span className="mt-1 line-clamp-2 block text-[10px] text-gray-500 dark:text-gray-400">
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

export default React.memo(MessageBubble)
