const DOCUMENT_CONTEXT_MAX_TOTAL = 12000

export const formatDocumentAppendText = sources => {
  const filtered = (sources || []).filter(source => source?.snippet)
  if (!filtered.length) return ''
  const lines = filtered.map(source => {
    const label = source.fileType ? `${source.title} (${source.fileType})` : source.title
    const similarity = typeof source.similarity === 'number' ? source.similarity.toFixed(2) : 'n/a'
    const path =
      Array.isArray(source.titlePath) && source.titlePath.length > 0
        ? `: ${source.titlePath.join(' > ')}`
        : ''
    return `- [score=${similarity} | ${label}]${path}\n  ${source.snippet}`
  })
  return [
    '# The following document excerpts may help answer this question (may be incomplete):',
    ...lines,
  ].join('\n')
}

export const truncateDocumentContext = text => {
  if (!text || text.length <= DOCUMENT_CONTEXT_MAX_TOTAL) return text || ''
  return `${text.slice(0, DOCUMENT_CONTEXT_MAX_TOTAL)}\n\n[Truncated]`
}
