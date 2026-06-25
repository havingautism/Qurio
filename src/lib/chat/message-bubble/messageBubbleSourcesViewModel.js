import { prepareDocumentCitationSources } from '../../documentCitationViewModel'

export function buildDocumentCitationSources(documentSources = []) {
  const normalizedSources = Array.isArray(documentSources)
    ? documentSources.map(source => ({
        ...source,
        title: source?.title || 'Document',
        snippet: source?.snippet || source?.content || '',
      }))
    : []

  return prepareDocumentCitationSources(normalizedSources)
}

export function hasExplicitWebSources(sources) {
  return Array.isArray(sources) && sources.length > 0
}

export function hasNavigableSourceLink(source) {
  const candidate =
    source?.url || source?.uri || source?.link || source?.href || source?.sourceUrl || ''
  return typeof candidate === 'string' && candidate.trim().length > 0
}

export function buildAllSources({ webSources, documentCitationSources }) {
  return [
    ...(Array.isArray(webSources)
      ? webSources.map((source, index) => ({
          ...source,
          sourceKind: 'web',
          originalIndex: source?.originalIndex !== undefined ? source.originalIndex : index,
        }))
      : []),
    ...(Array.isArray(documentCitationSources)
      ? documentCitationSources.map((source, index) => ({
          ...source,
          sourceKind: 'document',
          originalIndex: source?.originalIndex !== undefined ? source.originalIndex : index,
        }))
      : []),
  ]
}

export function resolveDefaultMobileDrawerSources({ selectedSources, webSources, documentCitationSources }) {
  if (selectedSources) return selectedSources
  return [...(Array.isArray(webSources) ? webSources : []), ...(documentCitationSources || [])]
}

export function shouldShowWorkflowSourceSummary({ isStreamingMessage, webSources, documentCitationSources }) {
  const hasAny = hasExplicitWebSources(webSources) || (documentCitationSources?.length || 0) > 0
  return !isStreamingMessage && hasAny
}

export function buildHeaderSourceLogos({ allSources, getHostname }) {
  const logos = []
  for (const source of allSources || []) {
    const url = source?.url || source?.uri || source?.link || source?.href || ''
    const host = getHostname(url)
    const icon =
      source?.icon || (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : '')
    if (icon) logos.push(icon)
    if (logos.length >= 3) break
  }
  return logos
}
