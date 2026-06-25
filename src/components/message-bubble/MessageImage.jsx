import React, { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Globe } from 'lucide-react'
import clsx from 'clsx'

import { getHostname } from '../message/messageUtils'

const MessageImage = memo(({ src, alt, openGallery, onImageError, isFailed, imageMetadataRef }) => {
  const { t } = useTranslation()
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const metadata = imageMetadataRef?.current?.find(r => r.src === src)
  const sourceUrl = metadata?.sourceUrl
  const sourceName = metadata?.source

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

export default MessageImage
