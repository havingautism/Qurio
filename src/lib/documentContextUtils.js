const DOCUMENT_CONTEXT_MAX_TOTAL = 12000
const MAX_SNIPPET_LENGTH = 900

const normalizeWhitespace = text =>
  String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

const stripRedundantExcerptMarkers = text => {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return ''

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length >= 2) {
    const first = lines[0]
    const second = lines[1]
    if (first.startsWith('[') && first.endsWith(']')) {
      const bracketText = first.slice(1, -1).trim()
      if (bracketText && second.startsWith(bracketText)) {
        lines.shift()
      }
    }
  }

  return lines.join('\n')
}

const truncateSnippet = text => {
  const normalized = stripRedundantExcerptMarkers(text)
  if (normalized.length <= MAX_SNIPPET_LENGTH) return normalized
  return `${normalized.slice(0, MAX_SNIPPET_LENGTH).trim()}...`
}

const buildSourceLabel = source => {
  const title = String(source?.title || 'Document').trim()
  const fileType = String(source?.fileType || '').trim()
  return fileType ? `${title} (${fileType})` : title
}

const buildSourcePath = source => {
  if (!Array.isArray(source?.titlePath) || source.titlePath.length === 0) return ''
  const path = source.titlePath.map(item => String(item || '').trim()).filter(Boolean)
  return path.length ? path.join(' > ') : ''
}

export const formatDocumentAppendText = sources => {
  const deduped = []
  const seen = new Set()

  ;(sources || []).forEach(source => {
    const snippet = truncateSnippet(source?.snippet)
    if (!snippet) return
    const key = [
      String(source?.title || '').trim(),
      buildSourcePath(source),
      snippet.slice(0, 240),
    ].join('::')
    if (seen.has(key)) return
    seen.add(key)
    deduped.push({ ...source, snippet })
  })

  const filtered = deduped.filter(source => source?.snippet)
  if (!filtered.length) return ''

  const lines = filtered.map((source, index) => {
    const label = buildSourceLabel(source)
    const similarity = typeof source.similarity === 'number' ? source.similarity.toFixed(2) : null
    const path = buildSourcePath(source)
    const meta = [label, path ? `Section: ${path}` : '', similarity ? `score=${similarity}` : '']
      .filter(Boolean)
      .join(' | ')

    return `${index + 1}. ${meta}\n${source.snippet}`
  })

  return [
    '# Reference document excerpts',
    'Use the excerpts below only if they are relevant to the user question.',
    ...lines,
  ].join('\n')
}

export const truncateDocumentContext = text => {
  if (!text || text.length <= DOCUMENT_CONTEXT_MAX_TOTAL) return text || ''
  return `${text.slice(0, DOCUMENT_CONTEXT_MAX_TOTAL)}\n\n[Truncated]`
}
