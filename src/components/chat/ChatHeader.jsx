import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, LayoutGrid, Menu, PanelRightOpen, Sparkles } from 'lucide-react'
import EmojiDisplay from '../EmojiDisplay'
import { getSpaceDisplayLabel } from '../../lib/spaceDisplay'
import DotLoader from '../DotLoader'

/**
 * ChatHeader Component
 * Title bar with space selector, conversation title, and timeline toggle button
 *
 * @param {object} props
 * @param {function} props.toggleSidebar - Toggle sidebar visibility
 * @param {boolean} props.isMetaLoading - Whether metadata is loading
 * @param {object} props.displaySpace - Currently displayed space
 * @param {Array} props.availableSpaces - List of available spaces
 * @param {object} props.selectedSpace - Currently selected space
 * @param {boolean} props.isSelectorOpen - Whether space selector is open
 * @param {function} props.setIsSelectorOpen - Set space selector open state
 * @param {object} props.selectorRef - Ref for space selector dropdown
 * @param {boolean} props.isDeepResearchConversation - Whether this is a deep research conversation
 * @param {boolean} props.isSpaceSelectionLocked - Whether space selection is locked
 * @param {function} props.onSelectSpace - Callback when space is selected
 * @param {function} props.onClearSpaceSelection - Callback when space selection is cleared
 * @param {string} props.conversationTitle - Current conversation title
 * @param {boolean} props.isTitleLoading - Whether the title is loading
 * @param {Array} props.conversationTitleEmojis - Emojis for the conversation title
 * @param {boolean} props.isRegeneratingTitle - Whether title is being regenerated
 * @param {function} props.onRegenerateTitle - Callback to regenerate title
 * @param {Array} props.documents - Documents available in the current space
 * @param {boolean} props.documentsLoading - Whether documents are loading
 * @param {Array} props.selectedDocumentIds - Selected document ids for this conversation
 * @param {boolean} props.isDocumentSelectorOpen - Whether document selector is open
 * @param {function} props.setIsDocumentSelectorOpen - Set document selector open state
 * @param {object} props.documentSelectorRef - Ref for document selector dropdown
 * @param {function} props.onToggleDocument - Callback when a document is toggled
 * @param {Array} props.messages - Current messages
 * @param {boolean} props.isTimelineSidebarOpen - Whether timeline sidebar is open
 * @param {function} props.onToggleTimeline - Callback to toggle timeline sidebar
 */
