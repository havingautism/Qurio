import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import html2canvas from 'html2canvas'
import { X, Download, Copy, Linkedin, Twitter } from 'lucide-react'
import ShareCanvas from './ShareCanvas'

/**
 * ShareModal component to preview and download the share image in a compact modal.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 * @param {Object} props.message - Message data to render
 * @param {string} props.conversationTitle - Conversation title
 */
import useChatStore from '../lib/chatStore'
import { useShallow } from 'zustand/react/shallow'

const ShareModal = ({ isOpen, onClose, message, conversationTitle }) => {
  const { t, i18n } = useTranslation()
  const captureRef = useRef(null)
  const [copySuccess, setCopySuccess] = useState(false)

  // Get all messages to handle recursive merging
  const { messages } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
    })),
  )

  // Memoize the merged message logic
  const mergedMessage = React.useMemo(() => {
    if (!message) return null

    // Find index in the full list
    const targetIndex = messages.findIndex(m => m.id === message.id)
    if (targetIndex === -1) return message

    // REPLICATE MERGE LOGIC from ShareImageView/MessageBubble
    let currentIndex = targetIndex
    let subsequentContent = ''
    let toolCallHistory = (message.toolCallHistory || message.tool_call_history || []).map(tc => ({
      ...tc,
    }))
    let sources = [...(message.sources || [])]
    let allSubmittedValues = {}
    let hasAnySubmission = false

    // Keep scanning forward
    while (true) {
      const nextUserMsg = messages[currentIndex + 1]
      const nextAiMsg = messages[currentIndex + 2]

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

        // Mark submitted
        const lastFormIndex = toolCallHistory.findLastIndex(t => t.name === 'interactive_form')
        if (lastFormIndex !== -1) {
          toolCallHistory[lastFormIndex]._isSubmitted = true
        }

        // If generic AI response follows
        if (nextAiMsg && nextAiMsg.role === 'ai') {
          subsequentContent += (subsequentContent ? '\n\n' : '') + (nextAiMsg.content || '')

          if (nextAiMsg.toolCallHistory || nextAiMsg.tool_call_history) {
            const nextTools = (nextAiMsg.toolCallHistory || nextAiMsg.tool_call_history).map(
              tc => ({ ...tc }),
            )
            toolCallHistory = [...toolCallHistory, ...nextTools]
          }
          if (nextAiMsg.sources) {
            sources = [...sources, ...nextAiMsg.sources]
          }

          currentIndex += 2
        } else {
          currentIndex += 1
        }
      } else {
        break
      }
    }

    if (hasAnySubmission) {
      return {
        ...message,
        _subsequentContent: subsequentContent,
        toolCallHistory,
        _formSubmittedValues: allSubmittedValues,
        sources,
        _formSubmitted: true,
      }
    }

    return message
  }, [message, messages])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = event => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const handleDownload = async () => {
    if (!captureRef.current) return
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
        onclone: clonedDoc => {
          clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
            if (node.dataset?.shareStyle === 'true') return
            node.parentNode?.removeChild(node)
          })
        },
        logging: false,
      })
      const image = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = image
      link.download = `qurio-share-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Failed to generate image:', error)
    }
  }

  const handleCopy = async () => {
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  const handleSocialShare = platform => {
    console.log(`Sharing to ${platform} is coming soon!`)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="animate-in fade-in fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm duration-200">
      <div className="animate-in zoom-in-95 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#18181b] shadow-2xl duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white sm:text-xl">{t('shareModal.title')}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center overflow-y-auto bg-[#09090b] p-4 sm:p-6">
          {mergedMessage ? (
            <div className="relative w-full overflow-hidden rounded-xl border border-zinc-800 shadow-2xl">
              <ShareCanvas
                captureRef={captureRef}
                message={mergedMessage}
                conversationTitle={conversationTitle || 'Qurio Chat'}
                embed
                language={i18n.language}
              />
            </div>
          ) : (
            <div className="text-zinc-500">{t('shareModal.messageNotFound')}</div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-zinc-800 bg-[#18181b] p-4 sm:p-6">
          {/* Primary Action */}
          <div className="mb-4 sm:mb-6">
            <button
              onClick={handleDownload}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-500"
            >
              <Download size={20} />
              {t('shareModal.downloadImage')}
            </button>
          </div>

          {/* Social Actions (Placeholders) */}
          <div className="flex justify-center gap-6 px-2 sm:gap-8 sm:px-4">
            <ShareAction
              icon={<Copy size={20} />}
              label={copySuccess ? t('shareModal.copied') : t('shareModal.copyLink')}
              onClick={handleCopy}
              active={copySuccess}
            />
            <ShareAction
              icon={<Twitter size={20} />}
              label={t('shareModal.twitter')}
              onClick={() => handleSocialShare('twitter')}
            />
            <ShareAction
              icon={<Linkedin size={20} />}
              label={t('shareModal.linkedin')}
              onClick={() => handleSocialShare('linkedin')}
            />
            <ShareAction
              icon={<div className="text-lg leading-none font-bold">R</div>}
              label={t('shareModal.reddit')}
              onClick={() => handleSocialShare('reddit')}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const ShareAction = ({ icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    className={`group flex flex-col items-center gap-2 ${active ? 'text-green-500' : 'text-zinc-400 hover:text-white'}`}
  >
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 transition-all ${active ? 'bg-green-500/10' : 'group-hover:bg-zinc-700'}`}
    >
      {icon}
    </div>
    <span className="text-xs font-medium">{label}</span>
  </button>
)

export default ShareModal
