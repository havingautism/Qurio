import clsx from 'clsx'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right'
import ArrowUp from 'lucide-react/dist/esm/icons/arrow-up'
import Brain from 'lucide-react/dist/esm/icons/brain'
import Check from 'lucide-react/dist/esm/icons/check'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down'
import FileText from 'lucide-react/dist/esm/icons/file-text'
import Globe from 'lucide-react/dist/esm/icons/globe'
import Image from 'lucide-react/dist/esm/icons/image'
import Paperclip from 'lucide-react/dist/esm/icons/paperclip'
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal'
import Smile from 'lucide-react/dist/esm/icons/smile'
import Square from 'lucide-react/dist/esm/icons/square'
import X from 'lucide-react/dist/esm/icons/x'
import FileJson from 'lucide-react/dist/esm/icons/file-json'
import FileSpreadsheet from 'lucide-react/dist/esm/icons/file-spreadsheet'
import FileCode from 'lucide-react/dist/esm/icons/file-code'
import File from 'lucide-react/dist/esm/icons/file'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAgentDisplayName } from '../../lib/agentDisplay'
import { providerSupportsSearch } from '../../lib/providers'
import { splitTextWithUrls } from '../../lib/urlHighlight'
import EmojiDisplay from '../EmojiDisplay'
import useIsMobile from '../../hooks/useIsMobile'
import MobileDrawer from '../MobileDrawer'
import UploadPopover from '../UploadPopover'
import DocumentsSection from '../DocumentsSection'

// Extracted FileIcon component to avoid recreation on each render
const FileIcon = React.memo(
  function FileIcon({ fileType, className }) {
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
  },
  // Custom comparison: only re-render if fileType changes (className changes are cheap)
  (prevProps, nextProps) => prevProps.fileType === nextProps.fileType,
)

const CapsuleUploadMenu = React.memo(
  ({
    hasDocuments,
    documents,
    documentsLoading,
    selectedDocumentCount,
    selectedDocumentIdSet,
    onToggleDocument,
    onUploadImage,
    t,
  }) => (
    <>
      <div className="text-[10px]  font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
        {t('common.upload')}
      </div>
      <div className="space-y-1">
        <button
          onClick={onUploadImage}
          className="flex items-center gap-1.5 mb-1.5 w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm rounded-xl"
        >
          <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <Image size={16} className="text-primary-500" />
          </div>
          {t('common.uploadImage')}
        </button>
        {hasDocuments && (
          <div className="border-t border-gray-200/70 dark:border-zinc-700/50 pt-3">
            <DocumentsSection
              documents={documents}
              documentsLoading={documentsLoading}
              selectedDocumentCount={selectedDocumentCount}
              selectedDocumentIdSet={selectedDocumentIdSet}
              onToggleDocument={onToggleDocument}
              t={t}
            />
          </div>
        )}
      </div>
    </>
  ),
)
CapsuleUploadMenu.displayName = 'CapsuleUploadMenu'

