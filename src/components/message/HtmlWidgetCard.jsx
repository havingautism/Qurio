import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Expand, X } from 'lucide-react'

const buildWidgetSrcDoc = (widget, fallbackTitle, isDarkMode) => {
  const title = widget?.title || fallbackTitle || 'Widget'
  const bodyHtml = widget?.html || ''
  const escapedTitle = String(title)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  const themeClass = isDarkMode ? 'qurio-widget-dark' : 'qurio-widget-light'

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <style>
    :root { color-scheme: ${isDarkMode ? 'dark' : 'light'}; }
    html, body { margin: 0; padding: 0; background: ${isDarkMode ? '#0f1115' : '#f7f9fc'}; color: ${isDarkMode ? '#e6e8ef' : '#1f2937'}; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { padding: 10px; box-sizing: border-box; }
    * { box-sizing: border-box; max-width: 100%; }
    img, video, canvas, svg { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid ${isDarkMode ? 'rgba(255,255,255,.12)' : 'rgba(17,24,39,.15)'}; padding: 8px 10px; text-align: left; }
    th { background: ${isDarkMode ? 'rgba(255,255,255,.06)' : 'rgba(17,24,39,.06)'}; }
    a { color: ${isDarkMode ? '#93c5fd' : '#1d4ed8'}; }
    .${themeClass} .qurio-ppt-root { color: ${isDarkMode ? '#eaf0ff' : '#1f2937'} !important; }
    .${themeClass} .qurio-ppt-btn {
      border-color: ${isDarkMode ? '#334155' : '#cbd5e1'} !important;
      background: ${isDarkMode ? '#111827' : '#f8fafc'} !important;
      color: ${isDarkMode ? '#dbe7ff' : '#334155'} !important;
    }
    .${themeClass} .qurio-ppt-dot {
      border-color: ${isDarkMode ? '#334155' : '#cbd5e1'} !important;
      background: ${isDarkMode ? '#111827' : '#f8fafc'} !important;
      color: ${isDarkMode ? '#dbe7ff' : '#334155'} !important;
    }
    .${themeClass} .qurio-ppt-dot.active {
      border-color: ${isDarkMode ? '#7aa2ff' : '#5b79b6'} !important;
      background: ${isDarkMode ? '#1e293b' : '#eaf1ff'} !important;
      color: ${isDarkMode ? '#ffffff' : '#1e3a8a'} !important;
    }
    .${themeClass} .qurio-ppt-frame {
      border-color: ${isDarkMode ? '#2a3140' : '#d7dee8'} !important;
      background: ${isDarkMode ? '#0b0f17' : '#f8fafc'} !important;
    }
  </style>
</head>
<body class="${themeClass}">${bodyHtml}</body>
</html>`
}

const HtmlWidgetCard = ({ widgetKey, widget, displayTitle, t }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false,
  )

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

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = document.documentElement
    const update = () => setIsDarkMode(root.classList.contains('dark'))
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const srcDoc = useMemo(
    () => buildWidgetSrcDoc(widget, displayTitle, isDarkMode),
    [widget, displayTitle, isDarkMode],
  )

  return (
    <>
      <div
        key={widgetKey}
        className="mb-4 overflow-hidden rounded-xl border border-black/12 bg-white opacity-100 shadow-sm transition-all duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)] dark:border-white/10 dark:bg-black/15 dark:shadow-none"
      >
        <div className="flex items-center justify-between border-b border-black/10 px-3 py-2 dark:border-white/8">
          <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {displayTitle}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-black/12 bg-black/4 px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-zinc-200 dark:hover:bg-white/14"
              title={t('messageBubble.openHtmlWidgetModal', 'Open full view')}
            >
              <Expand size={12} />
              <span>{t('messageBubble.open', 'Open')}</span>
            </button>
            <span className="rounded-full border border-black/12 bg-black/4 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-white/10 dark:bg-white/6 dark:text-zinc-400">
              HTML
            </span>
          </div>
        </div>
        <iframe
          title={displayTitle}
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          loading="lazy"
          referrerPolicy="no-referrer"
          className="no-scrollbar! w-full border-0"
          style={{ height: `${widget.height}px` }}
        />
      </div>

      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-10002 flex items-center justify-center bg-black/35 p-0 backdrop-blur-md dark:bg-black/60 sm:p-6">
            <button
              type="button"
              aria-label={t('common.close', 'Close')}
              className="absolute inset-0"
              onClick={() => setIsModalOpen(false)}
            />
            <div className="relative flex h-screen w-screen max-w-none flex-col overflow-hidden rounded-none border-0 bg-[#f7f9fc] shadow-2xl sm:h-[92vh] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-black/10 dark:bg-[#121317] dark:sm:border-white/12">
              <div
                className="flex items-center justify-between border-b border-black/10 px-4 py-3 sm:px-5 dark:border-white/10"
                style={{
                  paddingTop: 'max(12px, env(safe-area-inset-top))',
                }}
              >
                <div className="truncate pr-4 text-base font-semibold text-zinc-900 dark:text-white">
                  {displayTitle}
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/12 bg-black/4 text-zinc-600 transition-colors hover:bg-black/8 hover:text-zinc-900 dark:border-white/12 dark:bg-white/8 dark:text-zinc-300 dark:hover:bg-white/14 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <iframe
                title={`${displayTitle}-modal`}
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full border-0 bg-[#f7f9fc] dark:bg-[#0f1115]"
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
