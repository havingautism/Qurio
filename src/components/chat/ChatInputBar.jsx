import clsx from 'clsx'
import {
  ArrowRight,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  FileText,
  Globe,
  Image,
  Paperclip,
  Plus,
  SlidersHorizontal,
  Smile,
  X,
  FileJson,
  FileSpreadsheet,
  FileCode,
  File,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAgentDisplayName } from '../../lib/agentDisplay'
import { providerSupportsSearch } from '../../lib/providers'
import { splitTextWithUrls } from '../../lib/urlHighlight'
import EmojiDisplay from '../EmojiDisplay'
import useIsMobile from '../../hooks/useIsMobile'
import MobileDrawer from '../MobileDrawer'

/**
 * ChatInputBar Component
 * Input bar for chat messages with support for attachments, search, thinking toggle, and agent selection.
 *
 * @param {Object} props
 * @param {boolean} props.isLoading - Whether a message is currently being sent
 * @param {string} props.apiProvider - The API provider name
 * @param {boolean} props.isSearchActive - Whether search is enabled
 * @param {boolean} props.isThinkingActive - Whether thinking mode is enabled
 * @param {boolean} props.isThinkingLocked - Whether thinking mode is locked (cannot be toggled)
 * @param {Array} props.agents - List of available agents
 * @param {boolean} props.agentsLoading - Whether agents are currently loading
 * @param {string} props.agentsLoadingLabel - Full label with animated dots to show while agents are loading
 * @param {string} props.agentsLoadingDots - Animated dots only for separate UI indicator
 * @param {Object} props.selectedAgent - Currently selected agent
 * @param {boolean} props.isAgentAutoMode - Whether agent auto mode is enabled
 * @param {Function} props.onAgentSelect - Callback when an agent is selected
 * @param {Function} props.onAgentAutoModeToggle - Callback when agent auto mode is toggled
 * @param {boolean} props.isAgentSelectorOpen - Whether agent selector dropdown is open
 * @param {Function} props.onAgentSelectorToggle - Callback to toggle agent selector
 * @param {Object} props.agentSelectorRef - Ref for agent selector dropdown
 * @param {Function} props.onToggleSearch - Callback to toggle search mode
 * @param {Function} props.onToggleThinking - Callback to toggle thinking mode
 * @param {string|null} props.quotedText - Currently quoted text (or null)
 * @param {Function} props.onQuoteClear - Callback to clear quoted text
 * @param {Function} props.onSend - Callback to send message (text, attachments) => void
 * @param {Object} props.editingSeed - Seed data for editing mode { text, attachments }
 * @param {Function} props.onEditingClear - Callback to clear editing mode
 * @param {boolean} props.showEditing - Whether editing mode is active
 * @param {string} props.editingLabel - Label for the message being edited
 * @param {Function} props.scrollToBottom - Callback to scroll to bottom (behavior) => void
 * @param {string|null} props.spacePrimaryAgentId - Primary agent ID for the current space
 * @param {string} props.variant - 'default' or 'capsule'
 */
