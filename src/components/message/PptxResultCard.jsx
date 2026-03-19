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

  const rawQaIssues = Array.isArray(payload?.qaIssuesRaw) ? payload.qaIssuesRaw : []
  const requestPayload = useMemo(() => parseToolArguments(item?.arguments), [item?.arguments])
  const previewTitle = `${payload?.title || displayTitle} ${t('messageBubble.ppt.previewSuffix', 'Preview')}`
  const hasPlaywrightMissing = hasIssuePrefix(rawQaIssues, 'fidelity_unavailable_playwright_missing:')
  const hasFidelityFallback =
    hasIssue(rawQaIssues, 'fidelity_requested_but_fallback_to_semantic') ||
    hasIssue(rawQaIssues, 'fidelity_auto_fallback_to_semantic')

  useEffect(() => {
    setVariantDownloads(buildVariantDownloadsFromPayload(payload))
  }, [payload])

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
            height: payload.previewHeight,
          }}
          displayTitle={previewTitle}
          t={t}
        />
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-zinc-200">
        <div className="mb-1 text-sm font-semibold">
          {payload.title || displayTitle || t('tools.pptGenerator', 'PPT Generator')}
        </div>
        <div className="mb-3 text-xs text-zinc-400">
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
          <div className="mb-3 rounded-xl border border-red-400/25 bg-red-500/8 px-3 py-2 text-[11px] text-red-100">
            {semanticError || fidelityError || installError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSemanticDownload}
            disabled={(!payload?.downloadUrl && !requestPayload) || isGeneratingSemantic || isGeneratingFidelity}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/14"
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
            className="inline-flex items-center gap-2 rounded-full border border-primary-400/20 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-100 transition-colors hover:bg-primary-500/16 disabled:cursor-not-allowed disabled:opacity-60"
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
        <DialogContent className="h-[calc(100vh-16px)] max-h-[calc(100vh-16px)] w-[calc(100vw-16px)] max-w-[760px] overflow-hidden border-white/10 bg-[#111217] p-0 sm:h-auto sm:max-h-[88vh] sm:w-[calc(100vw-48px)] sm:max-w-[760px]">
          <DialogHeader className="border-b border-white/8 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-300">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-left text-lg font-semibold text-white sm:text-xl">
                  {t(
                    'messageBubble.ppt.installDialogTitle',
                    'Install Chromium for high-fidelity export',
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1 text-left text-sm leading-6 text-zinc-400">
                  {t(
                    'messageBubble.ppt.installDialogBody',
                    'High-fidelity PPT export requires Playwright Chromium. Semantic download is already available, but if you want the closer HTML-to-PPT version, install Chromium and continue.',
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <div className="rounded-3xl border border-amber-400/20 bg-linear-to-br from-amber-500/10 via-amber-500/6 to-transparent p-4 sm:p-5">
              <div className="text-sm font-medium text-amber-100">
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
              <div className="mt-2 text-sm leading-6 text-amber-50/90">
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
              <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/8 px-3 py-3 text-[12px] leading-6 text-red-100">
                {installError}
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-t border-white/8 px-5 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setShowInstallDialog(false)}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={handleInstallAndContinue}
              disabled={isInstalling}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-primary-400/20 bg-primary-500/12 px-4 py-2 text-sm font-medium text-primary-100 transition-colors hover:bg-primary-500/18 disabled:cursor-not-allowed disabled:opacity-60"
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
