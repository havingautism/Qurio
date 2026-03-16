const normalizeWhitespace = text =>
  String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

export const buildDocumentCitationPath = source =>
  Array.isArray(source?.titlePath)
    ? source.titlePath
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .join(' > ')
    : ''

export const cleanDocumentCitationText = value => {
  const raw = normalizeWhitespace(value)
  if (!raw) return ''

  const withoutHtml = raw
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')

  const lines = withoutHtml
    .replace(/^\s*\[[^\]]+\]\s*/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false
      if (/^[_=-]{3,}$/.test(line)) return false
      if (/_Toc\d+/i.test(line)) return false
      if (line.includes(' > ') && line.length <= 120 && !/[。！？.!?]/.test(line)) return false
      return true
    })

  return lines
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export const truncateDocumentCitationPreview = (value, maxLength = 180) => {
  const text = cleanDocumentCitationText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}...`
}

export const canExpandDocumentCitation = source =>
  Boolean(
    cleanDocumentCitationText(source?.fullSnippet || source?.snippet || source?.content || ''),
  )

export const prepareDocumentCitationSources = sources =>
  (Array.isArray(sources) ? sources : []).map((rawSource, index) => {
    const fullSnippet = cleanDocumentCitationText(rawSource?.snippet || rawSource?.content || '')
    return {
      ...rawSource,
      title: rawSource?.title || 'Document',
      sourceKind: 'document',
      originalIndex:
        rawSource?.originalIndex !== undefined ? Number(rawSource.originalIndex) : index,
      fullSnippet,
      previewSnippet: truncateDocumentCitationPreview(fullSnippet),
    }
  })

const buildDocumentGroupKey = source => {
  const explicitDocumentId =
    source?.documentId ||
    source?.fileId ||
    source?.attachmentId ||
    source?.metadata?.documentId ||
    source?.metadata?.fileId

  if (explicitDocumentId) return `document:${explicitDocumentId}`

  const title = String(source?.title || '').trim()
  const path = buildDocumentCitationPath(source)
  const fileType = String(source?.fileType || '').trim()
  return `document:${title}::${path}::${fileType}`
}

export const groupPreparedDocumentCitationSources = sources => {
  const grouped = new Map()

  ;(Array.isArray(sources) ? sources : []).forEach((source, index) => {
    const groupKey = buildDocumentGroupKey(source)
    const fragment = {
      ...source,
      fragmentKey: `${groupKey}:fragment:${source?.originalIndex ?? index}`,
    }

    const existing = grouped.get(groupKey)
    if (!existing) {
      grouped.set(groupKey, {
        ...source,
        groupKey,
        sourceKind: 'document',
        originalIndex: source?.originalIndex ?? index,
        fragments: [fragment],
      })
      return
    }

    existing.fragments.push(fragment)
    existing.originalIndex = Math.min(
      Number.isInteger(existing.originalIndex) ? existing.originalIndex : index,
      Number.isInteger(source?.originalIndex) ? source.originalIndex : index,
    )
  })

  return Array.from(grouped.values())
    .map(group => ({
      ...group,
      fragments: group.fragments.sort((a, b) => {
        const aIndex = Number.isInteger(a?.originalIndex)
          ? a.originalIndex
          : Number.MAX_SAFE_INTEGER
        const bIndex = Number.isInteger(b?.originalIndex)
          ? b.originalIndex
          : Number.MAX_SAFE_INTEGER
        return aIndex - bIndex
      }),
      fragmentCount: group.fragments.length,
      previewSnippet: group.fragments[0]?.previewSnippet || '',
      fullSnippet: group.fragments[0]?.fullSnippet || '',
    }))
    .sort((a, b) => {
      const aIndex = Number.isInteger(a?.originalIndex) ? a.originalIndex : Number.MAX_SAFE_INTEGER
      const bIndex = Number.isInteger(b?.originalIndex) ? b.originalIndex : Number.MAX_SAFE_INTEGER
      return aIndex - bIndex
    })
}
