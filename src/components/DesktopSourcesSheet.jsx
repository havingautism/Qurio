import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, ExternalLink, ChevronLeft, ChevronRight, X, FileText } from 'lucide-react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  canExpandDocumentCitation,
  buildDocumentCitationPath,
  prepareDocumentCitationSources,
} from '../lib/documentCitationViewModel'

const ITEMS_PER_PAGE = 10

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

const DesktopSourcesSheet = ({ isOpen, onClose, sources = [], title }) => {
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
    if (visibleTabs.includes('web')) {
      setActiveTab('web')
    }
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
    <Drawer open={isOpen} onOpenChange={onClose} direction="right">
      <DrawerContent className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
        <DrawerHeader className="shrink-0 border-b border-white/18 px-6 py-5 text-left dark:border-white/8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="glass-elite-chip text-primary-500 flex h-10 w-10 items-center justify-center rounded-full">
                <Globe size={20} />
              </div>
              <div className="flex flex-col">
                <DrawerTitle className="text-base leading-none font-bold text-gray-900 dark:text-gray-100">
                  {title || t('sources.title', '参考资料')}
                </DrawerTitle>
                <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('sources.resultsFound', { count: activeSources.length })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="glass-elite-chip -mr-2 rounded-full p-2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>
          </div>
          {visibleTabs.length > 1 && (
            <div className="mt-4 flex items-center gap-2">
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
                        ? 'glass-elite-chip text-primary-700 dark:text-primary-300 rounded-full px-3 py-1.5 text-xs font-semibold'
                        : 'rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800'
                    }
                  >
                    {label} {count}
                  </button>
                )
              })}
            </div>
          )}
        </DrawerHeader>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {activeSources.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {t('sources.noSources', 'No Sources')}
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2 pb-4">
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
                  <div className="glass-elite-soft group flex flex-col gap-2 rounded-[28px] p-4 transition-all hover:border-white/28 hover:bg-white/18 active:scale-[0.98] dark:hover:border-white/12 dark:hover:bg-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className="glass-elite-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        {source.originalIndex !== undefined
                          ? source.originalIndex + 1
                          : absoluteIndex + 1}
                      </div>
                      {isDocumentSource ? (
                        <div className="glass-elite-chip flex h-5 w-5 items-center justify-center rounded-full">
                          <FileText size={12} className="text-gray-500 dark:text-gray-400" />
                        </div>
                      ) : (
                        <img
                          src={
                            source.icon ||
                            `https://www.google.com/s2/favicons?domain=${getHostname(url)}&sz=128`
                          }
                          alt=""
                          className="h-5 w-5 rounded-full border border-white/70 bg-white/90 object-cover shadow-sm transition-opacity group-hover:opacity-100 dark:border-white/10 dark:bg-white/10"
                        />
                      )}
                      <h4 className="mb-0 line-clamp-1 flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {source.title || titlePath || getHostname(url)}
                      </h4>
                      {!isDocumentSource && (
                        <ExternalLink
                          size={16}
                          className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500 dark:text-zinc-600 dark:group-hover:text-gray-400"
                        />
                      )}
                    </div>
                    <div className="pl-[2.25rem] text-xs text-gray-500 dark:text-gray-400">
                      {isDocumentSource
                        ? titlePath || source.fileType || t('sources.documentSources')
                        : source.media || url}
                    </div>
                    {isDocumentSource && previewSnippet && (
                      <div
                        className={`pl-[2.25rem] text-sm leading-relaxed text-gray-600 dark:text-gray-300 ${
                          isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-3'
                        }`}
                      >
                        {isExpanded ? fullSnippet : previewSnippet}
                      </div>
                    )}
                    {canExpand && (
                      <div className="pl-[2.25rem]">
                        <button
                          type="button"
                          onClick={event => {
                            event.preventDefault()
                            event.stopPropagation()
                            toggleExpandedSource(sourceKey)
                          }}
                          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-xs font-medium transition-colors"
                        >
                          {isExpanded
                            ? t('sources.hideFullExcerpt', 'Hide full quote')
                            : t('sources.showFullExcerpt', 'Show full quote')}
                        </button>
                      </div>
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
        </div>

        {totalPages > 1 && (
          <div className="shrink-0 border-t border-white/18 p-4 dark:border-white/8">
            <div className="glass-elite-soft mx-auto flex w-fit items-center justify-center gap-6 rounded-full px-4 py-2">
              <button
                onClick={() => updatePage(currentPage - 1)}
                disabled={currentPage === 1}
                className="glass-elite-chip rounded-full p-2 text-gray-600 transition-colors disabled:opacity-30 dark:text-gray-400"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => updatePage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="glass-elite-chip rounded-full p-2 text-gray-600 transition-colors disabled:opacity-30 dark:text-gray-400"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

export default DesktopSourcesSheet
