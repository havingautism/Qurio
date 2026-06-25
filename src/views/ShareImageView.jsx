// Share image generation page — renders a single message as a styled share card, exports as PNG
// Route: /share — accessed from share button in ChatInterface
// Reads messageId/messageIndex from URL search params, NOT from route params
// Uses html2canvas to screenshot the ShareCanvas component at 2x scale
// Temporarily disables external stylesheets during capture to avoid CSS interference
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import html2canvas from 'html2canvas'
import { ArrowLeft, Download } from 'lucide-react'
import useChatStore from '../lib/chatStore'
import ShareCanvas, { SHARE_STYLE } from '../components/ShareCanvas'

const ShareImageView = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const captureRef = useRef(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const { messages, conversationTitle } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
      conversationTitle: state.conversationTitle,
    })),
  )

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const messageId = searchParams.get('messageId')
  const messageIndexParam = searchParams.get('messageIndex')
  const messageIndex = Number.isFinite(Number(messageIndexParam)) ? Number(messageIndexParam) : null

  const message = useMemo(() => {
    let targetMsg = null
    let targetIndex = -1

    if (messageId) {
      targetIndex = messages.findIndex(m => String(m.id || '') === String(messageId))
      if (targetIndex !== -1) targetMsg = messages[targetIndex]
    } else if (messageIndex !== null && messages[messageIndex]) {
      targetIndex = messageIndex
      targetMsg = messages[messageIndex]
    }

    if (!targetMsg) return null

    if (targetIndex === -1 && targetMsg) {
      targetIndex = messages.indexOf(targetMsg)
    }

    if (!targetMsg || targetIndex === -1) return null

    // No more merging hacks!
    return targetMsg
  }, [messages, messageId, messageIndex])

  const disableExternalStyles = () => {
    const nodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    const toggled = []
    nodes.forEach(node => {
      if (node.dataset?.shareStyle === 'true') return
      const wasDisabled = node.disabled
      if (!wasDisabled) {
        node.disabled = true
        toggled.push(node)
      }
    })
    return () => {
      toggled.forEach(node => {
        node.disabled = false
      })
    }
  }

  const handleDownload = async () => {
    if (!captureRef.current) return
    setError('')
    setIsGenerating(true)
    const restoreStyles = disableExternalStyles()
    try {
      // Ensure element is scrolled to top
      const element = captureRef.current
      element.scrollTop = 0

      // Wait for any pending renders
      await new Promise(resolve => setTimeout(resolve, 100))

      // Calculate actual height
      const actualHeight = element.scrollHeight

      const canvas = await html2canvas(element, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#0f131c',
        windowHeight: actualHeight,
        height: actualHeight,
        logging: false,
      })
      const image = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = image
      link.download = `qurio-share-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to generate image:', err)
      setError(t('views.shareImageView.failedToGenerate'))
    } finally {
      restoreStyles()
      setIsGenerating(false)
    }
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back()
    } else {
      navigate({ to: '/new_chat' })
    }
  }

  return (
    <div className="share-page">
      <style data-share-style="true">{SHARE_STYLE}</style>
      <div className="share-toolbar">
        <button className="share-btn" onClick={handleBack}>
          <ArrowLeft size={16} />
          {t('views.shareImageView.back')}
        </button>
        {message && (
          <div className="share-actions">
            <button className="share-btn primary" onClick={handleDownload} disabled={isGenerating}>
              <Download size={16} />
              {isGenerating
                ? t('views.shareImageView.generating')
                : t('views.shareImageView.downloadPng')}
            </button>
          </div>
        )}
      </div>
      {message ? (
        <ShareCanvas
          captureRef={captureRef}
          message={message}
          conversationTitle={conversationTitle || t('views.shareImageView.defaultTitle')}
          embed={false}
          language={i18n.language}
        />
      ) : (
        <div className="share-canvas-wrap">
          <div className="share-canvas">
            <div className="share-title">{t('views.shareImageView.messageNotFound')}</div>
            <p>{t('views.shareImageView.returnToChat')}</p>
          </div>
        </div>
      )}
      {error && (
        <div style={{ padding: '0 24px 24px', color: '#fca5a5', textAlign: 'center' }}>{error}</div>
      )}
    </div>
  )
}

export default ShareImageView
