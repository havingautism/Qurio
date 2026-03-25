import React, { memo, useMemo } from 'react'

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

export default InlineVideoEmbed
