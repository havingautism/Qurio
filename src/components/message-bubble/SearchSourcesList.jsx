import React, { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'

const SearchSourcesList = memo(({ sources }) => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)

  if (!sources || sources.length === 0) return null

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
        } catch {}
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

SearchSourcesList.displayName = 'SearchSourcesList'

export default SearchSourcesList
