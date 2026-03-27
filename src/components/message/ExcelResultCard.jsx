import React, { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Download, FileSpreadsheet, FolderOpen } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../contexts/ToastContext'

const extractGeneratedFileRouteParams = (downloadUrl, expectedKind) => {
  const value = String(downloadUrl || '').trim()
  const match = value.match(/\/api\/files\/(pptx|excel)\/([^/?#]+)/i)
  if (!match) return null
  const [, kind, fileId] = match
  if (expectedKind && kind.toLowerCase() !== expectedKind.toLowerCase()) return null
  return { kind: kind.toLowerCase(), fileId }
}

const downloadResolvedFile = async (url, filename = 'workbook.xlsx') => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

const normalizePreviewSheets = payload => {
  const sheets = Array.isArray(payload?.preview?.sheets) ? payload.preview.sheets : []
  return sheets
    .map(sheet => ({
      name: String(sheet?.name || '').trim() || 'Sheet',
      columns: Array.isArray(sheet?.columns) ? sheet.columns.map(item => String(item || '')) : [],
      rows: Array.isArray(sheet?.rows) ? sheet.rows : [],
      totalRows: Number.isFinite(sheet?.total_rows) ? Number(sheet.total_rows) : 0,
      totalColumns: Number.isFinite(sheet?.total_columns) ? Number(sheet.total_columns) : 0,
    }))
    .filter(sheet => sheet.columns.length > 0 || sheet.rows.length > 0)
}

export default function ExcelResultCard({ payload, displayTitle, resolveBackendDownloadUrl, t }) {
  const toast = useToast()
  const previewSheets = normalizePreviewSheets(payload)
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)
  const primarySheet = useMemo(
    () => previewSheets[activeSheetIndex] || previewSheets[0] || null,
    [activeSheetIndex, previewSheets],
  )
  const detailParams = extractGeneratedFileRouteParams(payload?.downloadUrl, 'excel')

  useEffect(() => {
    setActiveSheetIndex(0)
  }, [payload?.downloadUrl])

  const handleDownload = async () => {
    const url = resolveBackendDownloadUrl(payload?.downloadUrl)
    if (!url) return
    try {
      await downloadResolvedFile(url, payload?.filename || 'workbook.xlsx')
    } catch (error) {
      console.error('Failed to download generated excel file:', error)
      toast.error(
        t(
          'messageBubble.fileCard.downloadMissing',
          'This file was deleted or no longer exists. Open Files to check your generated files.',
        ),
      )
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-black/10 bg-white/80 p-4 text-sm text-zinc-800 shadow-sm dark:border-white/10 dark:bg-black/15 dark:text-zinc-200 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <FileSpreadsheet size={16} className="shrink-0 text-emerald-600 dark:text-emerald-300" />
            <span className="truncate">
              {payload?.title || displayTitle || t('tools.excelGenerator', 'Excel Generator')}
            </span>
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {payload?.filename || 'workbook.xlsx'}
            {Number(payload?.sheetCount) > 0
              ? ` · ${t('messageBubble.excel.sheetCount', {
                  count: payload.sheetCount,
                  defaultValue: '{{count}} sheets',
                })}`
              : ''}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {detailParams ? (
            <Link
              to="/files/$kind/$fileId"
              params={detailParams}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              <FolderOpen size={14} />
              {t('messageBubble.fileCard.openFiles', 'Open files')}
            </Link>
          ) : (
            <Link
              to="/files"
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              <FolderOpen size={14} />
              {t('messageBubble.fileCard.openFiles', 'Open files')}
            </Link>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!payload?.downloadUrl}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/16"
          >
            <Download size={14} />
            {t('messageBubble.excel.download', 'Download Excel')}
          </button>
        </div>
      </div>

      {primarySheet ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-black/6 dark:border-white/8">
          {previewSheets.length > 1 ? (
            <div className="border-b border-black/6 bg-black/2 px-3 py-2 dark:border-white/8 dark:bg-white/4">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {previewSheets.map((sheet, index) => (
                  <button
                    key={`${sheet.name}-${index}`}
                    type="button"
                    onClick={() => setActiveSheetIndex(index)}
                    className={clsx(
                      'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                      index === activeSheetIndex
                        ? 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100'
                        : 'border-black/8 bg-white/65 text-zinc-600 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:text-zinc-300 dark:hover:bg-white/10',
                    )}
                  >
                    {sheet.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="border-b border-black/6 bg-black/3 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-white/8 dark:bg-white/5 dark:text-zinc-300">
            {primarySheet.name}
            {primarySheet.totalRows > 0
              ? ` · ${t('messageBubble.excel.previewRows', {
                  count: primarySheet.totalRows,
                  defaultValue: '{{count}} rows',
                })}`
              : ''}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              {primarySheet.columns.length > 0 ? (
                <thead>
                  <tr className="border-b border-black/6 bg-black/2 dark:border-white/8 dark:bg-white/4">
                    {primarySheet.columns.map((column, index) => (
                      <th
                        key={`${primarySheet.name}-col-${index}`}
                        className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200"
                      >
                        {column || t('messageBubble.excel.unnamedColumn', 'Column')}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {primarySheet.rows.map((row, rowIndex) => (
                  <tr
                    key={`${primarySheet.name}-row-${rowIndex}`}
                    className="border-b border-black/5 last:border-b-0 dark:border-white/6"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${primarySheet.name}-cell-${rowIndex}-${cellIndex}`}
                        className="max-w-[220px] truncate px-3 py-2 text-zinc-700 dark:text-zinc-300"
                      >
                        {String(cell ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
