import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Video, Image as ImageIcon } from 'lucide-react'
import clsx from 'clsx'
import { getPlatformLabel } from '../lib/scrapbookService'

const PLATFORM_COLORS = {
  xhs: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  wechat: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  youtube: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  bilibili: 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',
  twitter: 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400',
  telegram: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  rss: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  manual: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  unknown: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
}

const stripGeneratedTitlePrefix = value => {
  if (!value) return ''
  const trimmed = String(value).trim()
  return trimmed.replace(/^(?:title|标题)\s*[:：-]\s*/i, '').trim() || trimmed
}

const getThumbnailUrl = entry => {
  if (entry.thumbnail) return entry.thumbnail

  if (entry.platform === 'youtube' && entry.source_url) {
    const ytMatch = entry.source_url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
    )
    if (ytMatch && ytMatch[1]) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`
    }
  }

  const imgRegex = /!\[.*?\]\((.*?)\)/
  if (entry.content) {
    const match = entry.content.match(imgRegex)
    if (match && match[1]) return match[1]
  }
  if (entry.summary) {
    const match = entry.summary.match(imgRegex)
    if (match && match[1]) return match[1]
  }

  return null
}

/**
 * ScrapbookContextBanner
 *
 * Displays a scrapbook entry card identical to ScrapbookView's EntryCard.
 * It appears:
 *   1. Above the input bar before the first message is sent  (variant="input")
 *   2. Pinned at the top of the conversation list after the first message (variant="top")
 *
 * @param {Object} props.scrapbookEntry - Must contain all properties used by EntryCard.
 * @param {string} props.variant - 'input' | 'top'
 */
const ScrapbookContextBanner = ({ scrapbookEntry, variant = 'input' }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (!scrapbookEntry) return null

  const displayTitle =
    stripGeneratedTitlePrefix(scrapbookEntry.title) || t('scrapbook.detail.untitled')
  const actualThumbnail = getThumbnailUrl(scrapbookEntry)

  const dateStr = scrapbookEntry.created_at
    ? new Date(scrapbookEntry.created_at).toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  const handleClick = () => {
    if (scrapbookEntry.id) {
      navigate({ to: '/scrapbook/$entryId', params: { entryId: scrapbookEntry.id } })
    } else if (scrapbookEntry.source_url) {
      window.open(scrapbookEntry.source_url, '_blank', 'noopener,noreferrer')
    }
  }

  // Common inner layout identical to EntryCard
  const renderCardContent = () => (
    <>
      {/* Left Content */}
      <div className="flex min-w-0 flex-1 flex-col py-1">
        {/* Helper badge indicating 'Ask' context */}
        <div className="mb-2 flex items-center gap-1.5 opacity-80">
          <span className="text-[10px] font-bold tracking-widest text-violet-500 uppercase dark:text-violet-400">
            {variant === 'input'
              ? t('scrapbook.detail.contextBannerLabel')
              : t('scrapbook.detail.contextBannerPinned')}
          </span>
        </div>

        <h3 className="mb-2 line-clamp-2 text-base leading-snug font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {displayTitle}
        </h3>

        {scrapbookEntry.summary && (
          <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
            {scrapbookEntry.summary.replace(/[#*`_]/g, '').slice(0, 100)}...
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 text-xs text-gray-400">
          <div
            className={clsx(
              'flex items-center gap-1 rounded-sm px-1 py-0.5 font-medium',
              PLATFORM_COLORS[scrapbookEntry.platform] || PLATFORM_COLORS.unknown,
            )}
          >
            {getPlatformLabel(scrapbookEntry.platform)}
          </div>
          {dateStr && <span>{dateStr}</span>}
        </div>
      </div>

      {/* Right Thumbnail */}
      {actualThumbnail && (
        <div className="relative shrink-0 overflow-hidden rounded-xl object-cover">
          <img
            src={actualThumbnail}
            alt=""
            className="h-28 w-[84px] object-cover"
            onError={e => {
              e.target.style.display = 'none'
            }}
          />
          <div className="absolute right-1.5 bottom-1.5 rounded-md bg-black/40 p-0.5 text-white backdrop-blur-md">
            {['youtube', 'bilibili'].includes(scrapbookEntry.platform) ? (
              <Video size={10} fill="currentColor" className="text-white/90" />
            ) : (
              <ImageIcon size={10} className="text-white/90" />
            )}
          </div>
        </div>
      )}
    </>
  )

  // Top variant: slightly less prominent, smaller margin, centered
  if (variant === 'top') {
    return (
      <div className="mx-auto my-4 w-full max-w-3xl px-3 sm:px-0">
        <div
          onClick={handleClick}
          className="group relative flex cursor-pointer gap-4 rounded-3xl border border-violet-100/50 bg-white/70 px-5 py-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all duration-300 hover:bg-violet-50/50 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] active:scale-[0.98] dark:border-violet-900/20 dark:bg-zinc-900/20 dark:hover:bg-zinc-900/40"
        >
          {renderCardContent()}
        </div>
      </div>
    )
  }

  // Input variant: animate in, vibrant border/bg
  return (
    <div className="animate-in slide-in-from-bottom-2 mb-3">
      <div
        onClick={handleClick}
        className="group relative flex cursor-pointer gap-4 rounded-3xl border border-violet-200 bg-white px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] active:scale-[0.98] dark:border-violet-800/40 dark:bg-zinc-900"
      >
        {renderCardContent()}
      </div>
    </div>
  )
}

export default ScrapbookContextBanner
