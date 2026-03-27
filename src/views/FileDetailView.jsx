import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ArrowLeft, Download, FileSpreadsheet, FileType2, FolderOpen, Menu } from 'lucide-react'
import { FolderOpen as FolderOpenIcon } from '@phosphor-icons/react'
import { useAppContext } from '../App'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import FancyLoader from '../components/FancyLoader'
import HtmlWidgetCard from '../components/message/HtmlWidgetCard'
import { useToast } from '../contexts/ToastContext'
import { getGeneratedFileDetail } from '../lib/generatedFilesService'
import { getBackendUrl } from '../lib/settings'

const KIND_META = {
  pptx: {
    labelKey: 'views.filesView.kindPptx',
    defaultLabel: 'PPT',
    icon: FileType2,
    badgeClass:
      'border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200',
  },
  excel: {
    labelKey: 'views.filesView.kindExcel',
    defaultLabel: 'Excel',
    icon: FileSpreadsheet,
    badgeClass:
      'border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200',
  },
}

const resolveBackendDownloadUrl = path => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${getBackendUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

const formatDateTime = (value, locale) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const FileDetailView = () => {
  const { kind, fileId } = useParams({ strict: false })
  const { t, i18n } = useTranslation()
  const { isSidebarPinned, toggleSidebar } = useAppContext()
  const toast = useToast()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMissing, setIsMissing] = useState(false)
  const [activeExcelSheetIndex, setActiveExcelSheetIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setIsMissing(false)
      try {
        const result = await getGeneratedFileDetail({ kind, fileId })
        if (!cancelled) {
          setItem(result)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load generated file detail:', error)
          if (error?.status === 404) {
            setItem(null)
            setIsMissing(true)
          } else {
            toast.error(t('views.fileDetailView.loadFailed', 'Failed to load file details'))
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [fileId, kind, t, toast])

  const meta = useMemo(() => KIND_META[item?.kind] || KIND_META.excel, [item?.kind])
  const KindIcon = meta.icon
  const excelSheets = Array.isArray(item?.preview?.sheets) ? item.preview.sheets : []
  const activeExcelSheet = excelSheets[activeExcelSheetIndex] || excelSheets[0] || null

  useEffect(() => {
    setActiveExcelSheetIndex(0)
  }, [item?.file_id])

  return (
    <div
      className={clsx(
        'relative flex h-full flex-1 flex-col overflow-hidden bg-[#f4f4f4] transition-all duration-300 dark:bg-black',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>
      <div className="relative z-10 flex h-full flex-col">
        <div className="mx-auto w-full max-w-[1400px] shrink-0 px-4 pt-4 pb-2 sm:px-8 sm:pt-8 sm:pb-4">
          <div className="mb-6 flex items-center justify-between sm:mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleSidebar()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white sm:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-3">
                <FolderOpenIcon size={32} weight="duotone" className="text-primary-500" />
                <div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {t('views.fileDetailView.title', 'File details')}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                    {t('views.fileDetailView.subtitle', 'Preview metadata and content for this generated file.')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/files"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                <ArrowLeft size={14} />
                {t('views.fileDetailView.back', 'Back to files')}
              </Link>
              {item?.download_url ? (
                <a
                  href={resolveBackendDownloadUrl(item.download_url)}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  <Download size={14} />
                  {t('views.filesView.download', 'Download')}
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-8">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <FancyLoader size="lg" />
            </div>
          ) : isMissing ? (
            <div className="mx-auto max-w-3xl">
              <div className="rounded-[2rem] border border-dashed border-gray-300/80 bg-white/60 px-8 py-16 text-center backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/30">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('views.fileDetailView.missingTitle', 'File not found')}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                  {t(
                    'views.fileDetailView.missingBody',
                    'This file was deleted or no longer exists in the generated files directory.',
                  )}
                </div>
                <div className="mt-6">
                  <Link
                    to="/files"
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
                  >
                    <ArrowLeft size={16} />
                    {t('views.fileDetailView.back', 'Back to files')}
                  </Link>
                </div>
              </div>
            </div>
          ) : item ? (
            <div className="mx-auto max-w-[1400px] space-y-4">
              <div className="rounded-[2rem] border border-white/60 bg-white/72 p-5 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/38">
                <div className="mb-4 flex items-center gap-2">
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold',
                      meta.badgeClass,
                    )}
                  >
                    <KindIcon size={12} />
                    {t(meta.labelKey, meta.defaultLabel)}
                  </span>
                </div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">
                  {item.title || item.filename}
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-zinc-400">{item.filename}</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-black/6 bg-black/3 px-4 py-3 dark:border-white/8 dark:bg-white/5">
                    <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.createdAt', 'Created at')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {formatDateTime(item.created_at, i18n.language)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-black/6 bg-black/3 px-4 py-3 dark:border-white/8 dark:bg-white/5">
                    <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.sourceTool', 'Source tool')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {item.source_tool || '-'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-black/6 bg-black/3 px-4 py-3 dark:border-white/8 dark:bg-white/5">
                    <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.fileId', 'File ID')}
                    </div>
                    <div className="mt-1 break-all text-sm font-medium text-gray-900 dark:text-white">
                      {item.file_id}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-black/6 bg-black/3 px-4 py-3 dark:border-white/8 dark:bg-white/5">
                    <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.mimeType', 'MIME type')}
                    </div>
                    <div className="mt-1 break-all text-sm font-medium text-gray-900 dark:text-white">
                      {item.mime_type || '-'}
                    </div>
                  </div>
                </div>
              </div>

              {item.kind === 'pptx' ? (
                item.preview_html ? (
                  <HtmlWidgetCard
                    widgetKey={`${item.file_id}-detail-preview`}
                    widget={{
                      title: item.title || item.filename,
                      html: item.preview_html,
                      height: Math.max(360, Math.min(Number(item.preview_height) || 560, 900)),
                    }}
                    displayTitle={t('views.fileDetailView.preview', 'Preview')}
                    t={t}
                  />
                ) : (
                  <div className="rounded-[2rem] border border-dashed border-gray-300/80 bg-white/60 px-8 py-16 text-center backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/30">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('views.fileDetailView.noPreviewTitle', 'No preview available')}
                    </div>
                    <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.noPreviewBody', 'This file was saved before preview metadata was persisted, or no preview was generated.')}
                    </div>
                  </div>
                )
              ) : excelSheets.length > 0 && activeExcelSheet ? (
                <div className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/72 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/38">
                  {excelSheets.length > 1 ? (
                    <div className="border-b border-black/6 bg-black/2 px-4 py-3 dark:border-white/8 dark:bg-white/4">
                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {excelSheets.map((sheet, index) => (
                          <button
                            key={`${sheet?.name || 'sheet'}-tab-${index}`}
                            type="button"
                            onClick={() => setActiveExcelSheetIndex(index)}
                            className={clsx(
                              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              index === activeExcelSheetIndex
                                ? 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100'
                                : 'border-black/8 bg-white/65 text-zinc-600 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-300 dark:hover:bg-white/10',
                            )}
                          >
                            {sheet?.name || `Sheet ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="border-b border-black/6 bg-black/3 px-4 py-3 text-sm font-semibold text-zinc-800 dark:border-white/8 dark:bg-white/5 dark:text-zinc-200">
                    {activeExcelSheet?.name || 'Sheet 1'}
                    {Number.isFinite(activeExcelSheet?.total_rows) && activeExcelSheet.total_rows > 0
                      ? ` · ${t('messageBubble.excel.previewRows', { count: activeExcelSheet.total_rows, defaultValue: '{{count}} rows' })}`
                      : ''}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-xs">
                      {Array.isArray(activeExcelSheet?.columns) && activeExcelSheet.columns.length > 0 ? (
                        <thead>
                          <tr className="border-b border-black/6 bg-black/2 dark:border-white/8 dark:bg-white/4">
                            {activeExcelSheet.columns.map((column, columnIndex) => (
                              <th
                                key={`${activeExcelSheet.name}-col-${columnIndex}`}
                                className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200"
                              >
                                {column || t('messageBubble.excel.unnamedColumn', 'Column')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      ) : null}
                      <tbody>
                        {(Array.isArray(activeExcelSheet?.rows) ? activeExcelSheet.rows : []).map(
                          (row, rowIndex) => (
                            <tr
                              key={`${activeExcelSheet.name}-row-${rowIndex}`}
                              className="border-b border-black/5 last:border-b-0 dark:border-white/6"
                            >
                              {(Array.isArray(row) ? row : []).map((cell, cellIndex) => (
                                <td
                                  key={`${activeExcelSheet.name}-cell-${rowIndex}-${cellIndex}`}
                                  className="max-w-[220px] truncate px-3 py-2 text-zinc-700 dark:text-zinc-300"
                                >
                                  {String(cell ?? '')}
                                </td>
                              ))}
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-[2rem] border border-dashed border-gray-300/80 bg-white/60 px-8 py-16 text-center backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/30">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('views.fileDetailView.noPreviewTitle', 'No preview available')}
                  </div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                    {t('views.fileDetailView.noPreviewBody', 'This file was saved before preview metadata was persisted, or no preview was generated.')}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default FileDetailView
