import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import {
  canExpandDocumentCitation,
  buildDocumentCitationPath,
  prepareDocumentCitationSources,
} from '../lib/documentCitationViewModel'

const ITEMS_PER_PAGE = 9

const resolveUrl = source => source?.url || source?.uri || source?.link || source?.href || ''

const getSourceKind = source => {
  if (source?.sourceKind === 'web' || source?.sourceKind === 'document') return source.sourceKind
  return resolveUrl(source) ? 'web' : 'document'
}

const getSourceKey = source =>
  source?.id ||
  source?.nodeId ||
  source?.url ||
  source?.uri ||
  source?.link ||
  source?.href ||
  `${source?.citationIndex ?? source?.originalIndex ?? 'source'}:${source?.title || ''}:${buildDocumentCitationPath(source)}`

const DesktopSourcesSection = ({ sources = [], isOpen }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('document')
  const [pageByTab, setPageByTab] = useState({ web: 1, document: 1 })
  const [expandedSourceKeys, setExpandedSourceKeys] = useState(new Set())

  const groupedSources = useMemo(() => {
    const webSources = sources.filter(source => getSourceKind(source) === 'web')
    const rawDocumentSources = sources.filter(source => getSourceKind(source) === 'document')
    return {
      web: webSources,
      document: prepareDocumentCitationSources(rawDocumentSources),
    }
  }, [sources])

  useEffect(() => {
    if (isOpen) return
    setExpandedSourceKeys(new Set())
  }, [isOpen])

  const visibleTabs = useMemo(() => {
    const tabs = []
    if (groupedSources.web.length > 0) tabs.push('web')
    if (groupedSources.document.length > 0) tabs.push('document')
    return tabs
  }, [groupedSources])

  useEffect(() => {
    if (visibleTabs.includes(activeTab)) return
    if (visibleTabs.includes('document')) {
      setActiveTab('document')
      return
    }
    if (visibleTabs.includes('web')) setActiveTab('web')
  }, [activeTab, visibleTabs])

  const activeSources = groupedSources[activeTab] || []
  const currentPage = pageByTab[activeTab] || 1
  const totalPages = Math.max(1, Math.ceil(activeSources.length / ITEMS_PER_PAGE))

  useEffect(() => {
    setPageByTab(prev => ({
      ...prev,
      [activeTab]: Math.min(prev[activeTab] || 1, totalPages),
    }))
  }, [activeTab, totalPages])

  const getHostname = url => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return t('sources.source')
    }
  }

  const pagedSources = activeSources.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  const updatePage = nextPage =>
    setPageByTab(prev => ({
      ...prev,
      [activeTab]: Math.max(1, Math.min(totalPages, nextPage)),
    }))

  const toggleExpandedSource = key =>
    setExpandedSourceKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div
      className={`ease-spring grid w-full overflow-hidden transition-all duration-300 ${
        isOpen ? 'mt-3 grid-rows-[1fr] pb-2 opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 w-full">
        {visibleTabs.length > 1 && (
          <div className="mb-3 flex items-center gap-2">
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab
              const count = groupedSources[tab].length
              const label =
                tab === 'web'
                  ? t('sources.searchSources', 'Search Sources')
                  : t('sources.documentSources')
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={
                    isActive
                      ? 'rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:hover:bg-zinc-700'
                  }
                >
                  {label} {count}
                </button>
              )
            })}
          </div>
        )}

        {activeSources.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-gray-400">
            {t('sources.noSources')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {pagedSources.map((source, idx) => {
              const url = resolveUrl(source)
              const absoluteIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx
              const isDocumentSource = getSourceKind(source) === 'document'
              const titlePath = buildDocumentCitationPath(source)
              const sourceKey = getSourceKey(source)
              const fullSnippet = source.fullSnippet || source.snippet || source.content || ''
              const previewSnippet = source.previewSnippet || fullSnippet
              const canExpand = isDocumentSource && canExpandDocumentCitation(source)
              const isExpanded = expandedSourceKeys.has(sourceKey)
              const body = (
                <div className="group/source flex min-h-[86px] flex-col gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-2.5 transition-colors hover:bg-gray-100 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:hover:bg-zinc-800">
                  <div className="flex items-stretch gap-2.5">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-[9px] font-medium text-gray-500 shadow-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-gray-400">
                      {source.originalIndex !== undefined
                        ? source.originalIndex + 1
                        : absoluteIndex + 1}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="group-hover/source:text-primary-600 dark:group-hover/source:text-primary-400 line-clamp-4 text-[12px] leading-tight font-semibold text-gray-800 transition-colors dark:text-gray-200">
                        {source.title || titlePath || url}
                      </div>
                      <div className="mt-auto flex items-center gap-1.5 pt-1.5">
                        {isDocumentSource ? (
                          <FileText
                            size={12}
                            className="shrink-0 text-gray-400 dark:text-gray-500"
                          />
                        ) : (
                          <>
                            <img
                              src={
                                source.icon ||
                                `https://www.google.com/s2/favicons?domain=${getHostname(url)}&sz=128`
                              }
                              alt=""
                              className="h-3 w-3 rounded-full border border-white/80 bg-white object-cover dark:border-zinc-800"
                            />
                            <ExternalLink
                              size={11}
                              className="shrink-0 text-gray-300 dark:text-zinc-600"
                            />
                          </>
                        )}
                        <div className="truncate text-[12px] text-gray-400 dark:text-gray-500">
                          {isDocumentSource
                            ? titlePath || source.fileType || t('sources.documentSources')
                            : source.media || getHostname(url)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {isDocumentSource && previewSnippet && (
                    <div
                      className={`pl-6 text-xs leading-relaxed text-gray-500 dark:text-gray-400 ${
                        isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-3'
                      }`}
                    >
                      {isExpanded ? fullSnippet : previewSnippet}
                    </div>
                  )}
                  {canExpand && (
                    <button
                      type="button"
                      onClick={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        toggleExpandedSource(sourceKey)
                      }}
                      className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 w-fit pl-6 text-[11px] font-medium transition-colors"
                    >
                      {isExpanded
                        ? t('sources.hideFullExcerpt', 'Hide full quote')
                        : t('sources.showFullExcerpt', 'Show full quote')}
                    </button>
                  )}
                </div>
              )
              return url && !isDocumentSource ? (
                <a key={sourceKey} href={url} target="_blank" rel="noopener noreferrer">
                  {body}
                </a>
              ) : (
                <div key={sourceKey}>{body}</div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-2 flex items-center justify-center gap-4 py-1">
            <button
              onClick={() => updatePage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-full p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-zinc-800"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => updatePage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-full p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-zinc-800"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default DesktopSourcesSection
