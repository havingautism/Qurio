import { useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import html2canvas from 'html2canvas'
import { ArrowLeft, Download } from 'lucide-react'
import useChatStore from '../lib/chatStore'
import ShareCanvas, { SHARE_STYLE } from '../components/ShareCanvas'

const ShareImageView = () => {
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
    if (messageId) {
      return messages.find(m => String(m.id || '') === String(messageId))
    }
    if (messageIndex !== null && messages[messageIndex]) {
      return messages[messageIndex]
    }
    return null
  }, [messages, messageId, messageIndex])

  const disableExternalStyles = () => {
    const nodes = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]'),
    )
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
      const canvas = await html2canvas(captureRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#0f131c',
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
      setError('Failed to generate image. Please try again.')
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
          Back
        </button>
        {message && (
          <div className="share-actions">
            <button className="share-btn primary" onClick={handleDownload} disabled={isGenerating}>
              <Download size={16} />
              {isGenerating ? 'Generating...' : 'Download PNG'}
            </button>
          </div>
        )}
      </div>
      {message ? (
        <ShareCanvas
          captureRef={captureRef}
          message={message}
          conversationTitle={conversationTitle || 'Qurio Chat'}
          embed={false}
        />
      ) : (
        <div className="share-canvas-wrap">
          <div className="share-canvas">
            <div className="share-title">Message not found</div>
            <p>Return to the chat and try sharing again.</p>
          </div>
        </div>
      )}
      {error && (
        <div style={{ padding: '0 24px 24px', color: '#fca5a5', textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  )
}

export default ShareImageView
