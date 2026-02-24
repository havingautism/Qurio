import { useLoaderData, useParams, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState, useRef } from 'react'
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Globe,
  Loader2,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { useAppContext } from '../App'
import {
  getScrapbookEntryById,
  deleteScrapbookEntry,
  getPlatformLabel,
  resolveScrapbookModelConfig,
} from '../lib/scrapbookService'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import { Streamdown } from 'streamdown'
import { generateEmojiViaBackend, generateTitleViaBackend, streamChatViaBackend } from '../lib/backendClient'
import { loadSettings } from '../lib/settings'

const getBackendUrl = () => {
  const settings = loadSettings()
  return settings.backendUrl || 'http://127.0.0.1:3002'
}

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
  const { isSidebarPinned, showConfirmation } = useAppContext()
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

  useEffect(() => {
    async function load() {
      if (!entryId) return
      setLoading(true)
      const { data, error } = await getScrapbookEntryById(entryId)
      if (error) {
        setError(error)
      } else {
        setEntry(data)
      }
      setLoading(false)
    }
    load()
  }, [entryId])

  const handleRegenerateTitle = async () => {
    if (!entry || isRegeneratingTitle) return

    const modelConfig = resolveScrapbookModelConfig()
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
          body: JSON.stringify({ title: nextTitle, emoji: nextEmoji || null }),
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
      title: '删除随手记',
      message: '确定要删除这条随手记吗？删除后无法恢复。',
      confirmText: '删除',
      isDangerous: true,
      onConfirm: async () => {
        const { error } = await deleteScrapbookEntry(entryId)
        if (!error) {
          navigate({ to: '/scrapbook' })
        }
      },
    })
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
      const modelConfig = resolveScrapbookModelConfig()
      if (!modelConfig.apiKey) {
        setGenerationError('未配置 API Key，请先在 Scrapbook 设置中配置模型。')
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

## Response Style
- Use a professional, business-appropriate tone.
- Feel free to use emojis to add warmth and clarity.`

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
              body: JSON.stringify({ summary: finalSummary }),
            })
            console.log('[Scrapbook] PATCH status:', resp.status)
            // Update local state so re-entry check sees the summary
            setEntry(prev => ({ ...prev, summary: finalSummary }))
            setStreamedSummary('')
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
          'relative flex h-full w-full items-center justify-center bg-[var(--color-bg-primary)] transition-all duration-300',
          isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
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
          'relative flex h-full w-full flex-col items-center justify-center gap-4 bg-[var(--color-bg-primary)] transition-all duration-300',
          isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
          <ColorBendsBackground />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4 rounded-3xl border border-white/40 bg-white/40 p-8 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
          <p className="text-[var(--color-text-secondary)]">{error || '闅忔墜璁颁笉瀛樺湪'}</p>
          <button
            onClick={() => navigate({ to: '/scrapbook' })}
            className="rounded-xl border border-[var(--color-border)] bg-white/50 px-4 py-2 transition-all hover:bg-white/80 dark:bg-black/40 dark:hover:bg-black/60"
          >
            杩斿洖鍒楄〃
          </button>
        </div>
      </div>
    )
  }

  const tags = Array.isArray(entry.tags) ? entry.tags : []
  const displayTitle = stripGeneratedTitlePrefix(entry.title) || '无标题'
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
        'relative flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg-primary)] transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>

      <div className="relative z-10 flex h-full flex-col overflow-y-auto bg-white/40 pb-20 backdrop-blur-3xl sm:pb-8 dark:bg-black/40">
        {/* Header */}
        <div className="sticky top-0 z-20 flex flex-shrink-0 items-center justify-between border-b border-black/5 bg-white/40 px-6 py-4 backdrop-blur-md dark:border-white/10 dark:bg-black/40">
          <button
            onClick={() => navigate({ to: '/scrapbook' })}
            className="flex items-center gap-2 rounded-xl bg-white/50 px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition-all hover:bg-white/80 dark:bg-black/40 dark:hover:bg-black/60"
          >
            <ArrowLeft size={16} />
            <span>返回列表</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRegenerateTitle}
              disabled={isRegeneratingTitle || !entry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/50 px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition-all hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/40 dark:hover:bg-black/60"
              title="重新生成标题"
            >
              {isRegeneratingTitle ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              <span className="hidden sm:inline">重新生成标题</span>
            </button>
            <button
              onClick={handleDelete}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/50 text-red-500 shadow-sm transition-all hover:bg-red-50 hover:text-red-600 dark:bg-black/40 dark:hover:bg-red-900/30 dark:hover:text-red-400"
              title="删除"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl px-6 pt-8 sm:px-10 sm:pt-12">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-bold tracking-wide shadow-sm',
                  platformColor,
                )}
              >
                {getPlatformLabel(entry.platform)}
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
                访问原文
                <ExternalLink size={13} className="opacity-70" />
              </a>
            )}
          </div>

          <h1 className="mb-6 max-w-[100%] text-2xl leading-snug font-bold break-words text-[var(--color-text-primary)] sm:text-3xl">
            {entry.emoji ? `${entry.emoji} ` : ''}
            {displayTitle}
          </h1>

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
              <span className="flex items-center gap-2">✨ 智能深度总结</span>
              {!entry.summary && !isGenerating && !streamedSummary && (
                <button
                  onClick={handleGenerateDeepSummary}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  点击生成长文总结
                </button>
              )}
            </h3>

            {generationError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                生成失败: {generationError}
              </div>
            )}

            <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-[var(--color-text-secondary)]">
              {entry.summary ? (
                <Streamdown>{entry.summary}</Streamdown>
              ) : streamedSummary ? (
                <Streamdown>{streamedSummary}</Streamdown>
              ) : isGenerating ? (
                <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] italic">
                  <span className="animate-pulse">正在深度分析原文并组织结构...</span>
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-tertiary)] italic">
                  暂无智能总结，请点击上方按钮生成。
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
                重新生成总结
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
  )
}
