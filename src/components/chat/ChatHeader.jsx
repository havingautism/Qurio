import { useMemo } from 'react'
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
  // const [emojiTick, setEmojiTick] = useState(0)
  const normalizedEmojis = useMemo(() => {
    if (!Array.isArray(conversationTitleEmojis)) return []
    return conversationTitleEmojis
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 1)
  }, [conversationTitleEmojis])
  const activeEmoji = normalizedEmojis.length > 0 ? normalizedEmojis[0] : null

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
    <div className="bg-background/80 z-40 flex w-full shrink-0 justify-center border-b border-gray-200 pt-[calc(0.375rem+env(safe-area-inset-top))] pb-1.5 backdrop-blur-md transition-all dark:border-zinc-800">
      <div className="flex w-full max-w-3xl items-center gap-1 px-3">
        {/* Mobile Menu Button */}
        <button
          onClick={toggleSidebar}
          className="-ml-2 shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-zinc-800"
        >
          <Menu size={20} />
        </button>

        {/* Space Selector */}
        <div className="relative" ref={selectorRef}>
          <button
            onMouseDown={e => {
              e.stopPropagation()
              if (isDeepResearchConversation) return
              setIsSelectorOpen(prev => !prev)
            }}
            className={`bg-user-bubble mr-2 flex items-center gap-2 rounded-lg p-1 text-sm font-medium text-gray-700 transition-colors dark:bg-zinc-800 dark:text-gray-300 ${
              isDeepResearchConversation
                ? 'cursor-not-allowed opacity-60'
                : 'hover:bg-gray-200 dark:hover:bg-zinc-700'
            }`}
          >
            {/* <LayoutGrid size={16} className="text-gray-400 hidden sm:inline" /> */}
            {isMetaLoading ? (
              <DotLoader />
            ) : displaySpace ? (
              <div className="inline-flex items-center gap-1">
                <span className="text-lg">
                  <EmojiDisplay emoji={displaySpace.emoji} size="1rem" className="mb-2 ml-1.5" />
                </span>
                <span className="hidden w-0 max-w-[200px] truncate opacity-0 transition-all md:inline md:w-auto md:opacity-100">
                  {getSpaceDisplayLabel(displaySpace, t)}
                </span>
              </div>
            ) : (
              <span className="sm:text-s ml-1.5 text-xs text-gray-500">None</span>
            )}
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {/* Dropdown */}
          {isSelectorOpen && (
            <div
              className="absolute top-full left-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-[#202222]"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="flex flex-col space-y-1 p-2">
                <button
                  type="button"
                  onClick={onClearSpaceSelection}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700/50 ${
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
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700/50"
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

        <div className="relative flex min-w-0 flex-1 items-center gap-2">
          <h1 className="text-m flex min-w-0 items-center gap-2 truncate font-medium text-gray-800 sm:text-xl dark:text-gray-100">
            {isTitleLoading || isMetaLoading ? (
              <DotLoader />
            ) : (
              <span className="inline-flex min-w-0 items-center gap-2">
                {activeEmoji && <EmojiDisplay emoji={activeEmoji} size="1.2rem" className="mb-1" />}
                <span className="no-scrollbar max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
                  <span>{conversationTitle || 'New Conversation'}</span>
                </span>
              </span>
            )}
            {isRegeneratingTitle && <DotLoader />}
          </h1>
          <button
            onClick={onRegenerateTitle}
            disabled={isRegeneratingTitle || messages.length === 0}
            className="bg-user-bubble shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
            title={t('chatInterface.regenerateTitle')}
          >
            <Sparkles size={18} />
          </button>
        </div>

        {/* Timeline Button - only show on screens where sidebar can be toggled (xl and below) */}
        {!isTimelineSidebarOpen && (
          <button
            onClick={onToggleTimeline}
            className="shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 xl:hidden dark:text-gray-300 dark:hover:bg-zinc-800"
            title={t('chatInterface.openTimeline')}
          >
            <PanelRightOpen size={20} />
          </button>
        )}
      </div>
    </div>
  )
}

export default ChatHeader
