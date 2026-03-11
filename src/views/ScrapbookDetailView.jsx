import { useLoaderData, useParams, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Globe,
  Loader2,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAppContext } from '../App'
import {
  buildScrapbookSystemAgentPayload,
  DEFAULT_AGENT_ID,
  DEEP_RESEARCH_AGENT_ID,
  SCRAPBOOK_AGENT_ID,
  isDeepResearchSystemAgent,
} from '../lib/systemAgents'
import {
  buildScrapbookStylePrompt,
  getScrapbookEntryById,
  deleteScrapbookEntry,
  getPlatformLabel,
  notifyScrapbookChanged,
  resolveScrapbookModelConfig,
} from '../lib/scrapbookService'
import {
  createConversation,
  getConversationByScrapbookId,
  notifyConversationsChanged,
} from '../lib/conversationsService'
import ChatInterface from '../components/ChatInterface'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import ConversationMarkdown from '../components/markdown/ConversationMarkdown'
import {
  generateEmojiViaBackend,
  generateTitleViaBackend,
  streamChatViaBackend,
} from '../lib/backendClient'
import { getBackendUrl } from '../lib/settings'

const PLATFORM_COLORS = {
  xhs: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:border-red-900/30',
  wechat:
    'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30',
  youtube: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:border-rose-900/30',
  bilibili: 'bg-sky-50 text-sky-600 border-sky-100 dark:bg-sky-900/20 dark:border-sky-900/30',
  twitter:
    'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300',
  telegram: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:border-blue-900/30',
  rss: 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/20 dark:border-orange-900/30',
  manual:
    'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:border-purple-900/30',
  unknown: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:border-gray-700',
}

const stripGeneratedTitlePrefix = value => {
  if (!value) return ''
  const trimmed = String(value).trim()
  return trimmed.replace(/^(?:title|标题)\s*[:：]\s*/i, '').trim() || trimmed
}

