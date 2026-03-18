import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Expand, X } from 'lucide-react'

const buildWidgetSrcDoc = (widget, fallbackTitle) => {
  const title = widget?.title || fallbackTitle || 'Widget'
  const bodyHtml = widget?.html || ''
  const escapedTitle = String(title)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; padding: 0; background: #0f1115; color: #e6e8ef; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { padding: 10px; box-sizing: border-box; }
    * { box-sizing: border-box; max-width: 100%; }
    img, video, canvas, svg { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid rgba(255,255,255,.12); padding: 8px 10px; text-align: left; }
    th { background: rgba(255,255,255,.06); }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`
}

const HtmlWidgetCard = ({ widgetKey, widget, displayTitle, t }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (!isModalOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const onEsc = event => {
      if (event.key === 'Escape') setIsModalOpen(false)
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onEsc)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onEsc)
    }
  }, [isModalOpen])

  const srcDoc = useMemo(() => buildWidgetSrcDoc(widget, displayTitle), [widget, displayTitle])

  return (
    <>
      <div
        key={widgetKey}
        className="mb-4 overflow-hidden rounded-lg border border-white/10 bg-black/15 opacity-100 transition-all duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
          <div className="truncate text-sm font-semibold text-zinc-200">{displayTitle}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-white/14"
              title={t('messageBubble.openHtmlWidgetModal', 'Open full view')}
            >
              <Expand size={12} />
              <span>{t('messageBubble.open', 'Open')}</span>
            </button>
            <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              HTML
            </span>
          </div>
        </div>
        <iframe
          title={displayTitle}
          srcDoc={srcDoc}
          sandbox=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="no-scrollbar! w-full border-0"
          style={{ height: `${widget.height}px` }}
        />
      </div>

      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-10002 flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-6">
            <button
              type="button"
              aria-label={t('common.close', 'Close')}
              className="absolute inset-0"
              onClick={() => setIsModalOpen(false)}
            />
            <div className="relative flex h-screen w-screen max-w-none flex-col overflow-hidden rounded-none border-0 bg-[#121317] shadow-2xl sm:h-[92vh] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-white/12">
              <div
                className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5"
                style={{
                  paddingTop: 'max(12px, env(safe-area-inset-top))',
                }}
              >
                <div className="truncate pr-4 text-base font-semibold text-white">{displayTitle}</div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-zinc-300 transition-colors hover:bg-white/14 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <iframe
                title={`${displayTitle}-modal`}
                srcDoc={srcDoc}
                sandbox=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full border-0 bg-[#0f1115]"
                style={{
                  paddingBottom: 'env(safe-area-inset-bottom)',
                }}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export default HtmlWidgetCard
