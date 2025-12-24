import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
const ShareModal = ({ isOpen, onClose, message, conversationTitle }) => {
  const captureRef = useRef(null)
  const [copySuccess, setCopySuccess] = useState(false)

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
      const canvas = await html2canvas(captureRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#0f131c',
        onclone: clonedDoc => {
          clonedDoc
            .querySelectorAll('style, link[rel="stylesheet"]')
            .forEach(node => {
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Share Preview</h2>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#09090b] flex flex-col items-center justify-center min-h-[260px]">
          {message ? (
            <div className="relative shadow-2xl rounded-xl overflow-hidden border border-zinc-800 w-full">
              <ShareCanvas
                captureRef={captureRef}
                message={message}
                conversationTitle={conversationTitle || 'Qurio Chat'}
                embed
              />
            </div>
          ) : (
            <div className="text-zinc-500">Message not found.</div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-zinc-800 bg-[#18181b]">
          {/* Primary Action */}
          <div className="mb-4 sm:mb-6">
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-colors"
            >
              <Download size={20} />
              Download Image
            </button>
          </div>

          {/* Social Actions (Placeholders) */}
          <div className="flex justify-center gap-6 sm:gap-8 px-2 sm:px-4">
            <ShareAction
              icon={<Copy size={20} />}
              label={copySuccess ? 'Copied!' : 'Copy Link'}
              onClick={handleCopy}
              active={copySuccess}
            />
            <ShareAction
              icon={<Twitter size={20} />}
              label="X (Twitter)"
              onClick={() => handleSocialShare('twitter')}
            />
            <ShareAction
              icon={<Linkedin size={20} />}
              label="LinkedIn"
              onClick={() => handleSocialShare('linkedin')}
            />
            <ShareAction
              icon={<div className="font-bold text-lg leading-none">R</div>}
              label="Reddit"
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
    className={`flex flex-col items-center gap-2 group ${active ? 'text-green-500' : 'text-zinc-400 hover:text-white'}`}
  >
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800 transition-all ${active ? 'bg-green-500/10' : 'group-hover:bg-zinc-700'}`}
    >
      {icon}
    </div>
    <span className="text-xs font-medium">{label}</span>
  </button>
)

export default ShareModal