const CapsuleSettingsMenu = React.memo(
  ({
    agents,
    isAgentAutoMode,
    onAgentAutoModeToggle,
    onAgentSelect,
    selectedAgent,
    spacePrimaryAgentId,
    isThinkingLocked,
    isThinkingActive,
    onToggleThinking,
    isSearchActive,
    onToggleSearch,
    searchBackend,
    searchBackendOptions = [],
    selectedSearchTools = [],
    searchOptions = [],
    t,
    isSearchSupported,
    isSearchMenuOpen,
    onSearchToolSelect,
    onSearchBackendChange,
    onSearchClear,
    searchMenuRef,
  }) => {
    const backendLabel = React.useMemo(() => {
      if (!searchBackend) return null
      const option = (searchBackendOptions || []).find(item => item.id === searchBackend)
      return option ? t(option.labelKey) : searchBackend
    }, [searchBackend, searchBackendOptions, t])

    const activeSearchLabel = React.useMemo(() => {
      if (!isSearchActive) return t('homeView.search')
      const academicCount = selectedSearchTools?.length || 0
      const activeCount = (searchBackend ? 1 : 0) + (academicCount > 0 ? 1 : 0)
      if (activeCount > 1) {
        return `${t('homeView.search')} (${activeCount})`
      }
      if (searchBackend) {
        return `${t('tools.webSearch')} · ${backendLabel || searchBackend}`
      }
      if (academicCount > 0) {
        return `${t('tools.academicSearch')} (${academicCount})`
      }
      return t('homeView.search')
    }, [isSearchActive, selectedSearchTools, searchBackend, backendLabel, t])
    return (
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
              }}
              className={clsx(
                'flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm transition-colors',
                isAgentAutoMode
                  ? 'bg-gray-100 dark:bg-zinc-700/50 text-gray-900 dark:text-white font-medium'
                  : 'hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-600 dark:text-gray-300',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">✨</span>
                <span>{t('chatInterface.agentAuto')}</span>
              </div>
              {isAgentAutoMode && <Check size={14} className="text-primary-500" />}
            </button>
            {agents.map(agent => {
              const isSelected = !isAgentAutoMode && selectedAgent?.id === agent.id
              const isDefault = agent.isDefault || String(agent.id) === String(spacePrimaryAgentId)
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    onAgentSelect(agent)
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
            <div className="relative">
              <button
                disabled={!isSearchSupported}
                onClick={onToggleSearch}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50"
                aria-expanded={isSearchMenuOpen}
                aria-controls="capsule-search-options"
              >
                <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-200">
                  <Globe
                    size={16}
                    className={isSearchActive ? 'text-primary-500' : 'text-gray-400'}
                  />
                  <span>{activeSearchLabel}</span>
                </div>
                <ChevronDown
                  size={14}
                  className={clsx(
                    'text-gray-400 transition-transform',
                    isSearchMenuOpen && 'rotate-180',
                  )}
                />
              </button>
              {isSearchMenuOpen && (
                <div ref={searchMenuRef} id="capsule-search-options" className="mt-2 space-y-3">
                  <div className="space-y-3">
                    <div className="px-4 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                      {t('tools.webSearch')}
                    </div>
                    <div className="space-y-1">
                      {searchBackendOptions.map(option => {
                        const isActive = searchBackend === option.id
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => onSearchBackendChange?.(option.id)}
                            className={clsx(
                              'w-full px-4 py-2 text-left text-sm flex items-center justify-between rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                              isActive
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                : 'text-gray-700 dark:text-gray-200',
                            )}
                          >
                            <span className="flex items-center gap-2">
                              {option.iconUrl ? (
                                <img
                                  src={option.iconUrl}
                                  alt=""
                                  className="h-4 w-4 rounded-sm"
                                />
                              ) : (
                                <Globe size={14} className="text-gray-400" />
                              )}
                              {t(option.labelKey)}
                            </span>
                            {isActive && <Check size={14} className="text-primary-500" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                  <div className="space-y-3">
                    <div className="px-4 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                      {t('tools.academicSearch')}
                    </div>
                    <div className="space-y-1">
                      {searchOptions.map(option => {
                        const isActive = selectedSearchTools.includes(option.id)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => onSearchToolSelect?.(option.id)}
                            className={clsx(
                              'w-full px-4 py-2 text-left text-sm flex items-center justify-between rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                              isActive
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                : 'text-gray-700 dark:text-gray-200',
                            )}
                          >
                            <span className="flex items-center gap-2">
                              {option.iconUrl ? (
                                <img
                                  src={option.iconUrl}
                                  alt=""
                                  className="h-4 w-4 rounded-sm"
                                />
                              ) : (
                                <Globe size={14} className="text-gray-400" />
                              )}
                              {t(option.labelKey)}
                            </span>
                            {isActive && <Check size={14} className="text-primary-500" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                  <button
                    type="button"
                    onClick={() => onSearchClear?.()}
                    className="w-full px-4 py-2 text-left text-sm text-gray-500 dark:text-gray-400 flex items-center justify-between rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <span>{t('common.close')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  },
)
CapsuleSettingsMenu.displayName = 'CapsuleSettingsMenu'

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
 * @param {string|null} props.searchBackend - Selected web search backend
 * @param {Array} props.searchBackendOptions - Web search backend options
 * @param {Array} props.selectedSearchTools - Selected academic search tool IDs
 * @param {Array} props.searchOptions - Academic search options to show in the picker
 * @param {boolean} props.isSearchMenuOpen - Whether the search picker is open
 * @param {Function} props.onSearchToolSelect - Called when an academic search option is chosen
 * @param {Function} props.onSearchBackendChange - Called when a web search backend is chosen
 * @param {Function} props.onSearchClear - Called to clear search selections and close the menu
 * @param {Function} props.onSearchMenuClose - Called to close the search picker
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
    searchBackend,
    searchBackendOptions = [],
    selectedSearchTools = [],
    searchOptions = [],
    isSearchMenuOpen,
    onSearchToolSelect,
    onSearchBackendChange,
    onSearchClear,
    onSearchMenuClose,
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
    onStop, // Add onStop prop
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
    const searchMenuRef = useRef(null)
    const highlightedInputParts = useMemo(() => splitTextWithUrls(inputValue), [inputValue])
    const resolvedSearchLabel = useMemo(() => {
      if (!isSearchActive) return t('homeView.search')
      const academicCount = selectedSearchTools?.length || 0
      const activeCount = (searchBackend ? 1 : 0) + (academicCount > 0 ? 1 : 0)
      if (activeCount > 1) return `${t('homeView.search')} (${activeCount})`
      if (searchBackend) {
        const option = (searchBackendOptions || []).find(item => item.id === searchBackend)
        const label = option ? t(option.labelKey) : searchBackend
        return `${t('tools.webSearch')} · ${label}`
      }
      if (academicCount > 0) return `${t('tools.academicSearch')} (${academicCount})`
      return t('homeView.search')
    }, [isSearchActive, selectedSearchTools, searchBackend, searchBackendOptions, t])
    const selectedDocumentIdSet = useMemo(
      () => new Set((selectedDocumentIds || []).map(id => String(id))),
      [selectedDocumentIds],
    )
    const selectedDocumentCount = selectedDocumentIdSet.size
    const selectedDocuments = useMemo(() => {
      if (!documents || documents.length === 0) return []
      return documents.filter(doc => selectedDocumentIdSet.has(String(doc.id)))
    }, [documents, selectedDocumentIdSet])
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

    useEffect(() => {
      if (!isSearchMenuOpen) return
      const handleClickOutside = event => {
        if (searchMenuRef.current && !searchMenuRef.current.contains(event.target)) {
          onSearchMenuClose?.()
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isSearchMenuOpen, onSearchMenuClose])

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

    const handleUploadImage = useCallback(() => {
      fileInputRef.current?.click()
      setIsUploadMenuOpen(false)
    }, [])

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

    const handleCapsuleAgentAutoToggle = useCallback(() => {
      onAgentAutoModeToggle()
      setIsCapsuleMenuOpen(false)
    }, [onAgentAutoModeToggle])

    const handleCapsuleAgentSelect = useCallback(
      agent => {
        onAgentSelect(agent)
        setIsCapsuleMenuOpen(false)
      },
      [onAgentSelect],
    )

    const hasDocuments = documents && documents.length > 0
    const isSearchSupported = providerSupportsSearch(apiProvider)

    const desktopUploadMenuContent = useMemo(
      () => (
        <UploadPopover className="w-72 bottom-full">
          <CapsuleUploadMenu
            hasDocuments={hasDocuments}
            documents={documents}
            documentsLoading={documentsLoading}
            selectedDocumentCount={selectedDocumentCount}
            selectedDocumentIdSet={selectedDocumentIdSet}
            onToggleDocument={onToggleDocument}
            onUploadImage={handleUploadImage}
            t={t}
          />
        </UploadPopover>
      ),
      [
        hasDocuments,
        documents,
        documentsLoading,
        selectedDocumentCount,
        selectedDocumentIdSet,
        onToggleDocument,
        t,
        handleUploadImage,
      ],
    )

    const settingsMenuContent = useMemo(
      () => (
        <CapsuleSettingsMenu
          agents={agents}
          isAgentAutoMode={isAgentAutoMode}
          onAgentAutoModeToggle={handleCapsuleAgentAutoToggle}
          onAgentSelect={handleCapsuleAgentSelect}
          selectedAgent={selectedAgent}
          spacePrimaryAgentId={spacePrimaryAgentId}
          isThinkingLocked={isThinkingLocked}
          isThinkingActive={isThinkingActive}
          onToggleThinking={onToggleThinking}
          isSearchActive={isSearchActive}
          onToggleSearch={onToggleSearch}
          searchBackend={searchBackend}
          searchBackendOptions={searchBackendOptions}
          selectedSearchTools={selectedSearchTools}
          searchOptions={searchOptions}
          t={t}
          isSearchSupported={isSearchSupported}
          isSearchMenuOpen={isSearchMenuOpen}
          onSearchToolSelect={onSearchToolSelect}
          onSearchBackendChange={onSearchBackendChange}
          onSearchClear={onSearchClear}
          searchMenuRef={searchMenuRef}
        />
      ),
      [
        agents,
        isAgentAutoMode,
        handleCapsuleAgentAutoToggle,
        handleCapsuleAgentSelect,
        selectedAgent,
        spacePrimaryAgentId,
        isThinkingLocked,
        isThinkingActive,
        onToggleThinking,
        isSearchActive,
        onToggleSearch,
        searchBackend,
        searchBackendOptions,
        selectedSearchTools,
        searchOptions,
        t,
        isSearchSupported,
        isSearchMenuOpen,
        onSearchToolSelect,
        onSearchBackendChange,
        onSearchClear,
      ],
    )

    // === CAPSULE VARIANT ===

    if (variant === 'capsule') {
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
                <div className="flex items-center justify-between z-50 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 shadow-sm animate-in slide-in-from-bottom-2">
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
                <div className="flex items-center justify-between z-50 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 shadow-sm animate-in slide-in-from-bottom-2">
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
                          {doc.name.replace(/\.[^/.]+$/, '')}
                        </span>
                        {/* <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                          {(doc.file_type || 'DOC').toUpperCase()}
                        </span> */}
                      </div>
                      <button
                        onClick={() => onToggleDocument?.(doc.id)}
                        className="absolute top-1.5 right-3 bg-black/60 dark:bg-white/60 dark:text-black text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover/doc:opacity-100 transition-opacity"
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
                'relative p-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-sm transition-all duration-300 focus-within:shadow-md grid gap-2',
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
                    aria-label={t('common.upload')}
                    aria-expanded={isUploadMenuOpen}
                    aria-haspopup="menu"
                  >
                    <Paperclip size={20} strokeWidth={2.5} />
                  </button>
                  {!isMobile && isUploadMenuOpen && desktopUploadMenuContent}
                  {isMobile && (
                    <MobileDrawer
                      isOpen={isUploadMenuOpen}
                      onClose={() => setIsUploadMenuOpen(false)}
                      title={t('common.files')}
                    >
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
                          {t('common.upload')}
                        </div>
                        <button
                          onClick={handleUploadImage}
                          className="flex items-center gap-1.5 w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm rounded-xl"
                        >
                          <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                            <Image size={16} className="text-primary-500" />
                          </div>
                          {t('common.uploadImage')}
                        </button>
                        {hasDocuments && (
                          <div className="border-t border-gray-200/70 dark:border-zinc-700/50 pt-3">
                            <DocumentsSection
                              documents={documents}
                              documentsLoading={documentsLoading}
                              selectedDocumentCount={selectedDocumentCount}
                              selectedDocumentIdSet={selectedDocumentIdSet}
                              onToggleDocument={onToggleDocument}
                              t={t}
                            />
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
                    aria-label={t('chatInterface.modelSettings')}
                    aria-expanded={isCapsuleMenuOpen}
                    aria-haspopup="menu"
                  >
                    <SlidersHorizontal size={20} strokeWidth={2} />
                  </button>

                  {/* Popover Menu (Desktop) */}
                  {!isMobile && isCapsuleMenuOpen && (
                    <UploadPopover className="w-72 bottom-full">
                      {settingsMenuContent}
                    </UploadPopover>
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
                  onClick={isLoading ? onStop : handleSend}
                  disabled={!isLoading && !inputValue.trim() && attachments.length === 0}
                  className={clsx(
                    'p-1.5 sm:p-2 rounded-full transition-all duration-300 shadow-sm flex items-center justify-center',
                    isLoading
                      ? 'bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-zinc-700'
                      : inputValue.trim() || attachments.length > 0
                        ? 'bg-primary-500 text-white hover:bg-primary-600 hover:scale-105 active:scale-95'
                        : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed',
                  )}
                >
                  {isLoading ? (
                    <Square size={16} fill="currentColor" strokeWidth={2.5} />
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
        <div className="absolute inset-0 input-glow-veil rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-500 pointer-events-none bg-gradient-to-r from-primary-500/20 via-primary-400/20 to-primary-500/20" />
        <div className="relative bg-white dark:bg-zinc-800/90 backdrop-blur-sm border border-gray-200/60 dark:border-zinc-700/50 focus-within:border-primary-500/50 focus-within:ring-4 focus-within:ring-primary-500/10 rounded-2xl transition-all duration-300 p-3.5 shadow-lg hover:shadow-xl">
          {showEditing && (
            <div className="flex items-center justify-between bg-gray-100 dark:bg-zinc-700/50 rounded-xl px-4 py-2.5 mb-3 border border-gray-200/50 dark:border-zinc-600/50">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                    Editing
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate max-w-[200px] md:max-w-md font-medium">
                    {editingLabel}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onEditingClear?.()}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {quotedText && (
            <div className="flex items-center justify-between bg-gray-100 dark:bg-zinc-700/50 rounded-xl px-4 py-2.5 mb-3 border border-gray-200/50 dark:border-zinc-600/50">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                    Quote
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate max-w-[200px] md:max-w-md italic">
                    &quot;{quotedText}&quot;
                  </span>
                </div>
              </div>
              <button
                onClick={onQuoteClear}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex gap-2.5 mb-3 px-2 py-2 overflow-x-auto rounded-xl border border-gray-200/70 dark:border-zinc-700/50 bg-white/70 dark:bg-[#202222]/70">
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
                    className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200 shadow-md hover:bg-red-500"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative w-full flex items-center min-h-[48px]">
            {inputValue && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 py-3.5 flex items-center text-[15px] leading-[1.6] whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100"
              >
                {highlightedInputParts.map((part, index) =>
                  part.type === 'url' ? (
                    <span
                      key={`url-${index}`}
                      className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-md underline decoration-primary-400/70 underline-offset-2"
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
              className="relative z-10 w-full bg-transparent border-none outline-none resize-none text-[15px] leading-[1.6] text-transparent caret-gray-900 dark:caret-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[48px] max-h-[200px] overflow-y-auto py-3.5 disabled:cursor-not-allowed"
              rows={1}
            />
          </div>

          <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 dark:border-zinc-700/50">
            <div className="flex gap-1.5">
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
                    'p-2.5 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium',
                    attachments.length > 0
                      ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                  aria-label={t('common.upload')}
                  aria-expanded={isUploadMenuOpen}
                  aria-haspopup="menu"
                >
                  <Paperclip size={18} strokeWidth={2} />
                </button>
                {isUploadMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl z-30 overflow-hidden animate-in slide-in-from-bottom-2">
                    <div className="p-2 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={handleUploadImage}
                        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-gray-200 font-medium"
                      >
                        <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                          <Image size={16} className="text-primary-500" />
                        </div>
                        {t('common.uploadImage')}
                      </button>
                      <button
                        type="button"
                        disabled
                        onClick={() => setIsUploadMenuOpen(false)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-left text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
                      >
                        <div className="p-1.5 bg-gray-100 dark:bg-zinc-800 rounded-lg">
                          <FileText size={16} />
                        </div>
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
                  'p-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium',
                  isThinkingActive
                    ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'text-gray-500 dark:text-gray-400',
                  isThinkingLocked && 'opacity-60 cursor-not-allowed',
                  !isThinkingLocked && 'hover:bg-gray-100 dark:hover:bg-zinc-700',
                )}
              >
                <Brain size={18} strokeWidth={2} />
                <span className="hidden md:inline">{t('homeView.think')}</span>
              </button>
              <div className="relative">
                <button
                  disabled={!apiProvider || !providerSupportsSearch(apiProvider)}
                  onClick={onToggleSearch}
                  className={clsx(
                    'p-2.5 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium',
                    isSearchActive
                      ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                >
                  <Globe size={18} strokeWidth={2} />
                  <span className="hidden md:inline">{resolvedSearchLabel}</span>
                </button>
                {isSearchMenuOpen && (
                  <div
                    ref={searchMenuRef}
                    className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl z-30 overflow-hidden"
                  >
                    <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                      {t('chatInterface.searchMenuTitle')}
                    </div>
                    <div className="px-2 pb-2 space-y-3">
                      <div className="space-y-3">
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                          {t('tools.webSearch')}
                        </div>
                        <div className="flex flex-col gap-1">
                          {searchBackendOptions.map(option => {
                            const isActive = searchBackend === option.id
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => onSearchBackendChange?.(option.id)}
                                className={clsx(
                                  'w-full px-3 py-2 text-left text-sm flex items-center justify-between rounded-xl transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                  isActive
                                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                    : 'text-gray-700 dark:text-gray-200',
                                )}
                              >
                                <span className="flex items-center gap-2">
                                  {option.iconUrl ? (
                                    <img
                                      src={option.iconUrl}
                                      alt=""
                                      className="h-4 w-4 rounded-sm"
                                    />
                                  ) : (
                                    <Globe size={14} className="text-gray-400" />
                                  )}
                                  {t(option.labelKey)}
                                </span>
                                {isActive && <Check size={14} className="text-primary-500" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                      <div className="space-y-3">
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                          {t('tools.academicSearch')}
                        </div>
                        <div className="flex flex-col gap-1">
                          {searchOptions.map(option => {
                            const isActive = selectedSearchTools.includes(option.id)
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => onSearchToolSelect?.(option.id)}
                                className={clsx(
                                  'w-full px-3 py-2 text-left text-sm flex items-center justify-between rounded-xl transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                  isActive
                                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                    : 'text-gray-700 dark:text-gray-200',
                                )}
                              >
                                <span className="flex items-center gap-2">
                                  {option.iconUrl ? (
                                    <img
                                      src={option.iconUrl}
                                      alt=""
                                      className="h-4 w-4 rounded-sm"
                                    />
                                  ) : (
                                    <Globe size={14} className="text-gray-400" />
                                  )}
                                  {t(option.labelKey)}
                                </span>
                                {isActive && <Check size={14} className="text-primary-500" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                      <button
                        type="button"
                        onClick={() => onSearchClear?.()}
                        className="w-full px-3 py-2 text-left text-sm text-gray-500 dark:text-gray-400 flex items-center justify-between rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <span>{t('common.close')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative" ref={agentSelectorRef}>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    onAgentSelectorToggle()
                  }}
                  className={clsx(
                    'p-2.5 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium',
                    selectedAgent || isAgentAutoMode
                      ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                  disabled={agentsLoading}
                  aria-label={t('chatInterface.agentsLabel')}
                  aria-expanded={isAgentSelectorOpen}
                  aria-haspopup="menu"
                >
                  {isAgentAutoMode || !selectedAgent ? (
                    <Smile size={18} strokeWidth={2} />
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
                  <ChevronDown size={14} strokeWidth={2} />
                </button>
                {isAgentSelectorOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl z-30 overflow-hidden animate-in slide-in-from-bottom-2">
                    <div className="p-2 flex flex-col gap-1">
                      {/* Auto mode option */}
                      <button
                        type="button"
                        onClick={() => onAgentAutoModeToggle()}
                        className={clsx(
                          'flex items-center justify-between w-full px-4 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left',
                          isAgentAutoMode ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200',
                        )}
                      >
                        <div className="flex items-center divide-y divide-gray-200 dark:divide-zinc-800">
                          <span className="text-lg p-1 bg-gray-100 dark:bg-zinc-800 rounded-lg">
                            馃
                          </span>
                          <span className="text-sm font-medium truncate">
                            {t('chatInterface.agentAuto')}
                          </span>
                        </div>
                        {isAgentAutoMode && <Check size={16} className="text-primary-500" />}
                      </button>
                      {/* Manual agent options */}
                      {agents.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
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
                              className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-lg p-1 bg-gray-100 dark:bg-zinc-800 rounded-lg">
                                  <EmojiDisplay emoji={agent.emoji} size="1.125rem" />
                                </span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                                  {getAgentDisplayName(agent, t)}
                                </span>
                                {isDefault && (
                                  <span className="text-xs px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md font-medium">
                                    {t('chatInterface.default')}
                                  </span>
                                )}
                              </div>
                              {isSelected && <Check size={16} className="text-primary-500" />}
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
                onClick={isLoading ? onStop : handleSend}
                disabled={!isLoading && !inputValue.trim() && attachments.length === 0}
                className={clsx(
                  'p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center shadow-sm',
                  isLoading
                    ? 'bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-zinc-600'
                    : inputValue.trim() || attachments.length > 0
                      ? 'bg-primary-500 text-white hover:bg-primary-600 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg'
                      : 'bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500 cursor-not-allowed',
                )}
              >
                {isLoading ? (
                  <Square size={16} fill="currentColor" strokeWidth={2.5} />
                ) : (
                  <ArrowRight size={20} strokeWidth={2.5} />
                )}
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