const ChatHeader = ({
  toggleSidebar,
  isMetaLoading,
  displaySpace,
  availableSpaces,
  selectedSpace,
  isSelectorOpen,
  setIsSelectorOpen,
  selectorRef,
  isDeepResearchConversation,
  isSpaceSelectionLocked = false,
  onSelectSpace,
  onClearSpaceSelection,
  conversationTitle,
  isTitleLoading = false,
  conversationTitleEmojis = [],
  isRegeneratingTitle,
  onRegenerateTitle,

  messages,
  isTimelineSidebarOpen,
  onToggleTimeline,
}) => {
  const { t } = useTranslation()
  const isSelectorLocked = isDeepResearchConversation || isSpaceSelectionLocked
  const [isTitleBubbleOpen, setIsTitleBubbleOpen] = useState(false)
  const titleBubbleRef = useRef(null)
  // const [emojiTick, setEmojiTick] = useState(0)
  const normalizedEmojis = useMemo(() => {
    if (!Array.isArray(conversationTitleEmojis)) return []
    return conversationTitleEmojis
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 1)
  }, [conversationTitleEmojis])
  const activeEmoji = normalizedEmojis.length > 0 ? normalizedEmojis[0] : null
  const resolvedTitle = conversationTitle || 'New Conversation'

  useEffect(() => {
    if (!isTitleBubbleOpen) return undefined
    const handleOutside = event => {
      if (!titleBubbleRef.current?.contains(event.target)) {
        setIsTitleBubbleOpen(false)
      }
    }
    const handleEsc = event => {
      if (event.key === 'Escape') {
        setIsTitleBubbleOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside, { passive: true })
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isTitleBubbleOpen])

  // const activeEmoji =
  //   normalizedEmojis.length > 0 ? normalizedEmojis[emojiTick % normalizedEmojis.length] : null
  //
  // useEffect(() => {
  //   if (normalizedEmojis.length <= 1) return
  //   const intervalId = setInterval(() => {
  //     setEmojiTick(prev => prev + 1)
  //   }, 2000)
  //   return () => clearInterval(intervalId)
  // }, [normalizedEmojis.length])

  return (
    <div className="pointer-events-none absolute top-0 right-0 left-0 z-40 flex w-full shrink-0 items-center justify-between gap-4 p-4">
      {/* Transparent header with glassy fade only where it overlaps content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-21 bg-gradient-to-b from-white/68 via-white/28 to-transparent [mask-image:linear-gradient(to_bottom,black_58%,transparent)] opacity-100 backdrop-blur-xl md:hidden dark:from-zinc-950/68 dark:via-zinc-950/28"
      />
      <div className="pointer-events-auto flex w-full items-center gap-2">
        {/* Mobile Menu Button - visible only on mobile */}
        <button
          onClick={toggleSidebar}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md md:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
        >
          <Menu size={21} className="block" />
        </button>

        {/* Left Side: Space Selector & Title */}
        <div className="flex min-w-0 flex-1 items-center">
          <div className="relative flex w-fit max-w-full min-w-0 items-center gap-3">
            {/* Desktop local glass mask: fit to actual button group width */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-4 -right-3 -bottom-2 -left-3 hidden rounded-[22px] bg-gradient-to-b from-white/24 via-white/14 to-transparent backdrop-blur-md md:block dark:from-zinc-950/24 dark:via-zinc-950/14"
            />
            {/* Space Selector */}
            <div className="relative z-10 shrink-0" ref={selectorRef}>
              <button
                onMouseDown={e => {
                  e.stopPropagation()
                  if (isSelectorLocked) return
                  setIsSelectorOpen(prev => !prev)
                }}
                className={`glass-elite-pill flex h-12 items-center gap-2 rounded-full py-2 pr-3 pl-3 text-sm font-medium transition-all ${
                  isSelectorLocked
                    ? 'cursor-not-allowed bg-gray-100/80 text-gray-500 dark:bg-zinc-800/80 dark:text-gray-400'
                    : 'text-gray-700 hover:scale-105 active:scale-95 dark:text-gray-200'
                }`}
              >
                {isMetaLoading ? (
                  <div className="flex h-5 items-center">
                    <DotLoader />
                  </div>
                ) : displaySpace ? (
                  <div className="inline-flex items-center gap-2">
                    <span className="flex items-center justify-center">
                      <EmojiDisplay emoji={displaySpace.emoji} size="1.1rem" />
                    </span>
                    <span className="hidden w-0 max-w-[150px] truncate opacity-0 transition-all md:inline md:w-auto md:opacity-100">
                      {getSpaceDisplayLabel(displaySpace, t)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">None</span>
                )}
                {!isSelectorLocked && <ChevronDown size={14} className="ml-0.5 text-gray-400" />}
              </button>

              {/* Dropdown */}
              {!isSelectorLocked && isSelectorOpen && (
                <div
                  className="glass-elite-dropdown absolute top-full left-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl"
                  onMouseDown={e => e.stopPropagation()}
                >
                  <div className="flex flex-col space-y-1 p-2">
                    <button
                      type="button"
                      onClick={onClearSpaceSelection}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800/50 ${
                        !displaySpace ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium">None</span>
                      {!displaySpace && <Check size={14} className="text-primary-500" />}
                    </button>
                    {availableSpaces.map((space, idx) => {
                      const isSelected = selectedSpace?.label === space.label
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => onSelectSpace(space)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800/50"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              <EmojiDisplay emoji={space.emoji} size="1.125rem" />
                            </span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                              {getSpaceDisplayLabel(space, t)}
                            </span>
                          </div>
                          {isSelected && <Check size={14} className="text-primary-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Title - Floating Pill Style */}
            <div
              ref={titleBubbleRef}
              className="glass-elite-pill group relative z-10 flex h-12 min-w-0 items-center gap-1 rounded-full py-1.5 pr-2 pl-4 transition-[background-color,box-shadow,border-color] md:max-w-[400px]"
            >
              <h1 className="flex min-w-0 items-center gap-2 truncate font-medium text-gray-800 dark:text-gray-100">
                {isTitleLoading || isMetaLoading ? (
                  <div className="flex h-5 items-center px-2">
                    <DotLoader />
                  </div>
                ) : (
                  <button
                    type="button"
                    onMouseDown={event => event.stopPropagation()}
                    onClick={event => {
                      event.stopPropagation()
                      setIsTitleBubbleOpen(prev => !prev)
                    }}
                    className="inline-flex min-w-0 items-center gap-2 rounded-md text-left outline-none"
                    title={resolvedTitle}
                  >
                    {activeEmoji && (
                      <EmojiDisplay emoji={activeEmoji} size="1.2rem" className="mb-0.5" />
                    )}
                    <span className="truncate text-base sm:text-lg">{resolvedTitle}</span>
                  </button>
                )}
                {isRegeneratingTitle && (
                  <div className="ml-2">
                    <DotLoader />
                  </div>
                )}
              </h1>
              <button
                type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={onRegenerateTitle}
                disabled={isRegeneratingTitle || messages.length === 0}
                className="relative z-20 shrink-0 rounded-full p-1.5 text-gray-400 opacity-100 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                title={t('chatInterface.regenerateTitle')}
              >
                <Sparkles size={14} />
              </button>
              {isTitleBubbleOpen && !isTitleLoading && !isMetaLoading && (
                <div className="pointer-events-none absolute top-full left-0 z-50 mt-2 w-auto max-w-[min(72vw,560px)] px-2 md:px-0">
                  <div className="glass-elite-dropdown pointer-events-auto inline-block max-w-full rounded-2xl px-4 py-3 text-sm leading-relaxed text-gray-800 dark:text-gray-100">
                    <div className="wrap-break-word whitespace-normal">{resolvedTitle}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="pointer-events-auto relative flex items-center gap-2">
          {/* Desktop local glass mask: only under right button cluster */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-4 -right-3 -bottom-2 -left-3 hidden rounded-[22px] bg-gradient-to-b from-white/24 via-white/14 to-transparent backdrop-blur-md md:block dark:from-zinc-950/24 dark:via-zinc-950/14"
          />
          {/* Timeline Button */}
          {!isTimelineSidebarOpen && (
            <button
              onClick={onToggleTimeline}
              className="relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:scale-110 hover:bg-white hover:shadow-md active:scale-95 xl:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
              title={t('chatInterface.openTimeline')}
            >
              <PanelRightOpen size={21} className="block" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatHeader
