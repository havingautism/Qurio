import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { FileText, X, FileJson, FileSpreadsheet, FileCode, File } from 'lucide-react'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import useIsMobile from '../hooks/useIsMobile'

const FileIcon = ({ fileType, className }) => {
  const type = (fileType || '').toLowerCase()
  if (type.includes('pdf')) return <FileText className={clsx('text-red-500', className)} />
  if (type.includes('doc') || type.includes('word'))
    return <FileText className={clsx('text-blue-500', className)} />
  if (type.includes('json')) return <FileJson className={clsx('text-yellow-500', className)} />
  if (type.includes('csv') || type.includes('excel') || type.includes('sheet'))
    return <FileSpreadsheet className={clsx('text-emerald-500', className)} />
  if (
    type.includes('md') ||
    type.includes('start') ||
    type.includes('code') ||
    type === 'js' ||
    type === 'py'
  )
    return <FileCode className={clsx('text-purple-500', className)} />
  return <File className={clsx('text-gray-400', className)} />
}

const formatFileType = value => {
  const text = String(value || '')
    .trim()
    .toLowerCase()
  if (text === 'md') return 'MARKDOWN'
  return text ? text.toUpperCase() : 'FILE'
}

const cleanSnippet = value => {
  const raw = String(value || '')
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

const SourcesModal = ({ isOpen, onClose, sources }) => {
  const { t } = useTranslation()

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[85vh] sm:max-h-[80vh] sm:max-w-2xl">
        <div className="flex items-center justify-between border-b border-white/18 px-4 py-3 dark:border-white/8">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('sources.documentSources')} ({sources.length})
          </div>
          <button
            onClick={onClose}
            className="glass-elite-chip rounded-full p-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {sources.map((source, idx) => (
            <div
              key={idx}
              className="glass-elite-soft rounded-[24px] p-3"
            >
              <div className="mb-2 flex items-start gap-3">
                <div className="glass-elite-chip flex items-center justify-center rounded-xl p-2 leading-none">
                  <FileIcon fileType={source.fileType} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {source.title?.replace(/\.[^/.]+$/, '') || source.title}
                  </div>
                  {source.fileType && (
                    <div className="mt-0.5 text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      {formatFileType(source.fileType)}
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-1 pl-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                {cleanSnippet(source.snippet)}
              </div>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

const DocumentSourcesPanel = ({ sources = [], isOpen, onClose }) => {
  const isMobile = useIsMobile()
  if (!sources || sources.length === 0) return null

  // Mobile View: Directly open Modal when toggled
  if (isMobile) {
    return <SourcesModal isOpen={isOpen} onClose={onClose} sources={sources} />
  }

  // Desktop View: Grid (Existing logic but with deduplication)
  return (
    <div
      className={clsx(
        'ease-spring grid w-full overflow-hidden transition-all duration-300',
        isOpen ? 'mt-3 grid-rows-[1fr] pb-2 opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="min-h-0 w-full">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source, idx) => (
            <div
              key={source.id || idx}
              className="glass-elite-soft group cursor-default rounded-2xl p-3 transition-all hover:border-white/26 hover:bg-white/18 dark:hover:border-white/10 dark:hover:bg-white/[0.05]"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="glass-elite-chip flex items-center justify-center rounded-lg p-1 leading-none">
                    <FileIcon fileType={source.fileType} size={12} />
                  </div>
                  <div className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {source.title?.replace(/\.[^/.]+$/, '') || source.title}
                  </div>
                </div>
                {source.fileType && (
                  <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
                    {formatFileType(source.fileType)}
                  </span>
                )}
              </div>

              <div className="line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {cleanSnippet(source.snippet)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DocumentSourcesPanel
