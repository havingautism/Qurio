// Generated files list page — displays PPT/Excel files exported by tools
// Route: /files — sidebar Files tab entry
// Differs from conversation list pages: frontend pagination, setTimeout debounce search, shadcn/ui Select
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileType2,
  FolderOpen,
  Menu,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { FolderOpen as FolderOpenIcon } from '@phosphor-icons/react'
import { useAppContext } from '../App'
import { deleteGeneratedFile, listGeneratedFiles } from '../lib/generatedFilesService'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import FancyLoader from '../components/FancyLoader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '../contexts/ToastContext'
import { getBackendUrl } from '../lib/settings'

// Filter by file kind (all / pptx / excel)
const FILTER_OPTIONS = [
  { key: 'all', value: '' },
  { key: 'pptx', value: 'pptx' },
  { key: 'excel', value: 'excel' },
]

// Sort by creation time (newest first / oldest first)
const SORT_OPTIONS = [
  { key: 'newest', value: 'desc' },
  { key: 'oldest', value: 'asc' },
]

// Per-kind display metadata: label, icon, badge styling
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

// Resolve download URL: relative paths get prefixed with backend URL, absolute URLs returned as-is
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
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12

  // setTimeout debounce: auto-trigger search 180ms after user stops typing
  // Differs from ExpertView's manual-confirm pattern (press Enter or click search)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActiveSearchQuery(searchQuery.trim())
    }, 180)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [kindFilter, activeSearchQuery, sortOrder, pageSize])

  // Fetch all generated files in one batch (frontend pagination, not server-side)
  // Uses cancelled flag to prevent setting state on unmounted component
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

  // Compute file type statistics from full dataset (for dashboard cards)
  const stats = useMemo(() => {
    let pptxCount = 0
    let excelCount = 0
    for (const item of items) {
      if (item?.kind === 'pptx') pptxCount += 1
      if (item?.kind === 'excel') excelCount += 1
    }
    return { total: items.length, pptx: pptxCount, excel: excelCount }
  }, [items])

  // Frontend pagination: slice the full items array by current page
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pagedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, pageSize, safeCurrentPage])

  // Delete with confirmation, then filter out from local state (no refetch)
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
        <div className="mx-auto w-full max-w-[1360px] shrink-0 px-4 pt-4 pb-3 sm:px-8 sm:pt-6 sm:pb-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <button
                onClick={() => toggleSidebar()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white sm:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <FolderOpenIcon size={30} weight="duotone" className="text-primary-500" />
              <h1 className="text-xl font-semibold tracking-tight text-gray-950 sm:text-2xl dark:text-white">
                {t('views.filesView.title', 'Generated Files')}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setIsSearchOpen(current => !current)}
              className={clsx(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all hover:bg-white/70 dark:hover:bg-zinc-800/70',
                isSearchOpen ? 'text-primary-500' : 'text-gray-600 dark:text-gray-400',
              )}
            >
              <Search size={21} strokeWidth={2.5} />
            </button>
          </div>

          {isSearchOpen ? (
            <div className="animate-in fade-in slide-in-from-top-2 mb-4 duration-200">
              <div className="relative">
                <Search size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder={t('views.filesView.searchPlaceholder', 'Search filename or title')}
                  autoFocus
                  className="focus:ring-primary-500/20 w-full rounded-2xl border-none bg-white py-3 pr-11 pl-12 text-sm text-gray-900 shadow-sm transition-all outline-none focus:ring-2 dark:bg-zinc-900 dark:text-white"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mb-4 sm:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
                {FILTER_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setKindFilter(option.value)}
                    className={clsx(
                      'shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
                      kindFilter === option.value
                        ? 'bg-primary-500 text-white'
                        : 'bg-black/[0.04] text-gray-600 hover:bg-black/[0.07] dark:bg-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.09]',
                    )}
                  >
                    {t(`views.filesView.filter.${option.key}`, option.key)}
                  </button>
                ))}
              </div>
              <div className="shrink-0 rounded-full border border-black/6 bg-white/65 px-3 py-2 text-xs font-medium text-gray-500 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400">
                {stats.total}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-[1.5rem] border border-white/55 bg-white/65 px-3.5 py-3 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/35">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-zinc-500">
                  {t('views.filesView.title', 'Generated Files')}
                </div>
                <div className="mt-1 text-sm font-medium text-gray-700 dark:text-zinc-200">
                  {t('views.filesView.totalFiles', 'Total files')}: {stats.total}
                </div>
              </div>
              <div className="min-w-[132px] shrink-0">
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-10 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-300">
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
            </div>
          </div>

          <div className="mb-4 hidden overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 p-3.5 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/38 sm:block sm:p-4">
            <div className="flex flex-col gap-3">
              <div className="hidden items-start gap-3 sm:flex">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-300/25 bg-primary-500/10 text-primary-500 dark:border-primary-400/20 dark:bg-primary-500/12 dark:text-primary-300">
                  <FolderOpenIcon size={22} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-semibold tracking-tight text-gray-950 sm:text-2xl dark:text-white">
                    {t('views.filesView.title', 'Generated Files')}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-zinc-400">
                    {t(
                      'views.filesView.subtitle',
                      'Browse exported PPT and Excel files saved by your tools.',
                    )}
                  </p>
                </div>
              </div>

              <div className="hidden gap-3 sm:grid sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-black/6 bg-black/[0.03] px-4 py-2.5 dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                    {t('views.filesView.totalFiles', 'Total files')}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
                    {stats.total}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-black/6 bg-black/[0.03] px-4 py-2.5 dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                    {t('views.filesView.totalPptx', 'PPT files')}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
                    {stats.pptx}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-black/6 bg-black/[0.03] px-4 py-2.5 dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                    {t('views.filesView.totalExcel', 'Excel files')}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
                    {stats.excel}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
                  {FILTER_OPTIONS.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setKindFilter(option.value)}
                      className={clsx(
                        'shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
                        kindFilter === option.value
                          ? 'bg-primary-500 text-white'
                          : 'bg-black/[0.04] text-gray-600 hover:bg-black/[0.07] dark:bg-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.09]',
                      )}
                    >
                      {t(`views.filesView.filter.${option.key}`, option.key)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="min-w-[132px]">
                    <Select value={sortOrder} onValueChange={setSortOrder}>
                      <SelectTrigger className="h-10 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-300">
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
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={clsx(
              'min-h-0 flex-1 overflow-y-auto px-4 sm:px-8',
              !loading && items.length > 0 && totalPages > 1 ? 'pb-24 sm:pb-28' : 'pb-8',
            )}
          >
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
              <div className="pt-1 grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3">
                {pagedItems.map(item => {
                  const meta = KIND_META[item.kind] || KIND_META.excel
                  const KindIcon = meta.icon
                  return (
                    <div
                      key={item.file_id}
                      className="group rounded-[2.15rem] border border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.85),rgba(255,255,255,0.66))] p-5 shadow-[0_22px_55px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-300 hover:translate-y-[-4px] hover:scale-[1.01] hover:border-white/80 hover:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(255,255,255,0.78))] hover:shadow-[0_30px_70px_-30px_rgba(0,0,0,0.32)] active:scale-[0.985] dark:border-white/8 dark:bg-[radial-gradient(circle_at_bottom_left,rgba(16,35,31,0.36),rgba(10,10,14,0.92))] dark:hover:border-white/12 dark:hover:bg-[radial-gradient(circle_at_bottom_left,rgba(20,44,40,0.45),rgba(12,12,18,0.96))]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-3 flex items-center gap-2">
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
                            className="block text-xl leading-tight font-semibold tracking-tight text-gray-950 transition-colors hover:text-primary-600 dark:text-white dark:hover:text-primary-300"
                          >
                            {item.title || item.filename}
                          </Link>
                          <div className="mt-2 truncate text-base text-gray-500 dark:text-zinc-400">
                            {item.filename}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-zinc-400">
                            <span>{formatDateTime(item.created_at, i18n.language)}</span>
                            {item.source_tool ? <span>· {item.source_tool}</span> : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to="/files/$kind/$fileId"
                            params={{ kind: item.kind, fileId: item.file_id }}
                            className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-black/3 px-3.5 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-black/6 dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
                          >
                            <FolderOpen size={14} />
                            {t('views.filesView.details', 'Details')}
                          </Link>
                          <a
                            href={resolveBackendDownloadUrl(item.download_url)}
                            className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-black/3 px-3.5 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-black/6 dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
                          >
                            <Download size={14} />
                            {t('views.filesView.download', 'Download')}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.file_id}
                          className="inline-flex items-center gap-2 rounded-full border border-red-300/60 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100 dark:hover:bg-red-500/16"
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

          {!loading && items.length > 0 && totalPages > 1 ? (
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 flex justify-center pb-8 sm:pb-10">
              <div className="pointer-events-auto flex items-center gap-2 rounded-3xl bg-white/80 p-1.5 shadow-2xl backdrop-blur-2xl transition-all sm:gap-3 dark:bg-zinc-900/80">
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={safeCurrentPage === 1}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="px-3 text-xs font-bold tracking-widest text-gray-500 uppercase sm:text-sm">
                  {safeCurrentPage} <span className="mx-1 text-gray-300">/</span> {totalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default FilesView
