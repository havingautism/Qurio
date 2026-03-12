export const getHostname = url => {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch (e) {
    return 'Source'
  }
}

const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```/g
const INLINE_CODE_SPAN_REGEX = /`[^`\n]+`/g

const collectProtectedMarkdownRanges = text => {
  const ranges = []

  for (const match of text.matchAll(FENCED_CODE_BLOCK_REGEX)) {
    const start = match.index ?? 0
    const value = match[0] || ''
    ranges.push({ start, end: start + value.length })
  }

  for (const match of text.matchAll(INLINE_CODE_SPAN_REGEX)) {
    const start = match.index ?? 0
    const value = match[0] || ''
    const end = start + value.length

    const isInsideExistingRange = ranges.some(range => start >= range.start && end <= range.end)
    if (!isInsideExistingRange) {
      ranges.push({ start, end })
    }
  }

  return ranges.sort((left, right) => left.start - right.start)
}

const mapMarkdownOutsideCitationProtectedZones = (content, transformer) => {
  const text = String(content || '')
  if (!text) return text

  const protectedRanges = collectProtectedMarkdownRanges(text)
  if (protectedRanges.length === 0) {
    return transformer(text)
  }

  let cursor = 0
  let output = ''

  for (const range of protectedRanges) {
    const before = text.slice(cursor, range.start)
    const protectedText = text.slice(range.start, range.end)
    output += transformer(before)
    output += protectedText
    cursor = range.end
  }

  output += transformer(text.slice(cursor))
  return output
}

const stripCitationProtectedMarkdownZones = content =>
  mapMarkdownOutsideCitationProtectedZones(content, segment => segment).replace(
    /```[\s\S]*?```|`[^`\n]+`/g,
    '',
  )

/**
 * Converts citations [1][2][3] to clickable number links.
 */
export const formatContentWithSources = (content, sources = []) => {
  if (typeof content !== 'string' || !Array.isArray(sources) || sources.length === 0) {
    return content
  }

  const citationRegex = /\[(\d+)\](?:\s*\[(\d+)\])*/g

  return mapMarkdownOutsideCitationProtectedZones(content, segment =>
    segment.replace(citationRegex, match => {
      const indices = match.match(/\d+/g).map(n => Number(n) - 1)

      if (indices.length === 0) return match

      const primaryIdx = indices[0]
      const primarySource = sources[primaryIdx]

      if (!primarySource) return match

      if (indices.length > 1) {
        return ` [+${indices.length}](https://citation.local/${indices.join(',')}) `
      }

      return ` [${primaryIdx + 1}](https://citation.local/${primaryIdx}) `
    }),
  )
}

export const extractCitationIndicesFromContent = content => {
  const text = String(content || '')
  if (!text) return []

  const indices = new Set()

  const citationLinkRegex = /\(https:\/\/citation\.local\/([^)]+)\)/g
  for (const match of text.matchAll(citationLinkRegex)) {
    const payload = String(match[1] || '')
    payload
      .split(',')
      .map(part => Number(part))
      .filter(index => Number.isInteger(index) && index >= 0)
      .forEach(index => indices.add(index))
  }

  if (indices.size === 0) {
    const rawCitationRegex = /\[(\d+)\]/g
    for (const match of text.matchAll(rawCitationRegex)) {
      const index = Number(match[1]) - 1
      if (Number.isInteger(index) && index >= 0) {
        indices.add(index)
      }
    }
  }

  return Array.from(indices).sort((left, right) => left - right)
}

