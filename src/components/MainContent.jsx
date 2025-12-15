import { useState, useRef, useEffect } from 'react'
import {
  Paperclip,
  ArrowRight,
  Globe,
  X,
  Check,
  ChevronDown,
  LayoutGrid,
  Brain,
  Menu,
} from 'lucide-react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import clsx from 'clsx'
import ChatInterface from './ChatInterface'
import SpaceView from './SpaceView'
import SpacesListView from './SpacesListView'
import ConversationsListView from './ConversationsListView'
import { loadSettings } from '../lib/settings'
import EmojiDisplay from './EmojiDisplay'
import HomeWidgets from './widgets/HomeWidgets'
import { useAppContext } from '../App'
import Logo from './Logo'

const MainContent = ({
  currentView,
  activeSpace,
  activeConversation,
  spaces,
  conversations = [],
  conversationsLoading = false,
  spacesLoading = false,
  onChatStart,
  onEditSpace,
  onOpenConversation,
  onNavigate,
  onNavigateToSpace,
  onCreateSpace,
  isSidebarPinned = false,
}) => {
  const [activeView, setActiveView] = useState(currentView) // Local state to manage view transition
  const [initialMessage, setInitialMessage] = useState('')
  const [initialAttachments, setInitialAttachments] = useState([])
  const [initialToggles, setInitialToggles] = useState({
    search: false,
    thinking: false,
    related: false,
  })
  const [initialSpaceSelection, setInitialSpaceSelection] = useState({
    mode: 'auto',
    space: null,
  })
  const [settings, setSettings] = useState(loadSettings())
  const fileInputRef = useRef(null)

  // Homepage Input State (moved here to fix hook order)
  const [homeInput, setHomeInput] = useState('')
  const [isHomeSearchActive, setIsHomeSearchActive] = useState(false)
  const [isHomeThinkingActive, setIsHomeThinkingActive] = useState(false)
  const [homeAttachments, setHomeAttachments] = useState([])
  const [homeSelectedSpace, setHomeSelectedSpace] = useState(null)
  const homeSpaceSelectorRef = useRef(null)
  const [isHomeSpaceSelectorOpen, setIsHomeSpaceSelectorOpen] = useState(false)

  const { toggleSidebar } = useAppContext()
  const homeContainerRef = useRef(null)

  useGSAP(
    () => {
      if (
        activeView === 'chat' ||
        activeView === 'space' ||
        activeView === 'spaces' ||
        activeView === 'bookmarks' ||
        activeView === 'library' ||
        activeView === 'conversations'
      )
        return

      const tl = gsap.timeline()

      // Animate Title
      tl.from('.home-title', {
        y: -20,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
      })

        // Animate Search Box
        .from(
          '.home-search-box',
          {
            scale: 0.95,
            opacity: 0,
            duration: 0.6,
            ease: 'back.out(1.7)',
          },
          '-=0.4',
        )

        // Animate Widgets
        .from(
          '.home-widgets',
          {
            y: 20,
            opacity: 0,
            duration: 0.8,
            ease: 'power2.out',
          },
          '-=0.4',
        )
    },
    { dependencies: [activeView], scope: homeContainerRef },
  )

  // Sync prop change to local state if needed (e.g. sidebar navigation)
  useEffect(() => {
    setActiveView(currentView)
  }, [currentView])

  // Clear initial state when switching to an existing conversation (not the one just created)
  useEffect(() => {
    // Only clear initial states if we're switching to a DIFFERENT conversation
    // and we have initial states that were set for a new conversation
    if (
      activeConversation &&
      activeView === 'chat' &&
      (initialMessage || initialAttachments.length > 0) &&
      activeConversation.id !== undefined
    ) {
      // Check if this conversation already exists by having a proper created_at timestamp
      // This prevents clearing states for the just-created conversation
      if (activeConversation.created_at && activeConversation.title !== 'New Conversation') {
        // Clear initial states to prevent duplicate conversation creation
        setInitialMessage('')
        setInitialAttachments([])
        setInitialToggles({
          search: false,
          thinking: false,
          related: Boolean(settings.enableRelatedQuestions),
        })
        setInitialSpaceSelection({
          mode: 'auto',
          space: null,
        })
      }
    }
  }, [
    activeConversation,
    activeView,
    initialMessage,
    initialAttachments,
    settings.enableRelatedQuestions,
  ])

  useEffect(() => {
    const handleSettingsChange = () => {
      const newSettings = loadSettings()
      setSettings(newSettings)
      if (
        newSettings.apiProvider === 'openai_compatibility' ||
        newSettings.apiProvider === 'siliconflow'
      ) {
        setIsHomeSearchActive(false)
      }
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    return () => window.removeEventListener('settings-changed', handleSettingsChange)
  }, [])

  // ... (rest of the component)

  // Extract derived values that were declared with the state
  const isHomeSpaceAuto = !homeSelectedSpace

  useEffect(() => {
    const handleClickOutside = event => {
      if (homeSpaceSelectorRef.current && !homeSpaceSelectorRef.current.contains(event.target)) {
        setIsHomeSpaceSelectorOpen(false)
      }
    }

    if (isHomeSpaceSelectorOpen) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => document.removeEventListener('click', handleClickOutside)
  }, [isHomeSpaceSelectorOpen])

  const handleFileChange = e => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    files.forEach(file => {
      if (!file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = e => {
        setHomeAttachments(prev => [
          ...prev,
          {
            type: 'image_url',
            image_url: { url: e.target.result },
          },
        ])
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    e.target.value = ''
  }

  const handleHomeFileUpload = () => {
    fileInputRef.current?.click()
  }

  const handleSelectHomeSpace = space => {
    setHomeSelectedSpace(space)
    setIsHomeSpaceSelectorOpen(false)
  }

  const handleSelectHomeSpaceAuto = () => {
    setHomeSelectedSpace(null)
    setIsHomeSpaceSelectorOpen(false)
  }

  const handleStartChat = async () => {
    if (!homeInput.trim() && homeAttachments.length === 0) return

    // Set initial state for ChatInterface
    setInitialMessage(homeInput)
    setInitialAttachments(homeAttachments)
    setInitialToggles({
      search: isHomeSearchActive,
      thinking: isHomeThinkingActive,
      related: Boolean(settings.enableRelatedQuestions),
    })
    const isManualSpaceSelection = !!homeSelectedSpace
    setInitialSpaceSelection({
      mode: isManualSpaceSelection ? 'manual' : 'auto',
      space: isManualSpaceSelection ? homeSelectedSpace : null,
    })

    // Switch to chat view
    setActiveView('chat')
    if (onChatStart) onChatStart()

    // Reset home input
    setHomeInput('')
    setHomeAttachments([])
    setIsHomeSearchActive(false)
    setIsHomeThinkingActive(false)
  }

  return (
    <div className="flex-1 min-h-screen bg-background text-foreground transition-colors duration-300 relative">
      {activeView === 'chat' ? (
        <ChatInterface
          spaces={spaces}
          initialMessage={initialMessage}
          initialAttachments={initialAttachments}
          initialToggles={initialToggles}
          initialSpaceSelection={initialSpaceSelection}
          activeConversation={activeConversation}
          isSidebarPinned={isSidebarPinned}
        />
      ) : activeView === 'space' && activeSpace ? (
        <SpaceView
          space={activeSpace}
          onEditSpace={onEditSpace}
          onOpenConversation={onOpenConversation}
          activeConversationId={activeConversation?.id}
          onConversationDeleted={deletedId => {
            // Navigate home if we deleted the currently active conversation
            if (activeConversation?.id === deletedId) {
              onNavigate('home')
            }
          }}
          isSidebarPinned={isSidebarPinned}
        />
      ) : activeView === 'spaces' ? (
        <SpacesListView
          spaces={spaces}
          spacesLoading={spacesLoading}
          onCreateSpace={onCreateSpace}
          onNavigateToSpace={onNavigateToSpace}
          onSpaceDeleted={deletedId => {
            // Navigate home if we deleted the currently active space
            if (activeSpace?.id === deletedId) {
              onNavigate('home')
            }
          }}
          isSidebarPinned={isSidebarPinned}
        />
      ) : activeView === 'bookmarks' ? (
        <ConversationsListView
          conversations={conversations.filter(c => c.is_favorited)}
          conversationsLoading={conversationsLoading}
          onCreateConversation={() => onNavigate('home')}
          onOpenConversation={onOpenConversation}
          isSidebarPinned={isSidebarPinned}
          title="Bookmarks"
          showCreateButton={false}
        />
      ) : activeView === 'library' ? (
        <ConversationsListView
          conversations={conversations}
          conversationsLoading={conversationsLoading}
          onCreateConversation={() => onNavigate('home')}
          onOpenConversation={onOpenConversation}
          onConversationDeleted={deletedId => {
            // Navigate home if we deleted the currently active conversation
            if (activeConversation?.id === deletedId) {
              onNavigate('home')
            }
          }}
          isSidebarPinned={isSidebarPinned}
        />
      ) : activeView === 'conversations' ? (
        <ConversationsListView
          conversations={conversations}
          conversationsLoading={conversationsLoading}
          onCreateConversation={() => onNavigate('home')}
          onOpenConversation={onOpenConversation}
          onConversationDeleted={deletedId => {
            // Navigate home if we deleted the currently active conversation
            if (activeConversation?.id === deletedId) {
              onNavigate('home')
            }
          }}
          isSidebarPinned={isSidebarPinned}
          title="All Conversations"
        />
      ) : (
        <div
          ref={homeContainerRef}
          className={clsx(
            'flex flex-col items-center justify-center min-h-screen p-4 transition-all duration-300',
            isSidebarPinned ? 'md:ml-20' : 'md:ml-16',
          )}
        >
          {/* Mobile Header for Home View */}
          <div className="md:hidden w-full h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-background z-30 fixed top-0 left-0">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
              >
                <Menu size={20} />
              </button>
              <span className="font-semibold text-gray-900 dark:text-white">Qurio</span>
            </div>
            {/* Space for right button if needed, or just spacer */}
            <div className="w-8" />
          </div>

          {/* Main Container */}
          <div className="w-full max-w-3xl flex flex-col items-center gap-4 sm:gap-8 mt-14 md:mt-0">
            <div className="p-4 block sm:hidden  rounded-3xl mb-2">
              <Logo size={128} className="text-gray-900 dark:text-white" />
            </div>
            {/* Title */}
            <h1 className="home-title text-3xl md:text-5xl font-serif! font-medium text-center mb-4 mt-0 sm:mb-8 text-[#1f2937] dark:text-white">
              Where insight clicks.
            </h1>

            {/* Search Box */}
            <div className="home-search-box w-full relative group">
              <div className="absolute inset-0 input-glow-veil rounded-xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative bg-user-bubble dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-4">
                {homeAttachments.length > 0 && (
                  <div className="flex gap-2 mb-3 px-1 overflow-x-auto py-1">
                    {homeAttachments.map((att, idx) => (
                      <div key={idx} className="relative group shrink-0">
                        <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 shadow-sm">
                          <img
                            src={att.image_url.url}
                            alt="attachment"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setHomeAttachments(homeAttachments.filter((_, i) => i !== idx))
                          }
                          className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={homeInput}
                  onChange={e => {
                    setHomeInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleStartChat()
                    }
                  }}
                  placeholder="Ask anything..."
                  className="w-full bg-transparent border-none outline-none resize-none text-lg placeholder-gray-400 dark:placeholder-gray-500 min-h-[60px] max-h-[200px] overflow-y-auto"
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
                    <button
                      onClick={handleHomeFileUpload}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        homeAttachments.length > 0
                          ? 'text-primary-500'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <Paperclip size={18} />
                    </button>
                    <button
                      onClick={() => setIsHomeThinkingActive(!isHomeThinkingActive)}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        isHomeThinkingActive
                          ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <Brain size={18} />
                      <span className="hidden md:inline">Think</span>
                    </button>
                    <button
                      disabled={
                        settings.apiProvider === 'openai_compatibility' ||
                        settings.apiProvider === 'siliconflow'
                      }
                      value={isHomeSearchActive}
                      onClick={() => setIsHomeSearchActive(!isHomeSearchActive)}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        isHomeSearchActive
                          ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <Globe size={18} />
                      <span className="hidden md:inline">Search</span>
                    </button>

                    <div className="relative" ref={homeSpaceSelectorRef}>
                      <button
                        onClick={() => setIsHomeSpaceSelectorOpen(!isHomeSpaceSelectorOpen)}
                        className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                          isHomeSpaceAuto
                            ? 'text-gray-500 dark:text-gray-400'
                            : 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                        }`}
                      >
                        <LayoutGrid size={18} />
                        <span className="hidden md:inline">
                          {isHomeSpaceAuto || !homeSelectedSpace
                            ? 'Spaces: Auto'
                            : `Spaces: ${homeSelectedSpace.label}`}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {isHomeSpaceSelectorOpen && (
                        <div className="absolute top-full left-0 mt-2 w-60 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30">
                          <div className="p-2 flex flex-col gap-1">
                            <button
                              onClick={handleSelectHomeSpaceAuto}
                              className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                                isHomeSpaceAuto
                                  ? 'text-primary-500'
                                  : 'text-gray-700 dark:text-gray-200'
                              }`}
                            >
                              <span className="text-sm font-medium">Auto</span>
                              {isHomeSpaceAuto && <Check size={14} className="text-primary-500" />}
                            </button>
                            {spaces.length > 0 && (
                              <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />
                            )}
                            {spaces.map((space, idx) => {
                              const isSelected = homeSelectedSpace?.label === space.label
                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleSelectHomeSpace(space)}
                                  className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg flex items-center justify-center">
                                      <EmojiDisplay emoji={space.emoji} size="1.25rem" />
                                    </span>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                      {space.label}
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
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleStartChat}
                      disabled={!homeInput.trim() && homeAttachments.length === 0}
                      className="p-2 bg-primary-500 hover:bg-primary-600 text-white rounded-full transition-colors disabled:opacity-50  disabled:hover:bg-primary-500"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Widgets Section */}
            <div className="home-widgets w-full">
              <HomeWidgets />
            </div>
          </div>

          {/* Footer */}
          {/* <div className="absolute bottom-4 text-xs text-gray-400 dark:text-gray-600 flex gap-4">
            <a href="#" className="hover:underline">
              Pro
            </a>
            <a href="#" className="hover:underline">
              Enterprise
            </a>
            <a href="#" className="hover:underline">
              Store
            </a>
            <a href="#" className="hover:underline">
              Blog
            </a>
            <a href="#" className="hover:underline">
              Careers
            </a>
            <a href="#" className="hover:underline">
              English (English)
            </a>
          </div> */}
        </div>
      )}
    </div>
  )
}

export default MainContent
