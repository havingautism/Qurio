import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, LoaderCircle, Sparkles } from 'lucide-react'
import HtmlWidgetCard from './HtmlWidgetCard'
import { checkEnvStatus, installScraperEngine } from '../../lib/services/envService'
import { rebuildPptxFromPayload } from '../../lib/services/pptxService'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

const parseToolArguments = raw => {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const hasIssuePrefix = (issues, prefix) =>
  Array.isArray(issues) && issues.some(issue => String(issue || '').startsWith(prefix))

const hasIssue = (issues, code) =>
  Array.isArray(issues) && issues.some(issue => String(issue || '') === code)

const downloadResolvedFile = async (url, filename = 'presentation.pptx') => {
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

const hasUsableExpiry = expiresAt => {
  const value = String(expiresAt || '').trim()
  if (!value) return false
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false
  return timestamp > Date.now() + 5_000
}

const buildVariantDownloadsFromPayload = payload => {
  const renderMode = String(payload?.renderModeUsed || '').toLowerCase()
  const normalizedMode = renderMode === 'fidelity' ? 'fidelity' : renderMode === 'semantic' ? 'semantic' : ''
  const baseVariant =
    normalizedMode && payload?.downloadUrl
      ? {
          downloadUrl: payload.downloadUrl,
          filename: payload?.filename || 'presentation.pptx',
          expiresAt: payload?.expiresAt || '',
          source: 'payload',
        }
      : null

  return {
    semantic: normalizedMode === 'semantic' ? baseVariant : null,
    fidelity: normalizedMode === 'fidelity' ? baseVariant : null,
    activeMode: normalizedMode || null,
  }
}

export default function PptxResultCard({
  item,
  payload,
  displayTitle,
  resolveBackendDownloadUrl,
  t,
}) {
  const [isGeneratingSemantic, setIsGeneratingSemantic] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [isGeneratingFidelity, setIsGeneratingFidelity] = useState(false)
  const [semanticError, setSemanticError] = useState('')
  const [fidelityError, setFidelityError] = useState('')
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [variantDownloads, setVariantDownloads] = useState(() => buildVariantDownloadsFromPayload(payload))
  const [adaptivePreviewHeight, setAdaptivePreviewHeight] = useState(() => {
    if (typeof window === 'undefined') return 680
    const vh = window.innerHeight || 900
    const vw = window.innerWidth || 1360
    const preferred = Math.round(vh * 0.74)
    const byWidth = Math.round(vw * 0.6)
    return Math.max(520, Math.min(920, preferred, byWidth))
  })

  const rawQaIssues = Array.isArray(payload?.qaIssuesRaw) ? payload.qaIssuesRaw : []
  const requestPayload = useMemo(() => parseToolArguments(item?.arguments), [item?.arguments])
  const previewHeight = useMemo(() => {
    const raw = Number(payload?.previewHeight)
    const payloadHeight = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
    const fallback = Math.max(adaptivePreviewHeight, 680)
    if (!payloadHeight) return fallback
    return Math.max(fallback, Math.min(920, payloadHeight))
  }, [payload?.previewHeight, adaptivePreviewHeight])
  const previewTitle = `${payload?.title || displayTitle} ${t('messageBubble.ppt.previewSuffix', 'Preview')}`
  const hasPlaywrightMissing = hasIssuePrefix(rawQaIssues, 'fidelity_unavailable_playwright_missing:')
  const hasFidelityFallback =
    hasIssue(rawQaIssues, 'fidelity_requested_but_fallback_to_semantic') ||
    hasIssue(rawQaIssues, 'fidelity_auto_fallback_to_semantic')

  useEffect(() => {
    setVariantDownloads(buildVariantDownloadsFromPayload(payload))
  }, [payload])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const updatePreviewHeight = () => {
      const vh = window.innerHeight || 900
      const vw = window.innerWidth || 1360
      const preferred = Math.round(vh * 0.74)
      const byWidth = Math.round(vw * 0.6)
      setAdaptivePreviewHeight(Math.max(520, Math.min(920, preferred, byWidth)))
    }
    window.addEventListener('resize', updatePreviewHeight)
    return () => window.removeEventListener('resize', updatePreviewHeight)
  }, [])

  const semanticVariant = variantDownloads.semantic
  const fidelityVariant = variantDownloads.fidelity

  const registerVariantDownload = (mode, data) => {
    if (!data?.download_url) return
    setVariantDownloads(current => ({
      ...current,
      [mode]: {
        downloadUrl: data.download_url,
        filename: data.filename || payload?.filename || 'presentation.pptx',
        expiresAt: data.expires_at || '',
        source: 'runtime',
      },
      activeMode: mode,
    }))
  }

  const generateAndDownloadSemantic = async () => {
    if (!requestPayload || isGeneratingSemantic) return
    setIsGeneratingSemantic(true)
    setSemanticError('')
    const { data, error } = await rebuildPptxFromPayload({
      ...requestPayload,
      render_mode: 'semantic',
    })
    if (error) {
      setSemanticError(error)
      setIsGeneratingSemantic(false)
      return
    }
    if (!data || data.type !== 'pptx_file' || !data.download_url) {
      setSemanticError(
        data?.message ||
          t('messageBubble.ppt.rebuildUnexpectedResponse', 'Unexpected rebuild response.'),
      )
      setIsGeneratingSemantic(false)
      return
    }
    registerVariantDownload('semantic', data)
    await downloadResolvedFile(
      resolveBackendDownloadUrl(data.download_url),
      data.filename || payload?.filename || 'presentation.pptx',
    )
    setIsGeneratingSemantic(false)
  }

  const handleSemanticDownload = async () => {
    if (isGeneratingSemantic || isGeneratingFidelity) return
    setSemanticError('')
    if (semanticVariant?.downloadUrl && hasUsableExpiry(semanticVariant.expiresAt)) {
      try {
        await downloadResolvedFile(
          resolveBackendDownloadUrl(semanticVariant.downloadUrl),
          semanticVariant.filename || 'presentation.pptx',
        )
        return
      } catch {
        setVariantDownloads(current => ({
          ...current,
          semantic: null,
          activeMode: current.activeMode === 'semantic' ? null : current.activeMode,
        }))
      }
    }
    await generateAndDownloadSemantic()
  }

  const generateAndDownloadFidelity = async () => {
    if (!requestPayload || isGeneratingFidelity) return
    setIsGeneratingFidelity(true)
    setFidelityError('')
    const { data, error } = await rebuildPptxFromPayload({
      ...requestPayload,
      render_mode: 'fidelity',
      strict_fidelity: true,
    })
    if (error) {
      setFidelityError(error)
      setIsGeneratingFidelity(false)
      return
    }
    if (!data || data.type !== 'pptx_file' || !data.download_url) {
      setFidelityError(
        data?.message ||
          t('messageBubble.ppt.rebuildUnexpectedResponse', 'Unexpected rebuild response.'),
      )
      setIsGeneratingFidelity(false)
      return
    }
    registerVariantDownload('fidelity', data)
    await downloadResolvedFile(
      resolveBackendDownloadUrl(data.download_url),
      data.filename || payload?.filename || 'presentation.pptx',
    )
    setIsGeneratingFidelity(false)
  }

  const handleFidelityDownload = async () => {
    if (isGeneratingSemantic || isGeneratingFidelity) return
    setFidelityError('')
    if (fidelityVariant?.downloadUrl && hasUsableExpiry(fidelityVariant.expiresAt)) {
      try {
        await downloadResolvedFile(
          resolveBackendDownloadUrl(fidelityVariant.downloadUrl),
          fidelityVariant.filename || 'presentation.pptx',
        )
        return
      } catch {
        setVariantDownloads(current => ({
          ...current,
          fidelity: null,
          activeMode: current.activeMode === 'fidelity' ? null : current.activeMode,
        }))
      }
    }
    const status = await checkEnvStatus()
    if (!status?.chromium_installed) {
      setInstallError('')
      setShowInstallDialog(true)
      return
    }
    await generateAndDownloadFidelity()
  }

  const handleInstallAndContinue = async () => {
    setInstallError('')
    setIsInstalling(true)
    const { error } = await installScraperEngine()
    if (error) {
      setInstallError(error)
      setIsInstalling(false)
      return
    }
    const status = await checkEnvStatus()
    if (!status?.chromium_installed) {
      setInstallError(
        t(
          'messageBubble.ppt.installCompletedButUnavailable',
          'Chromium installation appears incomplete. Please try again.',
        ),
      )
      setIsInstalling(false)
      return
    }
    setIsInstalling(false)
    setShowInstallDialog(false)
    await generateAndDownloadFidelity()
  }

  return (
    <div className="mb-4">
      {payload?.previewHtml ? (
        <HtmlWidgetCard
          widgetKey={`${displayTitle}-preview`}
          widget={{
            title: previewTitle,
            html: payload.previewHtml,
            height: previewHeight,
          }}
          displayTitle={previewTitle}
          t={t}
        />
      ) : null}

      <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-sm text-zinc-800 shadow-sm dark:border-white/10 dark:bg-black/15 dark:text-zinc-200 dark:shadow-none">
        <div className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {payload.title || displayTitle || t('tools.pptGenerator', 'PPT Generator')}
        </div>
        <div className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          {payload.filename}
          {payload.slideCount > 0
            ? ` · ${t('messageBubble.ppt.slideCount', {
                count: payload.slideCount,
                defaultValue: '{{count}} slides',
              })}`
            : ''}
          {payload.renderModeUsed
            ? ` · ${t(`messageBubble.ppt.renderModes.${payload.renderModeUsed}`, payload.renderModeUsed)}`
            : ''}
        </div>

        {(semanticError || fidelityError || installError) && (
          <div className="mb-3 rounded-xl border border-red-300/70 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-400/25 dark:bg-red-500/8 dark:text-red-100">
            {semanticError || fidelityError || installError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSemanticDownload}
            disabled={(!payload?.downloadUrl && !requestPayload) || isGeneratingSemantic || isGeneratingFidelity}
            className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-black/4 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/7 dark:border-white/15 dark:bg-white/8 dark:text-zinc-100 dark:hover:bg-white/14"
          >
            {isGeneratingSemantic ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {t('messageBubble.ppt.downloadSemantic', 'Download semantic PPT')}
          </button>

          <button
            type="button"
            onClick={handleFidelityDownload}
            disabled={!requestPayload || isGeneratingFidelity}
            className="inline-flex items-center gap-2 rounded-full border border-primary-400/45 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary-400/20 dark:bg-primary-500/10 dark:text-primary-100 dark:hover:bg-primary-500/16"
          >
            {isGeneratingFidelity ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {t('messageBubble.ppt.downloadFidelity', 'Download high-fidelity PPT')}
          </button>
        </div>
      </div>

      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent className="h-[calc(100vh-16px)] max-h-[calc(100vh-16px)] w-[calc(100vw-16px)] max-w-[760px] overflow-hidden border-black/12 bg-white p-0 sm:h-auto sm:max-h-[88vh] sm:w-[calc(100vw-48px)] sm:max-w-[760px] dark:border-white/10 dark:bg-[#111217]">
          <DialogHeader className="border-b border-black/10 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5 dark:border-white/8">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/50 bg-amber-100/75 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-left text-lg font-semibold text-zinc-900 sm:text-xl dark:text-white">
                  {t(
                    'messageBubble.ppt.installDialogTitle',
                    'Install Chromium for high-fidelity export',
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1 text-left text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {t(
                    'messageBubble.ppt.installDialogBody',
                    'High-fidelity PPT export requires Playwright Chromium. Semantic download is already available, but if you want the closer HTML-to-PPT version, install Chromium and continue.',
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <div className="rounded-3xl border border-amber-300/50 bg-linear-to-br from-amber-100/80 via-amber-50/40 to-transparent p-4 sm:p-5 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-amber-500/6">
              <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {hasPlaywrightMissing
                  ? t(
                      'messageBubble.ppt.chromiumMissingTitle',
                      'High-fidelity export is unavailable on this machine.',
                    )
                  : t(
                      'messageBubble.ppt.semanticFallbackTitle',
                      'This file was generated with semantic fallback.',
                    )}
              </div>
              <div className="mt-2 text-sm leading-6 text-amber-800/95 dark:text-amber-50/90">
                {hasPlaywrightMissing
                  ? t(
                      'messageBubble.ppt.chromiumMissingBody',
                      'Install Playwright Chromium when you need the high-fidelity version. Semantic download remains available now.',
                    )
                  : t(
                      'messageBubble.ppt.semanticFallbackBody',
                      'The current PPT is usable, but styling may differ from the original HTML.',
                    )}
              </div>
            </div>

            {installError ? (
              <div className="mt-4 rounded-2xl border border-red-300/70 bg-red-50 px-3 py-3 text-[12px] leading-6 text-red-700 dark:border-red-400/25 dark:bg-red-500/8 dark:text-red-100">
                {installError}
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-t border-black/10 px-5 py-4 sm:px-6 dark:border-white/8">
            <button
              type="button"
              onClick={() => setShowInstallDialog(false)}
              className="inline-flex items-center justify-center rounded-full border border-black/15 bg-black/4 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/8 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={handleInstallAndContinue}
              disabled={isInstalling}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-primary-400/45 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary-400/20 dark:bg-primary-500/12 dark:text-primary-100 dark:hover:bg-primary-500/18"
            >
              {isInstalling ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {t('messageBubble.ppt.installAndContinue', 'Install and continue')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