export default function ScrapbookDetailView() {
  const { t } = useTranslation()
  const { defaultAgent, isSidebarPinned, showConfirmation, scrapbookAgent } = useAppContext()
  const { entryId } = useParams({ strict: false })
  const navigate = useNavigate()

  const [entry, setEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Streaming summary states
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamedSummary, setStreamedSummary] = useState('')
  const [generationError, setGenerationError] = useState(null)
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false)

  // Embedded Chat states
  const [isChatOpen, setIsChatOpen] = useState(false)
  
  useEffect(() => {
    // Open by default on desktop
    if (window.innerWidth >= 1024) {
      setIsChatOpen(true)
    }
  }, [])
  const [chatConversation, setChatConversation] = useState(null)
  const [chatLoading, setChatLoading] = useState(false)
  const creationInFlightRef = useRef(false)

  useEffect(() => {
    async function load() {
      if (!entryId) return
      setLoading(true)
      const { data, error } = await getScrapbookEntryById(entryId)
      if (error) {
        setError(error)
      } else {
        setEntry(data)
        // Also check for existing conversation or create a new one
        setChatLoading(true)
        try {
          const { data: conv } = await getConversationByScrapbookId(entryId)
          if (conv) {
            setChatConversation(conv)
          } else {
            if (creationInFlightRef.current) return
            creationInFlightRef.current = true
            // Create a new one with fixed parameters
            const { data: newConv } = await createConversation({
              title: data.title || 'Untitled',
              scrapbook_id: entryId,
              agent_selection_mode: 'manual',
              last_agent_id: SCRAPBOOK_AGENT_ID,
            })
            if (newConv) {
              setChatConversation(newConv)
              notifyConversationsChanged({ scopes: ['library'] })
            }
            creationInFlightRef.current = false
          }
        } catch (err) {
          console.error('[Scrapbook] Failed to load/create conversation:', err)
        } finally {
          setChatLoading(false)
        }
      }
      setLoading(false)
    }
    load()
  }, [entryId])

  const handleRegenerateTitle = async () => {
    if (!entry || isRegeneratingTitle) return

    const modelConfig = await resolveScrapbookModelConfig(defaultAgent, 'generateTitle')
    if (!modelConfig.apiKey) return

    const provider = modelConfig.provider || 'gemini'
    const model = modelConfig.model || ''
    const apiKey = modelConfig.apiKey || ''
    const baseUrl = modelConfig.baseUrl || ''

    const promptText = [
      `Platform: ${entry.platform || 'unknown'}`,
      entry.source_url ? `Source URL: ${entry.source_url}` : '',
      '',
      'Content excerpt:',
      String(entry.content || entry.summary || entry.title || '').slice(0, 3000),
      '',
      'Scrapbook style instructions:',
      buildScrapbookStylePrompt('title', modelConfig.scrapbookAgent || modelConfig.scrapbookStyle),
    ]
      .filter(Boolean)
      .join('\n')

    setIsRegeneratingTitle(true)
    try {
      let nextTitle = ''
      let nextEmoji = typeof entry.emoji === 'string' ? entry.emoji : ''

      const titlePromise = generateTitleViaBackend(
        provider,
        promptText,
        apiKey,
        baseUrl,
        model,
      ).then(result => {
        const rawTitle = String(result?.title || '').trim()
        if (!rawTitle) return result
        nextTitle = rawTitle
        setEntry(prev => (prev ? { ...prev, title: rawTitle } : prev))
        return result
      })

      const emojiPromise = generateEmojiViaBackend(provider, promptText, apiKey, baseUrl, model)
        .then(result => {
          const emoji = Array.isArray(result?.emojis) ? String(result.emojis[0] || '').trim() : ''
          if (!emoji) return result
          nextEmoji = emoji
          setEntry(prev => (prev ? { ...prev, emoji } : prev))
          return result
        })
        .catch(err => {
          console.error('[Scrapbook] Emoji regenerate failed:', err)
          return { emojis: [] }
        })

      await Promise.allSettled([titlePromise, emojiPromise])

      if (!nextTitle) return
      try {
        await fetch(`${getBackendUrl()}/api/scrapbook/${entry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: nextTitle,
            emoji: nextEmoji || null,
          }),
        })
        notifyScrapbookChanged({
          type: 'updated',
          entry: {
            ...entry,
            title: nextTitle,
            emoji: nextEmoji || null,
          },
        })
      } catch (patchErr) {
        console.error('[Scrapbook] Failed to persist regenerated title:', patchErr)
      }
    } catch (err) {
      console.error('[Scrapbook] Title regenerate failed:', err)
    } finally {
      setIsRegeneratingTitle(false)
    }
  }

  const handleDelete = () => {
    showConfirmation({
      title: t('scrapbook.detail.deleteConfirmTitle'),
      message: t('scrapbook.detail.deleteConfirmMsg'),
      confirmText: t('scrapbook.detail.deleteConfirmBtn'),
      isDangerous: true,
      onConfirm: async () => {
        const { error } = await deleteScrapbookEntry(entryId)
        if (!error) {
          navigate({ to: '/scrapbook' })
        }
      },
    })
  }

  // Calculate system context for AI
  const scrapbookContext = useMemo(() => {
    if (!entry) return ''
    const contextLines = [
      `The following is a scrapbook entry the user is reading. Please answer their follow-up questions based on this content:`,
      ``,
      `Title: ${entry.title || '(Untitled)'}`,
      entry.source_url ? `Source: ${entry.source_url}` : '',
      ``,
      entry.summary || entry.content || '',
    ].filter(s => s !== null && s !== undefined)
    return contextLines.join('\n').trim()
  }, [entry])

  // Handle "Ask" — instead of navigating, just open/scroll to embedded chat
  const handleAskQuestion = () => {
    if (!isChatOpen) {
      setIsChatOpen(true)
    }
    // Mobile: we might want to scroll to top of chat or similar
  }

  // Auto-trigger generation
  const hasTriggeredRef = useRef(false)

  // Reset trigger when entryId changes
  useEffect(() => {
    hasTriggeredRef.current = false
  }, [entryId])

  useEffect(() => {
    if (loading || !entry) return

    // If already has summary, mark as triggered so we don't accidentally generate
    if (entry.summary) {
      hasTriggeredRef.current = true
      return
    }

    if (
      entry.content &&
      !isGenerating &&
      !streamedSummary &&
      !generationError &&
      !hasTriggeredRef.current
    ) {
      hasTriggeredRef.current = true
      handleGenerateDeepSummary()
    }
  }, [entry, loading, isGenerating, streamedSummary, generationError])

  const handleGenerateDeepSummary = async () => {
    if (!entry?.content) return
    setIsGenerating(true)
    setStreamedSummary('')
    setGenerationError(null)

    try {
      // 1. Resolve Provider models
      const modelConfig = await resolveScrapbookModelConfig(defaultAgent, 'streamChatCompletion')
      if (!modelConfig.apiKey) {
        setGenerationError(t('scrapbook.generate.missingApiKey'))
        setIsGenerating(false)
        return
      }

      const provider = modelConfig.provider || 'gemini'
      const model = modelConfig.model || ''
      const apiKey = modelConfig.apiKey || ''
      const baseUrl = modelConfig.baseUrl || ''

      // 2. Draft the specialized generation prompt
      const systemPrompt = `You are an expert content analyzer and summarizer.
Your ONLY task is to write a highly structured, comprehensive and beautiful summary in Markdown of the provided web content.
Do NOT include any conversational filler (e.g. "Here is the summary").
Do NOT output your reasoning or thinking process. Just output the final Markdown summary directly.

Feel free to organize the content into logical sections, bullet points, or tables where appropriate to make it easy to read.

If the original content contains image links (e.g. \`![alt](url)\`), please embed 1-3 of the most relevant and important images within your summary.

${buildScrapbookStylePrompt('summary', modelConfig.scrapbookAgent || modelConfig.scrapbookStyle)}`

      const userPrompt = `Content Platform: ${entry.platform}
Source URL: ${entry.source_url}

Content:
${entry.content}`

      let finalSummary = ''
      let insideThinkBlock = false

      await streamChatViaBackend({
        provider,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        apiKey,
        baseUrl,
        model,
        temperature: 0.3,
        top_p: 0.9,
        thinking: false,
        onChunk: chunkObj => {
          const raw = chunkObj?.content || ''
          // Skip native thought chunks (Gemini Thinking, Claude 3.7 etc.)
          if (!raw || chunkObj.type === 'thought') return

          // Filter out <think>...</think> blocks that some models emit as plain text
          let filtered = ''
          let remaining = raw
          while (remaining.length > 0) {
            if (insideThinkBlock) {
              const closeIdx = remaining.indexOf('</think>')
              if (closeIdx === -1) {
                // Still inside think block, skip everything
                break
              }
              // Found closing tag, skip up to and including </think>
              remaining = remaining.slice(closeIdx + '</think>'.length)
              insideThinkBlock = false
            } else {
              const openIdx = remaining.indexOf('<think>')
              if (openIdx === -1) {
                filtered += remaining
                break
              }
              // Found opening tag, take content before it, then enter think mode
              filtered += remaining.slice(0, openIdx)
              remaining = remaining.slice(openIdx + '<think>'.length)
              insideThinkBlock = true
            }
          }

          if (filtered) {
            finalSummary += filtered
            setStreamedSummary(prev => prev + filtered)
          }
        },
        onFinish: async () => {
          setIsGenerating(false)
          // Use the locally accumulated finalSummary (most reliable)
          console.log('[Scrapbook] Generation finished, summary length:', finalSummary.length)
          if (!finalSummary) {
            console.warn('[Scrapbook] finalSummary is empty - skipping persist')
            return
          }
          try {
            const resp = await fetch(`${getBackendUrl()}/api/scrapbook/${entry.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                summary: finalSummary,
              }),
            })
            console.log('[Scrapbook] PATCH status:', resp.status)
            // Update local state so re-entry check sees the summary
            const nextEntry = { ...entry, summary: finalSummary }
            setEntry(prev => ({ ...prev, summary: finalSummary }))
            setStreamedSummary('')
            notifyScrapbookChanged({ type: 'updated', entry: nextEntry })
          } catch (patchErr) {
            console.error('[Scrapbook] Failed to persist summary:', patchErr)
          }
        },
        onError: err => {
          setIsGenerating(false)
          setGenerationError(err.message || 'Generation failed')
        },
      })
    } catch (err) {
      setIsGenerating(false)
      setGenerationError(err.message)
    }
  }

  if (loading) {
    return (
      <div
        className={clsx(
          'relative flex h-full flex-1 items-center justify-center bg-[var(--color-bg-primary)] transition-all duration-300',
          isSidebarPinned ? 'md:ml-[328px]' : 'md:ml-[72px]',
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
          <ColorBendsBackground />
        </div>
        <Loader2 size={32} className="relative z-10 animate-spin text-[var(--color-accent)]" />
      </div>
    )
  }

  if (error || !entry) {
    return (
      <div
        className={clsx(
          'relative flex h-full flex-1 flex-col items-center justify-center gap-4 bg-[var(--color-bg-primary)] transition-all duration-300',
          isSidebarPinned ? 'md:ml-[328px]' : 'md:ml-[72px]',
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
          <ColorBendsBackground />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4 rounded-3xl border border-white/40 bg-white/40 p-8 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
          <p className="text-[var(--color-text-secondary)]">
            {error || t('scrapbook.list.notFound')}
          </p>
          <button
            onClick={() => navigate({ to: '/scrapbook' })}
            className="rounded-xl border border-[var(--color-border)] bg-white/50 px-4 py-2 transition-all hover:bg-white/80 dark:bg-black/40 dark:hover:bg-black/60"
          >
            {t('scrapbook.list.backToList')}
          </button>
        </div>
      </div>
    )
  }

  const tags = Array.isArray(entry.tags) ? entry.tags : []
  const displayTitle = stripGeneratedTitlePrefix(entry.title) || t('scrapbook.detail.untitled')
  const platformColor = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.unknown
  const dateStr = entry.created_at
    ? new Date(entry.created_at).toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <div
      className={clsx(
        'relative isolate flex h-full flex-1 flex-col overflow-hidden bg-[var(--color-bg-primary)] transition-all duration-300',
        isSidebarPinned ? 'md:ml-[328px]' : 'md:ml-[72px]',
      )}
    >
      {/* Left Column: Content */}
      <div className="relative flex h-full flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
          <ColorBendsBackground />
        </div>

      {/* Chat-like Header */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-40 flex w-full shrink-0 items-center justify-between gap-4 p-4">
        {/* Transparent header with glassy fade */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-21 bg-gradient-to-b from-white/68 via-white/28 to-transparent [mask-image:linear-gradient(to_bottom,black_58%,transparent)] opacity-100 backdrop-blur-xl md:hidden dark:from-zinc-950/68 dark:via-zinc-950/28"
        />
        <div className="pointer-events-auto flex w-full items-center justify-between gap-2">
          {/* Left Side: Back & Title Pill */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => navigate({ to: '/scrapbook' })}
              className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200/50 bg-white/90 px-4 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white hover:shadow-md active:scale-95 dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-200 dark:hover:bg-zinc-900"
              title={t('scrapbook.list.backToList')}
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">{t('scrapbook.list.backToList')}</span>
            </button>

            {/* Title Pill */}
            <div className="group relative z-10 flex h-12 min-w-0 items-center gap-1 rounded-full border border-gray-200/50 bg-white/90 py-1.5 pr-2 pl-4 shadow-sm backdrop-blur-xl transition-[background-color,box-shadow,border-color] hover:bg-white hover:shadow-md md:max-w-[500px] dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:hover:bg-zinc-900">
              <div className="flex min-w-0 items-center gap-2 truncate font-medium text-gray-800 dark:text-gray-100">
                {entry?.emoji && (
                  <span className="mb-0.5 shrink-0 text-[1.2rem] leading-none">{entry.emoji}</span>
                )}
                <span className="truncate text-base sm:text-lg">{displayTitle}</span>
              </div>
              <button
                onClick={handleRegenerateTitle}
                disabled={isRegeneratingTitle || !entry}
                className="relative z-20 ml-1 shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                title={t('scrapbook.detail.regenerateTitle')}
              >
                {isRegeneratingTitle ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
              </button>
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="pointer-events-auto relative flex items-center gap-2">
            {/* Ask Question Button */}
            <button
              onClick={handleAskQuestion}
              disabled={!entry}
              className="relative z-10 inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200/50 bg-white/90 px-4 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white hover:shadow-md active:scale-95 disabled:opacity-40 dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-200 dark:hover:bg-zinc-900"
              title={t('scrapbook.detail.askQuestion')}
            >
              <MessageCircle size={17} />
              <span className="hidden sm:inline">{t('scrapbook.detail.askQuestion')}</span>
            </button>

            <button
              onClick={handleDelete}
              className="relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-red-500 shadow-sm backdrop-blur-xl transition-all hover:scale-110 hover:bg-red-50 hover:text-red-600 hover:shadow-md active:scale-95 dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:hover:bg-red-900/30 dark:hover:text-red-400"
              title={t('scrapbook.detail.delete')}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex h-full flex-col overflow-y-auto bg-white/40 pt-20 pb-20 backdrop-blur-3xl sm:px-2 sm:pt-24 sm:pb-8 dark:bg-black/40">
        <div className="mx-auto w-full max-w-[44rem] px-2 pt-8 sm:px-5 sm:pt-12">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-bold tracking-wide shadow-sm',
                  platformColor,
                )}
              >
                {getPlatformLabel(entry.platform, entry.source_url)}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-tertiary)]">
                <Calendar size={14} />
                {dateStr}
              </span>
            </div>
            {entry.source_url && (
              <a
                href={entry.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-lg dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Globe size={15} />
                {t('scrapbook.detail.visitOriginal')}
                <ExternalLink size={13} className="opacity-70" />
              </a>
            )}
          </div>

          {entry.thumbnail && (
            <img
              src={entry.thumbnail}
              alt="缩略图"
              className="mb-10 max-h-[450px] w-full rounded-3xl object-cover shadow-md ring-1 ring-black/5 dark:ring-white/10"
            />
          )}

          {/* Dynamic Summary Section */}
          <div className="mb-10 rounded-3xl border border-white/40 bg-white/50 p-6 shadow-sm backdrop-blur-md sm:p-8 dark:border-white/10 dark:bg-black/40">
            <h3 className="mb-4 flex items-center justify-between text-base font-bold text-[var(--color-text-primary)]">
              <span className="flex items-center gap-2">
                ✨ {t('scrapbook.detail.summaryTitle')}
              </span>
              {!entry.summary && !isGenerating && !streamedSummary && (
                <button
                  onClick={handleGenerateDeepSummary}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {t('scrapbook.detail.regenerateSummary')}
                </button>
              )}
            </h3>

            {generationError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                {t('scrapbook.generate.failed')}: {generationError}
              </div>
            )}

            <div>
              {entry.summary ? (
                <ConversationMarkdown content={entry.summary} />
              ) : streamedSummary ? (
                <ConversationMarkdown content={streamedSummary} />
              ) : isGenerating ? (
                <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] italic">
                  <span className="animate-pulse">{t('messageBubble.statusThinking')}</span>
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-tertiary)] italic">
                  {t('scrapbook.detail.noSummary')}
                </div>
              )}
            </div>
          </div>

          {/* Regenerate button - always visible at bottom of summary section */}
          {!isGenerating && entry?.content && (
            <div className="mb-8 flex justify-center">
              <button
                onClick={() => {
                  // Clear existing summary state and regenerate
                  setStreamedSummary('')
                  setGenerationError(null)
                  setEntry(prev => ({ ...prev, summary: null }))
                  handleGenerateDeepSummary()
                }}
                className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white/60 px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] shadow-sm backdrop-blur-sm transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] dark:bg-black/30"
              >
                <RotateCcw size={14} />
                {t('scrapbook.detail.regenerateSummary')}
              </button>
            </div>
          )}
          {tags.length > 0 && (
            <div className="mt-12 mb-12 border-t border-black/5 pt-8 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-sm font-medium text-[var(--color-text-secondary)] shadow-sm ring-1 ring-black/5 ring-inset dark:bg-black/40 dark:ring-white/10"
                  >
                    <Tag size={12} />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {isChatOpen && chatConversation && (
        <div
          className={clsx(
            'fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none',
            'flex items-end justify-center lg:items-stretch lg:justify-end lg:p-6',
          )}
          onClick={() => {
            if (window.innerWidth < 1024) setIsChatOpen(false)
          }}
        >
          <div
            className={clsx(
              'relative flex h-[85vh] w-full flex-col overflow-hidden bg-white/80 shadow-2xl transition-all duration-500 ease-out sm:rounded-t-[2.5rem] lg:h-full lg:w-[420px] lg:rounded-[2rem] lg:border lg:border-white/20 lg:backdrop-blur-3xl xl:w-[480px] dark:bg-zinc-950/80',
              isChatOpen
                ? 'translate-y-0 opacity-100 scale-100'
                : 'translate-y-full opacity-0 scale-95',
            )}
            onClick={e => e.stopPropagation()}
          >
            {/* Overlay Header/Close */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/50 p-4 leading-none dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary-500 shadow-[0_0_8px_rgba(var(--color-primary-500),0.8)]" />
                <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
                  Intelligence
                </span>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <X size={16} className="text-zinc-500" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
            {entry && (
              <ChatInterface
                isEmbedded={true}
                activeConversation={chatConversation}
                systemContextPrefix={scrapbookContext}
                isSidebarPinned={false}
                isSpaceSelectionLocked={true}
                initialSpaceSelection={{ mode: 'manual', space: null }}
                initialAgentSelection={scrapbookAgent}
                initialIsAgentAutoMode={false}
                scrapbookEntry={{
                  id: entry.id,
                  title: entry.title,
                  source_url: entry.source_url || null,
                  summary: entry.summary || null,
                }}
                onTitleAndSpaceGenerated={conv => {
                  setChatConversation(conv)
                  notifyConversationsChanged({ scopes: ['library'] })
                }}
              />
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
