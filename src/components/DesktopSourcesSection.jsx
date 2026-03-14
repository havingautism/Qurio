import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import {
  canExpandDocumentCitation,
  buildDocumentCitationPath,
  prepareDocumentCitationSources,
} from '../lib/documentCitationViewModel'

const ITEMS_PER_PAGE = 6

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

const DesktopSourcesSection = ({ sources = [], isOpen, variant = 'default' }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('document')
  const [pageByTab, setPageByTab] = useState({ web: 1, document: 1 })
  const [expandedSourceKeys, setExpandedSourceKeys] = useState(new Set())
  const isCompactVariant = variant === 'compact'

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
        isOpen
          ? isCompactVariant
            ? 'mt-2 grid-rows-[1fr] pb-1 opacity-100'
            : 'mt-3 grid-rows-[1fr] pb-2 opacity-100'
          : 'mt-0 grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 w-full">
        {visibleTabs.length > 1 && (
          <div className={clsx('flex items-center gap-2', isCompactVariant ? 'mb-2' : 'mb-3')}>
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
                      ? isCompactVariant
                        ? 'bg-primary-500/14 text-primary-700 dark:text-primary-300 rounded-full border border-white/14 px-2.5 py-1 text-xs font-semibold'
                        : 'rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : isCompactVariant
                        ? 'rounded-full bg-white/6 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-white/10 dark:text-gray-400'
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
          <div
            className={clsx(
              'grid grid-cols-1',
              isCompactVariant
                ? 'gap-2 sm:grid-cols-2 lg:grid-cols-3'
                : 'gap-2.5 sm:grid-cols-2 lg:grid-cols-3',
            )}
          >
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
                <div
                  className={clsx(
                    'group/source flex flex-col transition-colors',
                    isCompactVariant
                      ? 'min-h-[74px] gap-2 rounded-[22px] border border-white/12 bg-white/[0.03] p-3 hover:bg-white/[0.05] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]'
                      : 'min-h-[86px] gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-2.5 hover:bg-gray-100 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:hover:bg-zinc-800',
                  )}
                >
                  <div
                    className={clsx('flex items-stretch', isCompactVariant ? 'gap-2' : 'gap-2.5')}
                  >
                    <div
                      className={clsx(
                        'mt-0.5 shrink-0 items-center justify-center font-medium shadow-sm',
                        isCompactVariant
                          ? 'flex h-7 min-w-[1.7rem] rounded-lg border border-white/10 bg-white/[0.04] px-1 text-[10px] text-gray-400 dark:bg-white/[0.03] dark:text-gray-500'
                          : 'flex h-4 w-4 rounded border border-gray-200 bg-white text-[9px] text-gray-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-gray-400',
                      )}
                    >
                      {source.originalIndex !== undefined
                        ? source.originalIndex + 1
                        : absoluteIndex + 1}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div
                        className={clsx(
                          'group-hover/source:text-primary-600 dark:group-hover/source:text-primary-400 leading-tight font-semibold transition-colors',
                          isCompactVariant
                            ? 'line-clamp-2 text-[14px] text-gray-900 dark:text-gray-100'
                            : 'line-clamp-4 text-[12px] text-gray-800 dark:text-gray-200',
                        )}
                      >
                        {source.title || titlePath || url}
                      </div>
                      <div
                        className={clsx(
                          'mt-auto flex items-center gap-1.5',
                          isCompactVariant ? 'pt-2' : 'pt-1.5',
                        )}
                      >
                        {isDocumentSource ? (
                          <FileText
                            size={isCompactVariant ? 11 : 12}
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
                              className={clsx(
                                'rounded-full object-cover',
                                isCompactVariant
                                  ? 'h-3.5 w-3.5 border border-white/10 bg-white/90 dark:border-white/8'
                                  : 'h-3 w-3 border border-white/80 bg-white dark:border-zinc-800',
                              )}
                            />
                            <ExternalLink
                              size={isCompactVariant ? 10 : 11}
                              className="shrink-0 text-gray-300 dark:text-zinc-600"
                            />
                          </>
                        )}
                        <div
                          className={clsx(
                            'truncate text-gray-400 dark:text-gray-500',
                            isCompactVariant ? 'text-[11px]' : 'text-[12px]',
                          )}
                        >
                          {isDocumentSource
                            ? titlePath || source.fileType || t('sources.documentSources')
                            : source.media || getHostname(url)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {isDocumentSource && previewSnippet && (
                    <div
                      className={`${isCompactVariant ? 'pl-9 text-[12px]' : 'pl-6 text-xs'} leading-relaxed text-gray-500 dark:text-gray-400 ${
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
                      className={clsx(
                        'text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 w-fit font-medium transition-colors',
                        isCompactVariant ? 'pl-9 text-[11px]' : 'pl-6 text-[11px]',
                      )}
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
          <div
            className={clsx(
              'flex items-center justify-center gap-4 py-1',
              isCompactVariant ? 'mt-1' : 'mt-2',
            )}
          >
            <button
              onClick={() => updatePage(currentPage - 1)}
              disabled={currentPage === 1}
              className={clsx(
                'rounded-full p-1 text-gray-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400',
                isCompactVariant
                  ? 'hover:bg-white/8 dark:hover:bg-white/6'
                  : 'hover:bg-gray-100 dark:hover:bg-zinc-800',
              )}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => updatePage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={clsx(
                'rounded-full p-1 text-gray-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400',
                isCompactVariant
                  ? 'hover:bg-white/8 dark:hover:bg-white/6'
                  : 'hover:bg-gray-100 dark:hover:bg-zinc-800',
              )}
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
