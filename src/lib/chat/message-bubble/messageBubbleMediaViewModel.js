const IMAGE_SEARCH_TOOLS = new Set([
  'duckduckgo_image_search',
  'google_image_search',
  'bing_image_search',
  'serpapi_image_search',
])

const VIDEO_SEARCH_TOOLS = new Set(['duckduckgo_video_search', 'search_youtube'])

const parseToolOutput = output => {
  if (!output) return null
  if (typeof output === 'object') return output
  if (typeof output !== 'string') return null

  try {
    return JSON.parse(output)
  } catch {
    return null
  }
}

export function extractMessageImageResults({ toolCallHistory, getHostname }) {
  const results = []

  ;(toolCallHistory || []).forEach(toolCall => {
    if (!IMAGE_SEARCH_TOOLS.has(toolCall?.name)) return
    const output = parseToolOutput(toolCall.output)
    if (!Array.isArray(output)) return

    output.forEach(item => {
      const imgUrl = item.image || item.url || item.thumbnailUrl || item.thumbnail
      const sourceUrl = item.url || item.parentPage || ''
      const hostname = sourceUrl ? getHostname(sourceUrl) : ''

      if (!imgUrl) return
      results.push({
        src: imgUrl,
        title: item.title || '',
        source: hostname || item.source || '',
        sourceUrl,
      })
    })
  })

  return results
}

export function extractMessageVideoResults({ toolCallHistory }) {
  const results = []

  ;(toolCallHistory || []).forEach(toolCall => {
    if (!VIDEO_SEARCH_TOOLS.has(toolCall?.name)) return
    const output = parseToolOutput(toolCall.output)

    let videoList = []
    if (Array.isArray(output)) {
      videoList = output
    } else if (output && typeof output === 'object') {
      videoList = output.video_results || output.videos || []
    }

    videoList.forEach(item => {
      const videoUrl = item.link || item.url || item.content || ''
      if (!videoUrl) return
      results.push({
        url: videoUrl,
        title: item.title || '',
      })
    })
  })

  return results
}

export function extractMessageImageEntries({ mainContent, allImageResults }) {
  if (!mainContent) return []

  const regex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
  const found = []
  let match

  while ((match = regex.exec(mainContent)) !== null) {
    const alt = match[1]
    const src = match[2]
    const metadata = (allImageResults || []).find(result => result.src === src)
    found.push({
      src,
      alt: alt || metadata?.title || '',
      title: metadata?.title || alt || '',
      source: metadata?.source || '',
      sourceUrl: metadata?.sourceUrl || '',
    })
  }

  return found
}

export function getVideoEmbedUrl(url) {
  if (!url) return null

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

    if (hostname.includes('player.bilibili.com') && parsed.pathname.includes('/player.html')) {
      const bvid = parsed.searchParams.get('bvid')
      const aid = parsed.searchParams.get('aid')
      const cid = parsed.searchParams.get('cid')
      const page = parsed.searchParams.get('p') || parsed.searchParams.get('page')
      if (bvid || aid || cid) {
        return buildBilibiliEmbedUrl({ bvid, aid, cid, page })
      }
    }

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
    return null
  }

  return null
}

export function getVideoPlatform(url) {
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
    return null
  }

  return null
}