export const applyGroundingSupports = (content, groundingSupports = [], sources = []) => {
  if (
    typeof content !== 'string' ||
    !Array.isArray(groundingSupports) ||
    groundingSupports.length === 0 ||
    !Array.isArray(sources) ||
    sources.length === 0
  ) {
    return content
  }

  const resolveCitationIndices = support => {
    const explicitCitations = Array.isArray(support?.citations)
      ? support.citations
          .map(citation => Number(citation?.index))
          .filter(index => Number.isInteger(index) && index >= 0 && index < sources.length)
      : []

    if (explicitCitations.length > 0) return explicitCitations

    return Array.isArray(support?.groundingChunkIndices)
      ? support.groundingChunkIndices
          .map(index => Number(index))
          .filter(index => Number.isInteger(index) && index >= 0 && index < sources.length)
      : []
  }

  const offsetBackedSupports = groundingSupports
    .map(support => {
      const start = Number(support?.segment?.startIndex)
      const end = Number(support?.segment?.endIndex)
      const segmentText = String(support?.segment?.text || '')
      const citationIndices = resolveCitationIndices(support)

      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null
      if (citationIndices.length === 0) return null

      const slice = content.slice(start, end)
      if (segmentText && slice && slice !== segmentText) return null

      return {
        start,
        end,
        citationIndices,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.end - left.end)

  if (offsetBackedSupports.length > 0) {
    let output = content
    for (const support of offsetBackedSupports) {
      const citationTokens = support.citationIndices.map(idx => `[${idx + 1}]`).join('')
      const normalizedEnd = Math.max(0, Math.min(support.end, output.length))
      output = output.slice(0, normalizedEnd) + ` ${citationTokens}` + output.slice(normalizedEnd)
    }
    return output
  }

  let output = content

  groundingSupports.forEach(support => {
    const segmentText = support?.segment?.text || ''
    const citationIndices = resolveCitationIndices(support)

    if (!segmentText || citationIndices.length === 0) return

    const citationTokens = citationIndices.map(idx => `[${idx + 1}]`).join('')
    output = mapMarkdownOutsideCitationProtectedZones(output, segment => {
      const firstIndex = segment.indexOf(segmentText)
      if (firstIndex === -1) return segment
      const secondIndex = segment.indexOf(segmentText, firstIndex + segmentText.length)
      if (secondIndex !== -1) return segment
      const insertAt = firstIndex + segmentText.length
      return segment.slice(0, insertAt) + ` ${citationTokens}` + segment.slice(insertAt)
    })
  })

  return output
}

const normalizeForOverlap = text =>
  String(text || '')
    .toLowerCase()
    .replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>{}\[\]\\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const extractOverlapTokens = text => {
  const normalized = normalizeForOverlap(text)
  if (!normalized) return []

  const tokens = new Set()

  const latinTokens = normalized.match(/[a-z0-9][a-z0-9._/-]{1,}/g) || []
  latinTokens.forEach(token => {
    if (token.length >= 2) tokens.add(token)
  })

  const hanGroups = normalized.match(/[\u4e00-\u9fff]{2,}/g) || []
  hanGroups.forEach(group => {
    tokens.add(group)
    if (group.length <= 2) return
    for (let index = 0; index < group.length - 1; index += 1) {
      tokens.add(group.slice(index, index + 2))
    }
  })

  return Array.from(tokens)
}

const splitIntoCitableSegments = content => {
  const text = stripCitationProtectedMarkdownZones(String(content || '')).trim()
  if (!text) return []

  const paragraphs = text
    .split(/\n{2,}/)
    .map(segment => segment.trim())
    .filter(segment => segment.length >= 18)

  if (paragraphs.length > 0) return paragraphs

  return text
    .split(/(?<=[。！？.!?])\s+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length >= 18)
}

export const buildDocumentGroundingSupports = (content, sources = []) => {
  if (typeof content !== 'string' || !content.trim() || !Array.isArray(sources) || sources.length === 0) {
    return []
  }

  const indexedSources = sources.map((source, index) => {
    const titlePath = Array.isArray(source?.titlePath) ? source.titlePath.join(' ') : ''
    const searchText = [source?.title, titlePath, source?.snippet].filter(Boolean).join(' ')
    const tokens = extractOverlapTokens(searchText)
    return {
      index,
      tokens,
      retrievalScore: Number.isFinite(source?.score) ? Number(source.score) : 0,
    }
  })

  const supports = splitIntoCitableSegments(content)
    .map(segmentText => {
      const segmentTokens = extractOverlapTokens(segmentText)
      if (segmentTokens.length === 0) return null

      const ranked = indexedSources
        .map(source => {
          const overlap = segmentTokens.filter(token => source.tokens.includes(token)).length
          const score = overlap + source.retrievalScore * 0.25
          return { index: source.index, score }
        })
        .filter(item => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 2)

      if (ranked.length === 0) return null

      return {
        segment: { text: segmentText },
        citations: ranked.map(item => ({ index: item.index })),
      }
    })
    .filter(Boolean)

  if (supports.length > 0) return supports

  return [
    {
      segment: { text: splitIntoCitableSegments(content)[0] || String(content || '').trim() },
      citations: [{ index: 0 }],
    },
  ].filter(item => item.segment.text)
}
