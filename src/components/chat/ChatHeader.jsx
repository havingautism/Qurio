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
    <div className="shrink-0 z-40 w-full border-b border-gray-200 dark:border-zinc-800 bg-background/80 backdrop-blur-md pb-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] transition-all flex justify-center">
      <div className="w-full max-w-3xl flex items-center gap-1 px-3">
        {/* Mobile Menu Button */}
        <button
          onClick={toggleSidebar}
          className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg shrink-0"
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
            className={`flex items-center bg-user-bubble dark:bg-zinc-800 gap-2 p-1 mr-2 rounded-lg transition-colors text-sm font-medium text-gray-700 dark:text-gray-300 ${
              isDeepResearchConversation
                ? 'opacity-60 cursor-not-allowed'
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
                <span className="hidden opacity-0 w-0 md:inline md:opacity-100 md:w-auto truncate max-w-[200px] transition-all">
                  {getSpaceDisplayLabel(displaySpace, t)}
                </span>
              </div>
            ) : (
              <span className="text-gray-500 text-xs ml-1.5 sm:text-s">None</span>
            )}
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {/* Dropdown */}
          {isSelectorOpen && (
            <div
              className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="p-2 flex flex-col space-y-1 ">
                <button
                  type="button"
                  onClick={onClearSpaceSelection}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
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
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
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

        <div className="flex items-center gap-2 flex-1 min-w-0 relative">
          <h1 className="text-m sm:text-xl font-medium text-gray-800 dark:text-gray-100 truncate flex items-center gap-2 min-w-0">
            {isTitleLoading || isMetaLoading ? (
              <DotLoader />
            ) : (
              <span className="inline-flex items-center gap-2 min-w-0 ">
                {activeEmoji && <EmojiDisplay emoji={activeEmoji} size="1.2rem" className="mb-1" />}
                <span className="overflow-x-auto whitespace-nowrap no-scrollbar min-w-0 max-w-full">
                  <span>{conversationTitle || 'New Conversation'}</span>
                </span>
              </span>
            )}
            {isRegeneratingTitle && <DotLoader />}
          </h1>
          <button
            onClick={onRegenerateTitle}
            disabled={isRegeneratingTitle || messages.length === 0}
            className="p-2 rounded-lg bg-user-bubble dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300 transition-colors shrink-0"
            title={t('chatInterface.regenerateTitle')}
          >
            <Sparkles size={18} />
          </button>
        </div>

        {/* Timeline Button - only show on screens where sidebar can be toggled (xl and below) */}
        {!isTimelineSidebarOpen && (
          <button
            onClick={onToggleTimeline}
            className="xl:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-colors shrink-0"
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
