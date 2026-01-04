export const getHostname = url => {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch (e) {
    return 'Source'
  }
}

/**
 * Converts citations [1][2][3] to clickable number links.
 */
export const formatContentWithSources = (content, sources = []) => {
  if (typeof content !== 'string' || !Array.isArray(sources) || sources.length === 0) {
    return content
  }

  const citationRegex = /\[(\d+)\](?:\s*\[(\d+)\])*/g

  return content.replace(citationRegex, match => {
    const indices = match.match(/\d+/g).map(n => Number(n) - 1)

    if (indices.length === 0) return match

    const primaryIdx = indices[0]
    const primarySource = sources[primaryIdx]

    if (!primarySource) return match

    if (indices.length > 1) {
      return ` [+${indices.length}](citation:${indices.join(',')}) `
    }

    return ` [${primaryIdx + 1}](citation:${primaryIdx}) `
  })
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

  let output = content

  groundingSupports.forEach(support => {
    const segmentText = support?.segment?.text || ''
    const citationIndices = support?.citations?.map(c => c.index).filter(i => i != null) || []

    if (!segmentText || citationIndices.length === 0) return

    const citationTokens = citationIndices.map(idx => `[${idx + 1}]`).join('')
    output = output.replace(segmentText, `${segmentText} ${citationTokens}`)
  })

  return output
}
