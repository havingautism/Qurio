import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Download, FileSpreadsheet, FileType2, FolderOpen, Menu, Search, Trash2 } from 'lucide-react'
import { FolderOpen as FolderOpenIcon } from '@phosphor-icons/react'
import { useAppContext } from '../App'
import { deleteGeneratedFile, listGeneratedFiles } from '../lib/generatedFilesService'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import FancyLoader from '../components/FancyLoader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '../contexts/ToastContext'
import { getBackendUrl } from '../lib/settings'

const FILTER_OPTIONS = [
  { key: 'all', value: '' },
  { key: 'pptx', value: 'pptx' },
  { key: 'excel', value: 'excel' },
]

const SORT_OPTIONS = [
  { key: 'newest', value: 'desc' },
  { key: 'oldest', value: 'asc' },
]

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

const resolveBackendDownloadUrl = path => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${getBackendUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

const FilesView = () => {
  const { t, i18n } = useTranslation()
  const { isSidebarPinned, toggleSidebar, showConfirmation } = useAppContext()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const result = await listGeneratedFiles({
          kind: kindFilter,
          q: activeSearchQuery,
          sort: sortOrder,
        })
        if (!cancelled) {
          setItems(Array.isArray(result?.items) ? result.items : [])
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load generated files:', error)
          toast.error(t('views.filesView.loadFailed', 'Failed to load files'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [kindFilter, activeSearchQuery, sortOrder, t, toast])

  const stats = useMemo(() => {
    let pptxCount = 0
    let excelCount = 0
    for (const item of items) {
      if (item?.kind === 'pptx') pptxCount += 1
      if (item?.kind === 'excel') excelCount += 1
    }
    return { total: items.length, pptx: pptxCount, excel: excelCount }
  }, [items])

  const handleDelete = item => {
    if (!item?.file_id || !item?.kind) return

    showConfirmation({
      title: t('views.filesView.deleteTitle', 'Delete file'),
      message: t('views.filesView.deleteMessage', {
        name: item.title || item.filename || item.file_id,
        defaultValue: 'Are you sure you want to delete "{{name}}"? This cannot be undone.',
      }),
      confirmText: t('views.filesView.deleteConfirm', 'Delete'),
      cancelText: t('confirmation.cancel', 'Cancel'),
      isDangerous: true,
      onConfirm: async () => {
        setDeletingId(item.file_id)
        try {
          await deleteGeneratedFile({ kind: item.kind, fileId: item.file_id })
          setItems(current => current.filter(candidate => candidate.file_id !== item.file_id))
          toast.success(t('views.filesView.deleteSuccess', 'File deleted'))
        } catch (error) {
          console.error('Failed to delete generated file:', error)
          toast.error(t('views.filesView.deleteFailed', 'Failed to delete file'))
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

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
                    {t('views.filesView.title', 'Generated Files')}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                    {t(
                      'views.filesView.subtitle',
                      'Browse exported PPT and Excel files saved by your tools.',
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/40">
              <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                {t('views.filesView.totalFiles', 'Total files')}
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.total}
              </div>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/40">
              <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                {t('views.filesView.totalPptx', 'PPT files')}
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.pptx}
              </div>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/40">
              <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                {t('views.filesView.totalExcel', 'Excel files')}
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.excel}
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    setActiveSearchQuery(searchQuery.trim())
                  }
                }}
                placeholder={t('views.filesView.searchPlaceholder', 'Search filename or title')}
                className="w-full rounded-2xl border-none bg-white px-11 py-3 text-sm text-gray-900 outline-none ring-0 dark:bg-zinc-950/70 dark:text-white"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FILTER_OPTIONS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setKindFilter(option.value)}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    kindFilter === option.value
                      ? 'bg-primary-500 text-white'
                      : 'bg-white/80 text-gray-600 hover:bg-white dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:bg-zinc-900',
                  )}
                >
                  {t(`views.filesView.filter.${option.key}`, option.key)}
                </button>
              ))}
              <div className="min-w-[128px]">
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-9 rounded-full border border-black/8 bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {SORT_OPTIONS.map(option => (
                      <SelectItem key={option.key} value={option.value}>
                        {t(`views.filesView.sort.${option.key}`, option.key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => setActiveSearchQuery(searchQuery.trim())}
                className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {t('views.filesView.search', 'Search')}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-8">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <FancyLoader size="lg" />
            </div>
          ) : items.length === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-[2rem] border border-dashed border-gray-300/80 bg-white/60 px-8 py-16 text-center backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/30">
              <FolderOpen size={36} className="mb-4 text-gray-400 dark:text-zinc-500" />
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('views.filesView.emptyTitle', 'No generated files yet')}
              </div>
              <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                {t(
                  'views.filesView.emptyBody',
                  'Generated PPT and Excel files will appear here after your tools export them.',
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {items.map(item => {
                const meta = KIND_META[item.kind] || KIND_META.excel
                const KindIcon = meta.icon
                return (
                  <div
                    key={item.file_id}
                    className="rounded-[2rem] border border-white/60 bg-white/72 p-5 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/38"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2">
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
                        <Link
                          to="/files/$kind/$fileId"
                          params={{ kind: item.kind, fileId: item.file_id }}
                          className="block truncate text-base font-semibold text-gray-900 transition-colors hover:text-primary-600 dark:text-white dark:hover:text-primary-300"
                        >
                          {item.title || item.filename}
                        </Link>
                        <div className="mt-1 truncate text-sm text-gray-500 dark:text-zinc-400">
                          {item.filename}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          to="/files/$kind/$fileId"
                          params={{ kind: item.kind, fileId: item.file_id }}
                          className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-black/3 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-black/6 dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
                        >
                          <FolderOpen size={14} />
                          {t('views.filesView.details', 'Details')}
                        </Link>
                        <a
                          href={resolveBackendDownloadUrl(item.download_url)}
                          className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-black/3 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-black/6 dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
                        >
                          <Download size={14} />
                          {t('views.filesView.download', 'Download')}
                        </a>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-zinc-400">
                      <span>{formatDateTime(item.created_at, i18n.language)}</span>
                      {item.source_tool ? <span>· {item.source_tool}</span> : null}
                    </div>

                    <div className="mt-4 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.file_id}
                        className="inline-flex items-center gap-2 rounded-full border border-red-300/60 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100 dark:hover:bg-red-500/16"
                      >
                        <Trash2 size={14} />
                        {deletingId === item.file_id
                          ? t('views.filesView.deleting', 'Deleting...')
                          : t('views.filesView.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FilesView
