import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import {
  ArrowLeft,
  ChevronDown,
  Columns3,
  Download,
  FileSpreadsheet,
  FileType2,
  FolderOpen,
  Highlighter,
  Filter,
  Menu,
  Search,
  X,
} from 'lucide-react'
import { FolderOpen as FolderOpenIcon } from '@phosphor-icons/react'
import { useAppContext } from '../App'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import FancyLoader from '../components/FancyLoader'
import HtmlWidgetCard from '../components/message/HtmlWidgetCard'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
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

const DEFAULT_EXCEL_VIEW_STATE = {
  searchQuery: '',
  hiddenColumnIndexes: [],
  selectedRowIndex: null,
  selectedColumnIndex: null,
  selectedCell: null,
  columnFilters: {},
  filterColumnIndex: 0,
}

const getSheetKey = (sheet, index) => String(sheet?.name || '').trim() || `sheet-${index + 1}`

const getExcelColumnLabel = index => {
  let value = Number(index) + 1
  if (!Number.isFinite(value) || value <= 0) return ''
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

const getExcelCellCoordinate = (rowIndex, columnIndex) => {
  const columnLabel = getExcelColumnLabel(columnIndex)
  const rowLabel = Number.isFinite(rowIndex) ? rowIndex + 1 : ''
  return `${columnLabel}${rowLabel}`
}

const getExcelCellValue = (row, columnIndex, columns = []) => {
  if (Array.isArray(row)) {
    return row[columnIndex]
  }
  if (row && typeof row === 'object') {
    const columnName = columns[columnIndex]
    if (columnName && Object.prototype.hasOwnProperty.call(row, columnName)) {
      return row[columnName]
    }
    const rowKeys = Object.keys(row)
    return rowKeys[columnIndex] ? row[rowKeys[columnIndex]] : undefined
  }
  return undefined
}

const normalizeExcelPreviewRow = (row, columns = []) => {
  if (Array.isArray(row)) return row
  if (!row || typeof row !== 'object') return []
  return columns.map((_, columnIndex) => getExcelCellValue(row, columnIndex, columns))
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
  const [excelViewState, setExcelViewState] = useState({})

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
  const activeExcelSheetKey = useMemo(
    () => getSheetKey(activeExcelSheet, activeExcelSheetIndex),
    [activeExcelSheet, activeExcelSheetIndex],
  )
  const activeExcelSheetState = excelViewState[activeExcelSheetKey] || DEFAULT_EXCEL_VIEW_STATE
  const activeExcelSheetColumns = useMemo(
    () =>
      Array.isArray(activeExcelSheet?.columns)
        ? activeExcelSheet.columns.map(column => String(column || ''))
        : [],
    [activeExcelSheet],
  )
  const activeExcelSheetRows = useMemo(
    () => (Array.isArray(activeExcelSheet?.rows) ? activeExcelSheet.rows : []),
    [activeExcelSheet],
  )
  const activeHiddenColumnIndexes = useMemo(
    () => new Set(Array.isArray(activeExcelSheetState.hiddenColumnIndexes) ? activeExcelSheetState.hiddenColumnIndexes : []),
    [activeExcelSheetState.hiddenColumnIndexes],
  )
  const activeVisibleColumnEntries = useMemo(
    () =>
      activeExcelSheetColumns
        .map((column, columnIndex) => ({ column, columnIndex }))
        .filter(entry => !activeHiddenColumnIndexes.has(entry.columnIndex)),
    [activeExcelSheetColumns, activeHiddenColumnIndexes],
  )
  const activeVisibleColumnCount = activeVisibleColumnEntries.length
  const activeTotalColumnCount = activeExcelSheetColumns.length
  const activeTotalRowCount = activeExcelSheetRows.length
  const activeSearchQuery = String(activeExcelSheetState.searchQuery || '').trim().toLowerCase()
  const activeColumnFilters = activeExcelSheetState.columnFilters || {}
  const activeSelectedColumnIndex = useMemo(() => {
    if (!Number.isFinite(activeExcelSheetState.selectedColumnIndex)) return null
    if (activeTotalColumnCount <= 0) return null
    return Math.min(Math.max(activeExcelSheetState.selectedColumnIndex, 0), activeTotalColumnCount - 1)
  }, [activeExcelSheetState.selectedColumnIndex, activeTotalColumnCount])
  const activeFilterColumnIndex = useMemo(() => {
    if (!Number.isFinite(activeExcelSheetState.filterColumnIndex)) return 0
    const upperBound = Math.max(activeTotalColumnCount - 1, 0)
    return Math.min(Math.max(activeExcelSheetState.filterColumnIndex, 0), upperBound)
  }, [activeExcelSheetState.filterColumnIndex, activeTotalColumnCount])
  const activeFilterColumnName = activeExcelSheetColumns[activeFilterColumnIndex] || ''
  const activeFilterColumnValueOptions = useMemo(() => {
    const seen = new Map()
    activeExcelSheetRows.forEach(row => {
      const rawValue = getExcelCellValue(row, activeFilterColumnIndex, activeExcelSheetColumns)
      const normalizedValue = String(rawValue ?? '').trim() || t('views.fileDetailView.emptyCell', '(blank)')
      seen.set(normalizedValue, (seen.get(normalizedValue) || 0) + 1)
    })
    return Array.from(seen.entries()).sort((left, right) => left[0].localeCompare(right[0], i18n.language))
  }, [activeExcelSheetRows, activeFilterColumnIndex, activeExcelSheetColumns, i18n.language, t])
  const activeFilterColumnSelectedValues = Array.isArray(activeColumnFilters[activeFilterColumnIndex])
    ? activeColumnFilters[activeFilterColumnIndex]
    : null
  const activeColumnFilterCount = useMemo(
    () =>
      Object.values(activeColumnFilters).filter(values => Array.isArray(values) && values.length > 0).length,
    [activeColumnFilters],
  )
  const activeFilteredRows = useMemo(() => {
    return activeExcelSheetRows
      .map((row, rowIndex) => ({
        row: normalizeExcelPreviewRow(row, activeExcelSheetColumns),
        rowIndex,
      }))
      .filter(entry => {
        if (activeSearchQuery && !entry.row.some(cell => String(cell ?? '').toLowerCase().includes(activeSearchQuery))) {
          return false
        }
        return Object.entries(activeColumnFilters).every(([columnIndex, selectedValues]) => {
          if (!Array.isArray(selectedValues) || selectedValues.length === 0) return true
          const rawValue = getExcelCellValue(entry.row, Number(columnIndex), activeExcelSheetColumns)
          const normalizedValue = String(rawValue ?? '').trim() || t('views.fileDetailView.emptyCell', '(blank)')
          return selectedValues.includes(normalizedValue)
        })
      })
  }, [activeExcelSheetRows, activeSearchQuery, activeColumnFilters, activeExcelSheetColumns, t])
  const activeSelectedCell = useMemo(() => {
    if (!activeExcelSheetState.selectedCell) return null
    const { rowIndex, columnIndex } = activeExcelSheetState.selectedCell
    if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) return null
    if (rowIndex < 0 || rowIndex >= activeTotalRowCount) return null
    if (columnIndex < 0 || columnIndex >= activeTotalColumnCount) return null
    return {
      rowIndex,
      columnIndex,
      coordinate: getExcelCellCoordinate(rowIndex, columnIndex),
    }
  }, [activeExcelSheetState.selectedCell, activeTotalRowCount, activeTotalColumnCount])

  const updateActiveExcelSheetState = updater => {
    setExcelViewState(current => {
      const existing = current[activeExcelSheetKey] || DEFAULT_EXCEL_VIEW_STATE
      const nextState = typeof updater === 'function' ? updater(existing) : { ...existing, ...updater }
      return {
        ...current,
        [activeExcelSheetKey]: {
          ...existing,
          ...nextState,
        },
      }
    })
  }

  const handleToggleExcelColumn = columnIndex => {
    updateActiveExcelSheetState(current => {
      const hidden = new Set(Array.isArray(current.hiddenColumnIndexes) ? current.hiddenColumnIndexes : [])
      const isHidden = hidden.has(columnIndex)
      if (!isHidden && activeVisibleColumnCount <= 1) {
        return current
      }
      if (isHidden) {
        hidden.delete(columnIndex)
      } else {
        hidden.add(columnIndex)
      }
      return {
        ...current,
        hiddenColumnIndexes: Array.from(hidden).sort((a, b) => a - b),
        selectedRowIndex: typeof current.selectedRowIndex === 'number' ? current.selectedRowIndex : null,
        selectedColumnIndex:
          current.selectedColumnIndex === columnIndex ? null : current.selectedColumnIndex,
        selectedCell:
          current.selectedCell && current.selectedCell.columnIndex === columnIndex ? null : current.selectedCell,
      }
    })
  }

  const handleResetExcelView = () => {
    updateActiveExcelSheetState(DEFAULT_EXCEL_VIEW_STATE)
  }

  const handleResetExcelFilters = () => {
    updateActiveExcelSheetState(current => ({
      ...current,
      columnFilters: {},
      selectedRowIndex: null,
      selectedColumnIndex: null,
      selectedCell: null,
    }))
  }

  const handleChangeExcelFilterColumn = columnIndex => {
    updateActiveExcelSheetState(current => ({
      ...current,
      filterColumnIndex: columnIndex,
    }))
  }

  const handleClearExcelFilterColumn = columnIndex => {
    updateActiveExcelSheetState(current => {
      const nextFilters = { ...(current.columnFilters || {}) }
      delete nextFilters[columnIndex]
      return {
        ...current,
        columnFilters: nextFilters,
        selectedRowIndex: null,
        selectedColumnIndex: null,
        selectedCell: null,
      }
    })
  }

  const handleToggleExcelFilterValue = (columnIndex, value) => {
    updateActiveExcelSheetState(current => {
      const currentFilters = { ...(current.columnFilters || {}) }
      const allValuesForColumn = activeFilterColumnValueOptions.map(([optionValue]) => optionValue)
      const existingValues = new Set(
        Array.isArray(currentFilters[columnIndex]) ? currentFilters[columnIndex] : allValuesForColumn,
      )
      if (existingValues.has(value)) {
        existingValues.delete(value)
      } else {
        existingValues.add(value)
      }
      if (existingValues.size === 0 || existingValues.size === allValuesForColumn.length) {
        delete currentFilters[columnIndex]
      } else {
        currentFilters[columnIndex] = Array.from(existingValues)
      }
      return {
        ...current,
        columnFilters: currentFilters,
        selectedRowIndex: null,
        selectedColumnIndex: null,
        selectedCell: null,
      }
    })
  }

  const handleToggleExcelColumnSelection = columnIndex => {
    updateActiveExcelSheetState(current => ({
      ...current,
      selectedColumnIndex: current.selectedColumnIndex === columnIndex ? null : columnIndex,
      selectedCell: null,
    }))
  }

  const handleRowSelect = rowIndex => {
    updateActiveExcelSheetState(current => ({
      ...current,
      selectedRowIndex: current.selectedRowIndex === rowIndex ? null : rowIndex,
      selectedCell: null,
    }))
  }

  const handleCellSelect = (rowIndex, columnIndex) => {
    updateActiveExcelSheetState(current => {
      const isSameCell =
        current.selectedCell &&
        current.selectedCell.rowIndex === rowIndex &&
        current.selectedCell.columnIndex === columnIndex
      return {
        ...current,
        selectedRowIndex: null,
        selectedColumnIndex: null,
        selectedCell: isSameCell ? null : { rowIndex, columnIndex },
      }
    })
  }

  useEffect(() => {
    setActiveExcelSheetIndex(0)
    setExcelViewState({})
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
        <div className="mx-auto w-full max-w-[1360px] shrink-0 px-4 pt-4 pb-3 sm:px-8 sm:pt-6 sm:pb-4">
          <div className="mb-4 flex items-start justify-between gap-3 sm:items-center">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <button
                onClick={() => toggleSidebar()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white sm:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <FolderOpenIcon
                size={28}
                weight="duotone"
                className="mt-0.5 shrink-0 text-primary-500 sm:mt-0"
              />
              <h1 className="min-w-0 text-xl leading-none font-semibold tracking-tight text-gray-950 sm:text-2xl dark:text-white">
                {t('views.fileDetailView.title', 'File details')}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/files"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">
                  {t('views.fileDetailView.back', 'Back to files')}
                </span>
              </Link>
              {item?.download_url ? (
                <a
                  href={resolveBackendDownloadUrl(item.download_url)}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-black/10 bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-black dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">
                    {t('views.filesView.download', 'Download')}
                  </span>
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
              <div className="rounded-[1.5rem] border border-dashed border-gray-300/80 bg-white/60 px-8 py-16 text-center backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/30">
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
            <div className="mx-auto max-w-[1360px] space-y-4">
              <div className="rounded-[1.75rem] border border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.85),rgba(255,255,255,0.66))] p-5 shadow-[0_22px_55px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/8 dark:bg-[radial-gradient(circle_at_bottom_left,rgba(16,35,31,0.36),rgba(10,10,14,0.92))]">
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
                <div className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                  {item.title || item.filename}
                </div>
                <div className="mt-2 text-base text-gray-500 dark:text-zinc-400">{item.filename}</div>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <div className="rounded-full border border-black/6 bg-black/[0.03] px-4 py-2 text-xs text-gray-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-zinc-300">
                    <span className="mr-1 text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.createdAt', 'Created at')}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatDateTime(item.created_at, i18n.language)}
                    </span>
                  </div>
                  <div className="rounded-full border border-black/6 bg-black/[0.03] px-4 py-2 text-xs text-gray-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-zinc-300">
                    <span className="mr-1 text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.sourceTool', 'Source tool')}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {item.source_tool || '-'}
                    </span>
                  </div>
                  <div className="rounded-full border border-black/6 bg-black/[0.03] px-4 py-2 text-xs text-gray-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-zinc-300">
                    <span className="mr-1 text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.mimeType', 'MIME type')}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {item.mime_type || '-'}
                    </span>
                  </div>
                  <div className="min-w-0 rounded-full border border-black/6 bg-black/[0.03] px-4 py-2 text-xs text-gray-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-zinc-300">
                    <span className="mr-1 text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.fileId', 'File ID')}
                    </span>
                    <span className="break-all font-medium text-gray-900 dark:text-white">
                      {item.file_id}
                    </span>
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
                  <div className="rounded-[1.5rem] border border-dashed border-gray-300/80 bg-white/60 px-8 py-16 text-center backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/30">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('views.fileDetailView.noPreviewTitle', 'No preview available')}
                    </div>
                    <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                      {t('views.fileDetailView.noPreviewBody', 'This file was saved before preview metadata was persisted, or no preview was generated.')}
                    </div>
                  </div>
                )
              ) : excelSheets.length > 0 && activeExcelSheet ? (
                <div className="overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/72 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/38">
                  <div className="border-b border-black/6 bg-black/2 px-3 py-3 backdrop-blur-xl dark:border-white/8 dark:bg-white/4 sm:px-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative min-w-0 flex-1">
                          <Search
                            size={14}
                            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400"
                          />
                          <Input
                            value={activeExcelSheetState.searchQuery || ''}
                            onChange={event =>
                              updateActiveExcelSheetState({
                                searchQuery: event.target.value,
                              })
                            }
                            placeholder={t(
                              'views.fileDetailView.excelToolbarSearch',
                              'Search rows in this sheet',
                            )}
                            className="h-10 rounded-full border-black/8 bg-white/80 pl-10 pr-10 text-sm shadow-none backdrop-blur-xl focus-visible:ring-1 focus-visible:ring-primary-500/20 dark:border-white/10 dark:bg-white/6 dark:text-white"
                          />
                          {activeExcelSheetState.searchQuery ? (
                            <button
                              type="button"
                              onClick={() => updateActiveExcelSheetState({ searchQuery: '' })}
                              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                              aria-label={t('views.fileDetailView.clearSearch', 'Clear search')}
                            >
                              <X size={12} />
                            </button>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-10 items-center gap-2 rounded-full border border-black/8 bg-white/80 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
                              >
                                <Columns3 size={14} />
                                <span>{t('views.fileDetailView.columns', 'Columns')}</span>
                                <span className="rounded-full border border-black/6 bg-black/[0.03] px-2 py-0.5 text-[11px] text-zinc-500 dark:border-white/8 dark:bg-white/5 dark:text-zinc-300">
                                  {activeVisibleColumnCount}/{activeTotalColumnCount}
                                </span>
                                <ChevronDown size={12} className="text-zinc-400" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1.5rem))] p-3">
                              <div className="flex items-center justify-between gap-3 border-b border-black/6 pb-2 dark:border-white/8">
                                <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                                  {t('views.fileDetailView.columns', 'Columns')}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateActiveExcelSheetState(current => ({
                                      ...current,
                                      hiddenColumnIndexes: [],
                                    }))
                                  }
                                  className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-300 dark:hover:text-primary-200"
                                >
                                  {t('views.fileDetailView.showAllColumns', 'Show all')}
                                </button>
                              </div>
                              <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
                                {activeExcelSheetColumns.map((column, columnIndex) => {
                                  const checked = !activeHiddenColumnIndexes.has(columnIndex)
                                  const disableHide = checked && activeVisibleColumnCount <= 1
                                  return (
                                    <label
                                      key={`${activeExcelSheetKey}-column-${columnIndex}`}
                                      className={clsx(
                                        'flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 transition-colors',
                                        checked
                                          ? 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-500/10'
                                          : 'border-black/6 bg-white/60 dark:border-white/8 dark:bg-white/4',
                                      )}
                                    >
                                      <Checkbox
                                        checked={checked}
                                        disabled={disableHide}
                                        onCheckedChange={() => handleToggleExcelColumn(columnIndex)}
                                      />
                                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-200">
                                        {column || t('messageBubble.excel.unnamedColumn', 'Column')}
                                      </span>
                                      <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                                        {columnIndex + 1}
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>

                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={clsx(
                                  'inline-flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors',
                                  activeColumnFilterCount > 0
                                    ? 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100'
                                    : 'border-black/8 bg-white/80 text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10',
                                )}
                              >
                                <Filter size={14} />
                                <span>{t('views.fileDetailView.filterRows', 'Filter rows')}</span>
                                {activeColumnFilterCount > 0 ? (
                                  <span className="rounded-full border border-black/6 bg-black/[0.03] px-2 py-0.5 text-[11px] text-zinc-500 dark:border-white/8 dark:bg-white/5 dark:text-zinc-300">
                                    {activeColumnFilterCount}
                                  </span>
                                ) : null}
                                <ChevronDown size={12} className="text-zinc-400" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[min(28rem,calc(100vw-1.5rem))] p-3">
                              <div className="flex items-center justify-between gap-3 border-b border-black/6 pb-2 dark:border-white/8">
                                <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                                  {t('views.fileDetailView.filterRows', 'Filter rows')}
                                </div>
                                {activeFilterColumnSelectedValues ? (
                                  <button
                                    type="button"
                                    onClick={() => handleClearExcelFilterColumn(activeFilterColumnIndex)}
                                    className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-300 dark:hover:text-primary-200"
                                  >
                                    {t('views.fileDetailView.clearColumnFilter', 'Clear this column')}
                                  </button>
                                ) : null}
                              </div>

                              {activeTotalColumnCount > 0 ? (
                                <>
                                  {activeTotalColumnCount > 1 ? (
                                    <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                                      {activeExcelSheetColumns.map((column, columnIndex) => (
                                        <button
                                          key={`${activeExcelSheetKey}-filter-column-${columnIndex}`}
                                          type="button"
                                          onClick={() => handleChangeExcelFilterColumn(columnIndex)}
                                          className={clsx(
                                            'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                            columnIndex === activeFilterColumnIndex
                                              ? 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100'
                                              : 'border-black/8 bg-white/65 text-zinc-600 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-300 dark:hover:bg-white/10',
                                          )}
                                        >
                                          {column || t('messageBubble.excel.unnamedColumn', 'Column')}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}

                                  <div className="mt-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400">
                                      {activeFilterColumnName || t('views.fileDetailView.columns', 'Columns')}
                                    </div>
                                    {activeFilterColumnSelectedValues ? (
                                      <div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                                        {t('views.fileDetailView.visibleRows', {
                                          visible: activeFilteredRows.length,
                                          total: activeTotalRowCount,
                                          defaultValue: '{{visible}} / {{total}} rows',
                                        })}
                                      </div>
                                    ) : (
                                      <div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                                        {t('views.fileDetailView.filterRows', 'Filter rows')}
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
                                    {activeFilterColumnValueOptions.length > 0 ? (
                                      activeFilterColumnValueOptions.map(([value, count]) => {
                                        const checked = activeFilterColumnSelectedValues
                                          ? activeFilterColumnSelectedValues.includes(value)
                                          : true
                                        return (
                                          <label
                                            key={`${activeExcelSheetKey}-filter-value-${activeFilterColumnIndex}-${value}`}
                                            className={clsx(
                                              'flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 transition-colors',
                                              checked
                                                ? 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-500/10'
                                                : 'border-black/6 bg-white/60 dark:border-white/8 dark:bg-white/4',
                                            )}
                                          >
                                            <Checkbox
                                              checked={checked}
                                              onCheckedChange={() =>
                                                handleToggleExcelFilterValue(activeFilterColumnIndex, value)
                                              }
                                            />
                                            <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-200">
                                              {value}
                                            </span>
                                            <span className="shrink-0 rounded-full border border-black/6 bg-black/[0.03] px-2 py-0.5 text-[11px] text-zinc-500 dark:border-white/8 dark:bg-white/5 dark:text-zinc-300">
                                              {count}
                                            </span>
                                          </label>
                                        )
                                      })
                                    ) : (
                                      <div className="rounded-2xl border border-dashed border-black/8 bg-white/60 px-4 py-8 text-center text-xs text-zinc-500 dark:border-white/10 dark:bg-white/4 dark:text-zinc-400">
                                        {t(
                                          'views.fileDetailView.noFilterValues',
                                          'No filterable values in this column.',
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/6 pt-3 dark:border-white/8">
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                      {activeColumnFilterCount > 0
                                        ? t('views.fileDetailView.visibleRows', {
                                            visible: activeFilteredRows.length,
                                            total: activeTotalRowCount,
                                            defaultValue: '{{visible}} / {{total}} rows',
                                          })
                                        : t(
                                            'views.fileDetailView.allValuesSelected',
                                            'All values selected',
                                          )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleResetExcelFilters}
                                      className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
                                    >
                                      <X size={12} />
                                      {t('views.fileDetailView.clearFilters', 'Clear filters')}
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="rounded-2xl border border-dashed border-black/8 bg-white/60 px-4 py-8 text-center text-xs text-zinc-500 dark:border-white/10 dark:bg-white/4 dark:text-zinc-400">
                                  {t('views.fileDetailView.noPreviewTitle', 'No preview available')}
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>

                          <span className="inline-flex h-10 items-center rounded-full border border-black/8 bg-white/70 px-3 text-xs font-medium text-zinc-600 dark:border-white/10 dark:bg-white/6 dark:text-zinc-300">
                            {t('views.fileDetailView.visibleRows', {
                              visible: activeFilteredRows.length,
                              total: activeTotalRowCount,
                              defaultValue: '{{visible}} / {{total}} rows',
                            })}
                          </span>

                          <span className="inline-flex h-10 items-center rounded-full border border-black/8 bg-white/70 px-3 text-xs font-medium text-zinc-600 dark:border-white/10 dark:bg-white/6 dark:text-zinc-300">
                            {t('views.fileDetailView.visibleColumns', {
                              visible: activeVisibleColumnCount,
                              total: activeTotalColumnCount,
                              defaultValue: '{{visible}} / {{total}} columns',
                            })}
                          </span>

                          <div className="flex flex-wrap items-center gap-2">
                            {activeSelectedCell ? (
                              <span className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 text-xs font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                                <Highlighter size={13} />
                                {t('views.fileDetailView.selectedCell', {
                                  cell: activeSelectedCell.coordinate,
                                  defaultValue: 'Cell {{cell}} selected',
                                })}
                              </span>
                            ) : null}
                            {typeof activeExcelSheetState.selectedRowIndex === 'number' ? (
                              <span className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 text-xs font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                                <Highlighter size={13} />
                                {t('views.fileDetailView.selectedRow', {
                                  index: activeExcelSheetState.selectedRowIndex + 1,
                                  defaultValue: 'Row {{index}} selected',
                                })}
                              </span>
                            ) : null}
                            {typeof activeSelectedColumnIndex === 'number' ? (
                              <span className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 text-xs font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                                <Highlighter size={13} />
                                {t('views.fileDetailView.selectedColumn', {
                                  index: activeSelectedColumnIndex + 1,
                                  label: getExcelColumnLabel(activeSelectedColumnIndex),
                                  defaultValue: 'Column {{label}} selected',
                                })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleResetExcelView}
                        className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-black/8 bg-white/80 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10 xl:self-auto"
                      >
                        <X size={14} />
                        {t('views.fileDetailView.clearView', 'Clear')}
                      </button>
                    </div>
                  </div>
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
                      {activeVisibleColumnEntries.length > 0 ? (
                        <thead>
                          <tr className="border-b border-black/6 bg-black/2 dark:border-white/8 dark:bg-white/4">
                            <th className="sticky left-0 z-20 w-14 border-r border-black/5 bg-black/2 px-3 py-2 font-medium text-zinc-500 dark:border-white/8 dark:bg-white/4 dark:text-zinc-400">
                              #
                            </th>
                            {activeVisibleColumnEntries.map(({ column, columnIndex }) => (
                              <th
                                key={`${activeExcelSheet.name}-col-${columnIndex}`}
                                className={clsx(
                                  'relative px-0 py-0 font-medium text-zinc-700 dark:text-zinc-200',
                                  activeSelectedColumnIndex === columnIndex &&
                                    'bg-emerald-500/10 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-100',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleExcelColumnSelection(columnIndex)}
                                  className={clsx(
                                    'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors',
                                    activeSelectedColumnIndex === columnIndex
                                      ? 'text-emerald-800 dark:text-emerald-100'
                                      : 'hover:bg-black/[0.03] dark:hover:bg-white/5',
                                  )}
                                >
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400 dark:text-zinc-500">
                                    {getExcelColumnLabel(columnIndex)}
                                  </span>
                                  <span className="min-w-0 truncate">
                                    {column || t('messageBubble.excel.unnamedColumn', 'Column')}
                                  </span>
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                      ) : null}
                      <tbody>
                        {activeFilteredRows.length > 0 ? (
                          activeFilteredRows.map(({ row, rowIndex: originalRowIndex }) => {
                            const isSelected = activeExcelSheetState.selectedRowIndex === originalRowIndex
                            return (
                              <tr
                                key={`${activeExcelSheet.name}-row-${originalRowIndex}`}
                                className={clsx(
                                  'border-b border-black/5 transition-colors last:border-b-0 dark:border-white/6',
                                  isSelected
                                    ? 'bg-emerald-500/10 dark:bg-emerald-400/10'
                                    : 'hover:bg-black/[0.03] dark:hover:bg-white/5',
                                )}
                              >
                                <td
                                  className={clsx(
                                    'sticky left-0 z-10 w-14 border-r border-black/5 bg-white/90 px-0 py-0 text-xs font-medium text-zinc-500 dark:border-white/8 dark:bg-zinc-950/90 dark:text-zinc-400',
                                    isSelected &&
                                      'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100',
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleRowSelect(originalRowIndex)}
                                    className={clsx(
                                      'flex h-full w-full items-center justify-center px-3 py-2 transition-colors',
                                      isSelected
                                        ? 'text-emerald-800 dark:text-emerald-100'
                                        : 'hover:bg-black/[0.03] dark:hover:bg-white/5',
                                    )}
                                    aria-label={t('views.fileDetailView.selectedRow', {
                                      index: originalRowIndex + 1,
                                      defaultValue: 'Row {{index}} selected',
                                    })}
                                  >
                                    {originalRowIndex + 1}
                                  </button>
                                </td>
                                {activeVisibleColumnEntries.map(({ columnIndex }) => (
                                  <td
                                    key={`${activeExcelSheet.name}-cell-${originalRowIndex}-${columnIndex}`}
                                    onClick={() => handleCellSelect(originalRowIndex, columnIndex)}
                                    className={clsx(
                                      'max-w-[220px] cursor-pointer truncate px-3 py-2 text-zinc-700 transition-colors dark:text-zinc-300',
                                      activeSelectedColumnIndex === columnIndex &&
                                        'bg-emerald-500/10 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-50',
                                      activeSelectedCell &&
                                        activeSelectedCell.rowIndex === originalRowIndex &&
                                        activeSelectedCell.columnIndex === columnIndex &&
                                        'bg-primary-500/15 text-primary-900 ring-1 ring-inset ring-primary-400/60 dark:bg-primary-400/15 dark:text-white dark:ring-primary-300/60',
                                      isSelected && 'bg-emerald-500/10 dark:bg-emerald-400/10',
                                    )}
                                    aria-label={getExcelCellCoordinate(originalRowIndex, columnIndex)}
                                  >
                                    {String(row[columnIndex] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan={Math.max(activeVisibleColumnEntries.length + 1, 1)}
                              className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                            >
                              {t(
                                'views.fileDetailView.excelEmpty',
                                'No rows match the current preview filters.',
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-gray-300/80 bg-white/60 px-8 py-16 text-center backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/30">
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
