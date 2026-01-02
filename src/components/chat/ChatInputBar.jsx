import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDown,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  FileText,
  Globe,
  Image,
  Paperclip,
  Smile,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { providerSupportsSearch } from '../../lib/providers'
import EmojiDisplay from '../EmojiDisplay'
import { getAgentDisplayName } from '../../lib/agentDisplay'

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
 * @param {boolean} props.isFollowUpLocked - Whether follow-up input is locked (deep research single-turn)
 * @param {Array} props.agents - List of available agents
 * @param {boolean} props.agentsLoading - Whether agents are currently loading
 * @param {string} props.agentsLoadingLabel - Full label with animated dots to show while agents are loading
 * @param {string} props.agentsLoadingDots - Animated dots only for separate UI indicator
 * @param {Object} props.selectedAgent - Currently selected agent
 * @param {boolean} props.isAgentAutoMode - Whether agent auto mode is enabled
 * @param {boolean} props.isAgentSelectionLocked - Whether agent selection is locked
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
 */
const ChatInputBar = React.memo(
  ({
    isLoading,
    apiProvider,
    isSearchActive,
    isThinkingActive,
    isThinkingLocked,
    isFollowUpLocked,
    agents,
    agentsLoading,
    agentsLoadingLabel,
    agentsLoadingDots,
    selectedAgent,
    isAgentAutoMode,
    isAgentSelectionLocked,
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
  }) => {
    const { t } = useTranslation()
    const [inputValue, setInputValue] = useState('')
    const [attachments, setAttachments] = useState([])
    const textareaRef = useRef(null)
    const fileInputRef = useRef(null)
    const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false)
    const uploadMenuRef = useRef(null)

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
    }, [inputValue])

    useEffect(() => {
      if (!isUploadMenuOpen) return
      const handleClickOutside = event => {
        if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target)) {
          setIsUploadMenuOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isUploadMenuOpen])

    const handleFileChange = e => {
      const files = Array.from(e.target.files)
      if (files.length === 0) return

      files.forEach(file => {
        if (!file.type.startsWith('image/')) return

        const reader = new FileReader()
        reader.onload = evt => {
          setAttachments(prev => [
            ...prev,
            {
              type: 'image_url',
              image_url: { url: evt.target.result },
            },
          ])
        }
        reader.readAsDataURL(file)
      })

      e.target.value = ''
    }

    const handleUploadImage = () => {
      setIsUploadMenuOpen(false)
      fileInputRef.current?.click()
    }

    const handleSend = () => {
      if (isFollowUpLocked || isLoading) return
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
            <div className="flex gap-2 mb-3 px-1 overflow-x-auto py-1">
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

          <textarea
            id="chat-input-textarea"
            value={inputValue}
            ref={textareaRef}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isFollowUpLocked
                ? t('chatInterface.deepResearchSingleTurn')
                : t('chatInterface.askFollowUp')
            }
            disabled={isFollowUpLocked}
            className="w-full bg-transparent border-none outline-none resize-none text-base placeholder-gray-500 dark:placeholder-gray-400 min-h-[44px] max-h-[200px] overflow-y-auto py-2 disabled:cursor-not-allowed"
            rows={1}
          />

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
                        {t('common.uploadImage')}
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
                  disabled={agentsLoading || isAgentSelectionLocked}
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
                        : getAgentDisplayName(selectedAgent, t) ||
                          t('chatInterface.agentsLabel')}
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
                          isAgentAutoMode
                            ? 'text-primary-500'
                            : 'text-gray-700 dark:text-gray-200',
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
                disabled={
                  isFollowUpLocked || isLoading || (!inputValue.trim() && attachments.length === 0)
                }
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
