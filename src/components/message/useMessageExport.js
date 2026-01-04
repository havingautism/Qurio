import { useCallback } from 'react'

const safeString = value => (value == null ? '' : String(value))

export const useMessageExport = ({
  message,
  planMarkdown,
  thoughtContent,
  mainContentRef,
  researchExportRef,
  thoughtExportRef,
  conversationTitle,
  t,
}) => {
  const escapeHtml = useCallback(
    value =>
      safeString(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    [],
  )

  const getExportSectionHtml = useCallback(
    (label, html) => {
      if (!html) return ''
      return `<h2>${escapeHtml(label)}</h2>${html}`
    },
    [escapeHtml],
  )

  const getExportBaseName = useCallback(() => {
    const rawTitle = conversationTitle || t('messageBubble.researchReportTitle')
    return safeString(rawTitle || 'deep-research-report')
      .replace(/[\\/:*?"<>|]+/g, '')
      .trim()
  }, [conversationTitle, t])

  const shouldExportOnlyAnswer = useCallback(() => {
    if (message?.deepResearch) return true
    if (message?.agent_name === 'Deep Research Agent' || message?.agentName === 'Deep Research Agent')
      return true
    if (message?.researchPlan) return true
    if (typeof message?.thinking_process !== 'string') return false
    const raw = message.thinking_process.trim()
    if (!raw || raw[0] !== '{' || raw[raw.length - 1] !== '}') return false
    try {
      const parsed = JSON.parse(raw)
      return Boolean(parsed?.plan)
    } catch {
      return false
    }
  }, [message])

  const buildExportHtml = useCallback(() => {
    const planHtml = planMarkdown ? researchExportRef.current?.innerHTML?.trim() || '' : ''
    const thoughtHtml = thoughtContent ? thoughtExportRef.current?.innerHTML?.trim() || '' : ''
    const hasAnswer = Boolean(mainContentRef.current?.innerText?.trim())
    const answerHtml = hasAnswer ? mainContentRef.current?.innerHTML?.trim() || '' : ''
    if (shouldExportOnlyAnswer()) {
      return answerHtml || ''
    }
    const sections = [
      getExportSectionHtml(t('messageBubble.researchProcess'), planHtml),
      getExportSectionHtml(t('messageBubble.thinkingProcess'), thoughtHtml),
      getExportSectionHtml(t('messageBubble.answer'), answerHtml),
    ].filter(Boolean)
    return sections.join('<hr />')
  }, [
    planMarkdown,
    thoughtContent,
    mainContentRef,
    researchExportRef,
    thoughtExportRef,
    shouldExportOnlyAnswer,
    getExportSectionHtml,
    t,
  ])

  const handleDownloadWord = useCallback(() => {
    const exportHtml = buildExportHtml()
    if (!exportHtml) return
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:24px;}h2{margin:20px 0 12px;}pre{white-space:pre-wrap;font-family:inherit;}</style></head><body>${exportHtml}</body></html>`
    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${getExportBaseName()}.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [buildExportHtml, getExportBaseName])

  const handleDownloadPdf = useCallback(() => {
    const exportHtml = buildExportHtml()
    if (!exportHtml) return
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      getExportBaseName(),
    )}</title><style>body{font-family:Arial,sans-serif;padding:24px;}h2{margin:20px 0 12px;}pre{white-space:pre-wrap;font-family:inherit;}</style></head><body>${exportHtml}</body></html>`
    const printWindow = window.open('', '_blank', 'width=900,height=650')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }, [buildExportHtml, escapeHtml, getExportBaseName])

  return { handleDownloadPdf, handleDownloadWord }
}