const ChatInputBar = React.memo(
  ({
    isLoading,
    apiProvider,
    isSearchActive,
    isThinkingActive,
    isThinkingLocked,
    agents,
    agentsLoading,
    agentsLoadingLabel,
    agentsLoadingDots,
    selectedAgent,
    isAgentAutoMode,
    onAgentSelect,
    onAgentAutoModeToggle,
    isAgentSelectorOpen,
    onAgentSelectorToggle,
    agentSelectorRef,
    onToggleSearch,
    onToggleThinking,
    quotedText,
    onQuoteClear,
    onSend,
    editingSeed,
    onEditingClear,
    showEditing,
    editingLabel,
    scrollToBottom,
    spacePrimaryAgentId,
    documents = [],
    documentsLoading = false,
    selectedDocumentIds = [],
    onToggleDocument,
    variant = 'default',
  }) => {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const [inputValue, setInputValue] = useState('')
    const [attachments, setAttachments] = useState([])
    const textareaRef = useRef(null)
    const fileInputRef = useRef(null)
    const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false)
    const uploadMenuRef = useRef(null)

    // Capsule Variant State
    const [isCapsuleMenuOpen, setIsCapsuleMenuOpen] = useState(false)
    const capsuleMenuRef = useRef(null)
    const [isDocumentMenuOpen, setIsDocumentMenuOpen] = useState(false)
    const documentMenuRef = useRef(null)
    const [isMultiline, setIsMultiline] = useState(false)
    const highlightRef = useRef(null)
    const highlightedInputParts = useMemo(() => splitTextWithUrls(inputValue), [inputValue])
    const selectedDocumentIdSet = useMemo(
      () => new Set((selectedDocumentIds || []).map(id => String(id))),
      [selectedDocumentIds],
    )
    const selectedDocumentCount = selectedDocumentIdSet.size
    const selectedDocuments = useMemo(() => {
      if (!documents || documents.length === 0) return []
      return documents.filter(doc => selectedDocumentIdSet.has(String(doc.id)))
    }, [documents, selectedDocumentIdSet])
    const FileIcon = ({ fileType, className }) => {
      const type = (fileType || '').toLowerCase()
      if (type.includes('pdf')) return <FileText className={clsx('text-red-500', className)} />
      if (type.includes('doc') || type.includes('word'))
        return <FileText className={clsx('text-blue-500', className)} />
      if (type.includes('json')) return <FileJson className={clsx('text-yellow-500', className)} />
      if (type.includes('csv') || type.includes('excel') || type.includes('sheet'))
        return <FileSpreadsheet className={clsx('text-emerald-500', className)} />
      if (
        type.includes('md') ||
        type.includes('start') ||
        type.includes('code') ||
        type === 'js' ||
        type === 'py'
      )
        return <FileCode className={clsx('text-purple-500', className)} />
      return <File className={clsx('text-gray-400', className)} />
    }
    // Auto-resize and multiline detection
    useEffect(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      // Reset height to auto to get correct scrollHeight
      textarea.style.height = 'auto'
      const newHeight = textarea.scrollHeight

      // Enforce min-height and limit max-height
      textarea.style.height = `${Math.min(newHeight, 200)}px`

      // Detect multiline: if height significantly exceeds single line height (~48-50px)
      // or if there are explicit newlines
      const isMulti = newHeight > 52 || inputValue.includes('\n')

      if (inputValue === '') {
        setIsMultiline(false)
      } else if (isMulti) {
        setIsMultiline(true)
      }
      // If currently multiline and text is not empty, stay multiline.
    }, [inputValue])

    useEffect(() => {
      setInputValue(editingSeed?.text || '')
      setAttachments(editingSeed?.attachments || [])
      if (editingSeed?.text || (editingSeed?.attachments || []).length > 0) {
        window.requestAnimationFrame(() => textareaRef.current?.focus())
      }
    }, [editingSeed])

    React.useLayoutEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }, [inputValue, isMultiline])

    useEffect(() => {
      if (!isUploadMenuOpen || isMobile) return
      const handleClickOutside = event => {
        if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target)) {
          setIsUploadMenuOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isUploadMenuOpen, isMobile])

    // Click outside handler for Capsule Menu
    useEffect(() => {
      if (!isCapsuleMenuOpen || isMobile) return
      const handleClickOutside = event => {
        if (capsuleMenuRef.current && !capsuleMenuRef.current.contains(event.target)) {
          setIsCapsuleMenuOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isCapsuleMenuOpen, isMobile])

    const handleFileChange = async e => {
      const files = Array.from(e.target.files)
      if (files.length === 0) return

      // Use dynamic import to load compression utility
      const { compressImages } = await import('../../lib/imageCompression')

      // Filter only image files
      const imageFiles = files.filter(file => file.type.startsWith('image/'))
      if (imageFiles.length === 0) {
        e.target.value = ''
        return
      }

      try {
        // Compress images
        const results = await compressImages(imageFiles)

        // Process successful compressions
        const successfulUploads = results
          .filter(result => result.success)
          .map(result => ({
            type: 'image_url',
            image_url: { url: result.dataUrl },
            // Store metadata for debugging/display
            _meta: {
              originalSize: result.originalSize,
              compressedSize: result.compressedSize,
              dimensions: result.dimensions,
            },
          }))

        // Show errors for failed compressions
        const failedUploads = results.filter(result => !result.success)
        if (failedUploads.length > 0) {
          console.error('Image compression errors:', failedUploads)
          // You could show a toast notification here
          alert(
            `Failed to compress ${failedUploads.length} image(s):\n${failedUploads.map(f => `- ${f.fileName}: ${f.error}`).join('\n')}`,
          )
        }

        // Add successful uploads to attachments
        if (successfulUploads.length > 0) {
          setAttachments(prev => [...prev, ...successfulUploads])
        }
      } catch (error) {
        console.error('Image upload error:', error)
        alert(`Failed to upload images: ${error.message}`)
      }

      e.target.value = ''
    }

    const handleUploadImage = () => {
      fileInputRef.current?.click()
      setIsUploadMenuOpen(false)
    }

    const handleSend = () => {
      if (isLoading) return
      const text = inputValue
      const hasContent = text.trim() || attachments.length > 0
      if (!hasContent) return
      onSend(text, attachments)
      setInputValue('')
      setAttachments([])
      onEditingClear?.()
      scrollToBottom('auto')
    }

    const handleKeyDown = e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    }

    // === CAPSULE VARIANT ===
    if (variant === 'capsule') {
      const hasDocuments = documents && documents.length > 0

      const renderDocumentsList = () => (
        <div className="flex flex-col gap-0.5 max-h-[250px] overflow-y-auto no-scrollbar">
          {documentsLoading && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              {t('chatInterface.documentsLoading')}
            </div>
          )}
          {!documentsLoading && documents.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              {t('chatInterface.documentsEmpty')}
            </div>
          )}
          {!documentsLoading &&
            documents.map(doc => {
              const isSelected = selectedDocumentIdSet.has(String(doc.id))
              return (
                <button
                  key={doc.id}
                  onClick={() => onToggleDocument?.(doc.id)}
                  className={clsx(
                    'flex items-start gap-2.5 w-full px-3 py-2 rounded-xl text-sm transition-colors text-left',
                    isSelected
                      ? 'bg-gray-100 dark:bg-zinc-700/50 text-gray-900 dark:text-white font-medium'
                      : 'hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-600 dark:text-gray-300',
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 flex items-center justify-center w-4 h-4 rounded border transition-colors',
                      isSelected
                        ? 'bg-primary-500 border-primary-500 text-white'
                        : 'border-gray-300 dark:border-zinc-600 text-transparent',
                    )}
                  >
                    <Check size={12} />
                  </span>
                  <div className="flex items-center justify-between w-full min-w-0 gap-2">
                    <span className="truncate">{doc.name}</span>
                    <span className="text-[10px] text-gray-400 font-normal shrink-0">
                      {(() => {
                        const type = (doc.file_type || '').toUpperCase()
                        return type === 'MD' ? 'MARKDOWN' : type
                      })()}
                    </span>
                  </div>
                </button>
              )
            })}
        </div>
      )

      const renderDocumentsSection = () => (
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">
            {t('chatInterface.documents')} ({selectedDocumentCount})
          </div>
          {renderDocumentsList()}
        </div>
      )

      const uploadMenuButton = (
        <button
          onClick={handleUploadImage}
          className="flex items-center gap-1.5 w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm rounded-xl"
        >
          <Image size={16} /> {t('common.uploadImage')}
        </button>
      )

      const popoverSurfaceClass =
        'absolute bottom-full left-0 mb-3 bg-white/80 dark:bg-[#1C1C1E]/80 dark:bg-[#1a1a1a] bg-[#F9F9F9] dark:bg-[#1a1a1a] backdrop-blur-xl border border-gray-200/50 dark:border-zinc-700/50 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 p-3'

      const desktopUploadMenuContent = (
        <div className={clsx(popoverSurfaceClass, 'w-72')}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
            {t('common.upload')}
          </div>
          <div className="space-y-1">
            {uploadMenuButton}
            {hasDocuments && (
              <div className="border-t border-gray-200/70 dark:border-zinc-700/50 pt-3">
                {renderDocumentsSection()}
              </div>
            )}
          </div>
        </div>
      )

      const settingsMenuContent = (
        <div className="space-y-3">
          {/* Models List */}
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
              {t('chatInterface.agentsLabel')}
            </div>
            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto no-scrollbar">
              <button
                onClick={() => {
                  onAgentAutoModeToggle()
                  setIsCapsuleMenuOpen(false)
                }}
                className={clsx(
                  'flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm transition-colors',
                  isAgentAutoMode
                    ? 'bg-gray-100 dark:bg-zinc-700/50 text-gray-900 dark:text-white font-medium'
                    : 'hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-600 dark:text-gray-300',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🤖</span>
                  <span>{t('chatInterface.agentAuto')}</span>
                </div>
                {isAgentAutoMode && <Check size={14} className="text-primary-500" />}
              </button>
              {agents.map(agent => {
                const isSelected = !isAgentAutoMode && selectedAgent?.id === agent.id
                const isDefault =
                  agent.isDefault || String(agent.id) === String(spacePrimaryAgentId)
                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      onAgentSelect(agent)
                      setIsCapsuleMenuOpen(false)
                    }}
                    className={clsx(
                      'flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm transition-colors',
                      isSelected
                        ? 'bg-gray-100 dark:bg-zinc-700/50 text-gray-900 dark:text-white font-medium'
                        : 'hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-600 dark:text-gray-300',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <EmojiDisplay emoji={agent.emoji} size="1.1em" />
                      <span className="truncate">{getAgentDisplayName(agent, t)}</span>
                      {isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md font-medium">
                          {t('chatInterface.default')}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="text-primary-500" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="h-px bg-gray-100 dark:bg-zinc-700/50" />

          {/* Capabilities */}
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
              {t('chatInterface.capabilities')}
            </div>
            <div className="space-y-0.5">
              <button
                disabled={isThinkingLocked}
                onClick={onToggleThinking}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-200">
                  <Brain
                    size={16}
                    className={isThinkingActive ? 'text-primary-500' : 'text-gray-400'}
                  />
                  <span>{t('homeView.think')}</span>
                </div>
                <div
                  className={clsx(
                    'w-8 h-4 rounded-full relative transition-colors',
                    isThinkingActive ? 'bg-primary-500' : 'bg-gray-200 dark:bg-zinc-600',
                  )}
                >
                  <div
                    className={clsx(
                      'absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm',
                      isThinkingActive ? 'left-4.5' : 'left-0.5',
                    )}
                  />
                </div>
              </button>
              <button
                disabled={!providerSupportsSearch(apiProvider)}
                onClick={onToggleSearch}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-200">
                  <Globe
                    size={16}
                    className={isSearchActive ? 'text-primary-500' : 'text-gray-400'}
                  />
                  <span>{t('homeView.search')}</span>
                </div>
                <div
                  className={clsx(
                    'w-8 h-4 rounded-full relative transition-colors',
                    isSearchActive ? 'bg-primary-500' : 'bg-gray-200 dark:bg-zinc-600',
                  )}
                >
                  <div
                    className={clsx(
                      'absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm',
                      isSearchActive ? 'left-4.5' : 'left-0.5',
                    )}
                  />
                </div>
              </button>
            </div>
          </div>
        </div>
      )

      return (
        <div className="w-full max-w-3xl relative group pb-2 flex flex-col gap-2">
          {/* Floating Context Indicators */}
          {(showEditing ||
            quotedText ||
            attachments.length > 0 ||
            selectedDocuments.length > 0) && (
            <div className="flex flex-col gap-2">
              {/* Edited Message Indicator */}
              {showEditing && (
                <div className="flex items-center justify-between bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 shadow-sm animate-in slide-in-from-bottom-2">
                  <div className="flex flex-col overflow-hidden mr-2">
                    <span className="text-[10px] font-bold text-primary-500 uppercase tracking-wider">
                      Editing
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                      {editingLabel}
                    </span>
                  </div>
                  <button
                    onClick={onEditingClear}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {/* Quote Indicator */}
              {quotedText && (
                <div className="flex items-center justify-between bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 shadow-sm animate-in slide-in-from-bottom-2">
                  <div className="flex flex-col overflow-hidden mr-2">
                    <span className="text-[10px] font-bold text-primary-500 uppercase tracking-wider">
                      Quote
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300 italic truncate">
                      "{quotedText}"
                    </span>
                  </div>
                  <button
                    onClick={onQuoteClear}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {/* Attachment Previews */}
              {(attachments.length > 0 || selectedDocuments.length > 0) && (
                <div className="flex gap-2 px-2 py-2 code-scrollbar z-50  overflow-x-auto rounded-xl border border-gray-200/70 dark:border-zinc-700/50 bg-[#F9F9F9] dark:bg-[#1a1a1a]">
                  {attachments.map((att, idx) => (
                    <div
                      key={`img-${idx}`}
                      className="relative group/img shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-800 shadow-sm"
                    >
                      <img
                        src={att.image_url.url}
                        className="w-full h-full object-cover"
                        alt="preview"
                      />
                      <button
                        onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 bg-black/60 dark:bg-white/60 dark:text-black text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {selectedDocuments.map(doc => (
                    <div
                      key={`doc-${doc.id}`}
                      className="relative group/doc shrink-0 min-w-[110px] overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700/50 bg-white dark:bg-[#111] shadow-sm"
                    >
                      <div className="flex h-full flex-col items-center justify-center gap-1 px-2 py-2 text-center">
                        <FileIcon fileType={doc.file_type} size={20} />
                        <span className="text-[12px] font-semibold text-gray-900 dark:text-white truncate">
                          {doc.name}
                        </span>
                        {/* <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                          {(doc.file_type || 'DOC').toUpperCase()}
                        </span> */}
                      </div>
                      <button
                        onClick={() => onToggleDocument?.(doc.id)}
                        className="absolute top-0.5 right-0.5 bg-black/60 dark:bg-white/60 dark:text-black text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover/doc:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Capsule Input Grid Container Wrapper for Glow */}
          <div className="relative">
            <div
              className={clsx(
                'absolute inset-0 input-glow-veil blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none',
                isMultiline ? 'rounded-[26px]' : 'rounded-[32px]',
              )}
            />
            {/* Capsule Input Grid Container */}
            <div
              className={clsx(
                'relative p-1.5 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 shadow-sm transition-all duration-300 focus-within:shadow-md grid gap-2',
                isMultiline
                  ? 'rounded-[26px] grid-cols-[1fr_auto] items-end'
                  : 'rounded-[32px] grid-cols-[auto_1fr_auto] items-center',
                isLoading && 'opacity-80',
              )}
            >
              <div
                className={clsx(
                  'flex items-center gap-1',
                  isMultiline
                    ? 'col-start-1 row-start-2 justify-self-start ml-1.5 mb-0.5'
                    : 'col-start-1 row-start-1 ml-1',
                )}
              >
                {/* Attach Button */}
                <div className="relative" ref={uploadMenuRef}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  <button
                    onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
                    className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                    title={t('common.upload')}
                  >
                    <Plus size={20} strokeWidth={2.5} />
                  </button>
                  {!isMobile && isUploadMenuOpen && desktopUploadMenuContent}
                  {isMobile && (
                    <MobileDrawer
                      isOpen={isUploadMenuOpen}
                      onClose={() => setIsUploadMenuOpen(false)}
                      title={t('common.upload')}
                    >
                      <div className="space-y-2">
                        {uploadMenuButton}
                        {hasDocuments && (
                          <div className="border-t border-gray-200/70 dark:border-zinc-700/50 pt-3">
                            {renderDocumentsSection()}
                          </div>
                        )}
                      </div>
                    </MobileDrawer>
                  )}
                </div>

                {/* Document Selector (Desktop Only) */}
                {/* {!isMobile && documents && documents.length > 0 && (
                  <div className="relative" ref={documentMenuRef}>
                    <button
                      onClick={() => setIsDocumentMenuOpen(!isDocumentMenuOpen)}
                      className={clsx(
                        'p-1.5 sm:p-2 rounded-full transition-colors',
                        isDocumentMenuOpen || selectedDocumentCount > 0
                          ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/20'
                          : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-zinc-800',
                      )}
                      title={t('chatInterface.documents')}
                    >
                      <FileText size={20} strokeWidth={2} />
                      {selectedDocumentCount > 0 && (
                        <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[10px] text-white">
                          {selectedDocumentCount}
                        </span>
                      )}
                    </button>
                    {isDocumentMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-3 w-64 bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border border-gray-200/50 dark:border-zinc-700/50 rounded-2xl shadow-2xl z-50 overflow-hidden p-3 animate-in zoom-in-95 slide-in-from-bottom-4">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
                          {t('chatInterface.documents')}
                        </div>
                        {documentsListContent}
                      </div>
                    )}
                  </div>
                )} */}

                {/* Settings / Model Menu */}
                <div className="relative" ref={capsuleMenuRef}>
                  <button
                    onClick={() => setIsCapsuleMenuOpen(!isCapsuleMenuOpen)}
                    className={clsx(
                      'p-1.5 sm:p-2 rounded-full transition-colors',
                      isThinkingActive || isSearchActive || isCapsuleMenuOpen
                        ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-zinc-800',
                    )}
                    title="Model & Settings"
                  >
                    <SlidersHorizontal size={20} strokeWidth={2} />
                  </button>

                  {/* Popover Menu (Desktop) */}
                  {!isMobile && isCapsuleMenuOpen && (
                    <div className={clsx(popoverSurfaceClass, 'w-72')}>{settingsMenuContent}</div>
                  )}

                  {/* Drawer Menu (Mobile) */}
                  {isMobile && (
                    <MobileDrawer
                      isOpen={isCapsuleMenuOpen}
                      onClose={() => setIsCapsuleMenuOpen(false)}
                      title="Model & Settings"
                      icon={SlidersHorizontal}
                    >
                      {settingsMenuContent}
                    </MobileDrawer>
                  )}
                </div>
              </div>

              {/* Text Area */}
              <div
                className={clsx(
                  'relative flex items-center',
                  isMultiline ? 'col-span-2 row-start-1 w-full' : 'col-start-2 row-start-1 flex-1',
                )}
              >
                {inputValue && (
                  <div
                    ref={highlightRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 px-1 py-3 text-[15px] leading-[1.6] whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100 overflow-hidden"
                  >
                    {highlightedInputParts.map((part, index) =>
                      part.type === 'url' ? (
                        <span
                          key={`url-${index}`}
                          className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-sm underline decoration-primary-400/70"
                        >
                          {part.value}
                        </span>
                      ) : (
                        <span key={`text-${index}`}>{part.value}</span>
                      ),
                    )}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onScroll={e => {
                    if (highlightRef.current) {
                      highlightRef.current.scrollTop = e.target.scrollTop
                    }
                  }}
                  placeholder={t('chatInterface.askFollowUp')}
                  rows={1}
                  className={clsx(
                    'relative z-10 w-full bg-transparent border-none outline-none resize-none text-[15px] leading-[1.6] text-transparent caret-gray-900 dark:caret-gray-100 placeholder-gray-400 dark:placeholder-gray-500 max-h-[200px] overflow-y-auto px-1 py-3 min-h-[48px]',
                    !isMultiline && 'no-scrollbar',
                  )}
                />
              </div>

              {/* Right Send Button */}
              <div
                className={clsx(
                  isMultiline
                    ? 'col-start-2 row-start-2 justify-self-end mr-1.5 mb-0.5'
                    : 'col-start-3 row-start-1 mr-1',
                )}
              >
                <button
                  onClick={handleSend}
                  disabled={isLoading || (!inputValue.trim() && attachments.length === 0)}
                  className={clsx(
                    'p-1.5 sm:p-2 rounded-full transition-all duration-300 shadow-sm flex items-center justify-center',
                    (inputValue.trim() || attachments.length > 0) && !isLoading
                      ? 'bg-primary-500 text-white hover:bg-primary-600 hover:scale-105 active:scale-95'
                      : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed',
                  )}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ArrowUp size={20} strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // === DEFAULT VARIANT ===
    return (
      <div className="w-full max-w-3xl relative group">
        <div className="absolute inset-0 input-glow-veil rounded-xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
        <div className="relative bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50 focus-within:border-primary-500/50 rounded-2xl transition-all duration-300 p-3 shadow-md hover:shadow-lg group-hover:shadow-lg focus-within:shadow-xl">
          {showEditing && (
            <div className="flex items-center justify-between bg-gray-200 dark:bg-zinc-700/50 rounded-lg px-3 py-2 mb-2 ">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">
                    Editing
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px] md:max-w-md">
                    {editingLabel}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onEditingClear?.()}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-300 dark:hover:bg-zinc-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {quotedText && (
            <div className="flex items-center justify-between bg-gray-200 dark:bg-zinc-700/50 rounded-lg px-3 py-2 mb-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">
                    Quote
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px] md:max-w-md italic">
                    &quot;{quotedText}&quot;
                  </span>
                </div>
              </div>
              <button
                onClick={onQuoteClear}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-300 dark:hover:bg-zinc-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex gap-2 mb-3 px-2 py-2 overflow-x-auto rounded-xl border border-gray-200/70 dark:border-zinc-700/50 bg-white/70 dark:bg-[#202222]/70">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group shrink-0">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 shadow-sm">
                    <img
                      src={att.image_url.url}
                      alt="attachment"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative w-full flex items-center min-h-[44px]">
            {inputValue && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 py-3 flex items-center text-base leading-[1.6] whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100"
              >
                {highlightedInputParts.map((part, index) =>
                  part.type === 'url' ? (
                    <span
                      key={`url-${index}`}
                      className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-sm underline decoration-primary-400/70"
                    >
                      {part.value}
                    </span>
                  ) : (
                    <span key={`text-${index}`}>{part.value}</span>
                  ),
                )}
              </div>
            )}
            <textarea
              id="chat-input-textarea"
              value={inputValue}
              ref={textareaRef}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chatInterface.askFollowUp')}
              className="relative z-10 w-full bg-transparent border-none outline-none resize-none text-base leading-[1.6] text-transparent caret-gray-900 dark:caret-gray-100 placeholder-gray-500 dark:placeholder-gray-400 min-h-[48px] max-h-[200px] overflow-y-auto py-3 disabled:cursor-not-allowed"
              rows={1}
            />
          </div>

          <div className="flex justify-between items-center mt-2">
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                multiple
                className="hidden"
              />
              <div className="relative" ref={uploadMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUploadMenuOpen(prev => !prev)}
                  className={clsx(
                    'p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium',
                    attachments.length > 0
                      ? 'text-primary-500'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                >
                  <Paperclip size={18} />
                </button>
                {isUploadMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                    <div className="p-2 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={handleUploadImage}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-gray-200"
                      >
                        <Image size={16} />
                        {t('common.upload')}
                      </button>
                      <button
                        type="button"
                        disabled
                        onClick={() => setIsUploadMenuOpen(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      >
                        <FileText size={16} />
                        {t('common.uploadDocument')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                disabled={isThinkingLocked}
                onClick={onToggleThinking}
                className={clsx(
                  'p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium',
                  isThinkingActive
                    ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                    : 'text-gray-500 dark:text-gray-400',
                  isThinkingLocked && 'opacity-60 cursor-not-allowed',
                  !isThinkingLocked && 'hover:bg-gray-200 dark:hover:bg-zinc-700',
                )}
              >
                <Brain size={18} />
                <span className="hidden md:inline">{t('homeView.think')}</span>
              </button>
              <button
                disabled={!apiProvider || !providerSupportsSearch(apiProvider)}
                onClick={onToggleSearch}
                className={clsx(
                  'p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium',
                  isSearchActive
                    ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                    : 'text-gray-500 dark:text-gray-400',
                )}
              >
                <Globe size={18} />
                <span className="hidden md:inline">{t('homeView.search')}</span>
              </button>
              <div className="relative" ref={agentSelectorRef}>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    onAgentSelectorToggle()
                  }}
                  className={clsx(
                    'p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium',
                    selectedAgent || isAgentAutoMode
                      ? 'text-primary-500 bg-gray-200 dark:bg-zinc-700'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                  disabled={agentsLoading}
                >
                  {isAgentAutoMode || !selectedAgent ? (
                    <Smile size={18} />
                  ) : (
                    <EmojiDisplay emoji={selectedAgent.emoji} size="1.125rem" />
                  )}
                  {agentsLoading && (
                    <span className="inline-flex text-[10px] leading-none opacity-70 animate-pulse">
                      {agentsLoadingDots || '...'}
                    </span>
                  )}
                  <span className="hidden md:inline truncate max-w-[120px]">
                    {agentsLoading
                      ? agentsLoadingLabel || t('chatInterface.agentsLoading')
                      : isAgentAutoMode
                        ? t('chatInterface.agentAuto')
                        : getAgentDisplayName(selectedAgent, t) || t('chatInterface.agentsLabel')}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {isAgentSelectorOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                    <div className="p-2 flex flex-col gap-1">
                      {/* Auto mode option */}
                      <button
                        type="button"
                        onClick={() => onAgentAutoModeToggle()}
                        className={clsx(
                          'flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left',
                          isAgentAutoMode ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🤖</span>
                          <span className="text-sm font-medium truncate">
                            {t('chatInterface.agentAuto')}
                          </span>
                        </div>
                        {isAgentAutoMode && <Check size={14} className="text-primary-500" />}
                      </button>
                      <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                      {/* Manual agent options */}
                      {agents.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          {t('chatInterface.agentsNone')}
                        </div>
                      ) : (
                        agents.map(agent => {
                          const isSelected = !isAgentAutoMode && selectedAgent?.id === agent.id
                          const isDefault =
                            agent.isDefault || String(agent.id) === String(spacePrimaryAgentId)
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => onAgentSelect(agent)}
                              className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  <EmojiDisplay emoji={agent.emoji} size="1.125rem" />
                                </span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                                  {getAgentDisplayName(agent, t)}
                                </span>
                                {isDefault && (
                                  <span className="text-xs px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md font-medium">
                                    {t('chatInterface.default')}
                                  </span>
                                )}
                              </div>
                              {isSelected && <Check size={14} className="text-primary-500" />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={isLoading || (!inputValue.trim() && attachments.length === 0)}
                className="p-2 bg-primary-500 dark:bg-primary-800 hover:bg-primary-600 text-white rounded-full transition-colors disabled:opacity-50  disabled:hover:bg-primary-500"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

ChatInputBar.displayName = 'ChatInputBar'

export default ChatInputBar
