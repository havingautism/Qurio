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

    // REPLICATE MERGE LOGIC FROM MessageBubble.jsx
    // Recursively merge all form submission chains
    let currentIndex = targetIndex
    // We keep the original content separate so forms can be rendered in between
    let subsequentContent = ''
    // Clone properties to avoid mutation
    let toolCallHistory = (targetMsg.toolCallHistory || targetMsg.tool_call_history || []).map(
      tc => ({ ...tc }),
    )
    let sources = [...(targetMsg.sources || [])]
    let allSubmittedValues = {}
    let hasAnySubmission = false

    // Keep scanning forward for [Form Submission] → AI pairs
    while (true) {
      const nextUserMsg = messages[currentIndex + 1]
      const nextAiMsg = messages[currentIndex + 2]

      // Check if we have a submission
      if (
        nextUserMsg &&
        nextUserMsg.role === 'user' &&
        typeof nextUserMsg.content === 'string' &&
        nextUserMsg.content.startsWith('[Form Submission]')
      ) {
        // Parse values
        let submissionValues = {}
        try {
          const lines = nextUserMsg.content.split('\n')
          lines.forEach(line => {
            const colonIndex = line.indexOf(':')
            if (colonIndex !== -1) {
              const key = line.slice(0, colonIndex).trim()
              const val = line.slice(colonIndex + 1).trim()
              if (key && val) {
                submissionValues[key] = val
              }
            }
          })
          allSubmittedValues = { ...allSubmittedValues, ...submissionValues }
          hasAnySubmission = true
        } catch (e) {
          console.error('Error parsing submission', e)
        }

        // Mark the last form in toolCallHistory as submitted
        const lastFormIndex = toolCallHistory.findLastIndex(t => t.name === 'interactive_form')
        if (lastFormIndex !== -1) {
          toolCallHistory[lastFormIndex]._isSubmitted = true
        }

        // If generic AI response follows, merge it
        if (nextAiMsg && nextAiMsg.role === 'ai') {
          // Accumulate content separately
          subsequentContent += (subsequentContent ? '\n\n' : '') + (nextAiMsg.content || '')

          // Merge tools
          if (nextAiMsg.toolCallHistory || nextAiMsg.tool_call_history) {
            const nextTools = (nextAiMsg.toolCallHistory || nextAiMsg.tool_call_history).map(
              tc => ({
                ...tc,
              }),
            )
            toolCallHistory = [...toolCallHistory, ...nextTools]
          }

          // Merge sources
          if (nextAiMsg.sources) {
            sources = [...sources, ...nextAiMsg.sources]
          }

          currentIndex += 2 // Skip the user msg and ai msg
        } else {
          currentIndex += 1 // Only skip the user msg
        }
      } else {
        break // No more submission chains
      }
    }

    if (hasAnySubmission) {
      return {
        ...targetMsg,
        _subsequentContent: subsequentContent, // Pass separated content
        toolCallHistory,
        _formSubmittedValues: allSubmittedValues,
        sources,
        _formSubmitted: true,
      }
    }

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
