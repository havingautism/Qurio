import { useGSAP } from '@gsap/react'
import clsx from 'clsx'
import gsap from 'gsap'
import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  Globe,
  LayoutGrid,
  Menu,
  Paperclip,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
import EmojiDisplay from '../components/EmojiDisplay'
import Logo from '../components/Logo'
import useScrollLock from '../hooks/useScrollLock'
import HomeWidgets from '../components/widgets/HomeWidgets'
import useChatStore from '../lib/chatStore'
import { getAgentDisplayName } from '../lib/agentDisplay'
import { loadSettings } from '../lib/settings'
import { listSpaceAgents } from '../lib/spacesService'
import { providerSupportsSearch } from '../lib/providers'

const HomeView = () => {
  const { t } = useTranslation()
  const {
    toggleSidebar,
    isSidebarPinned,
    spaces,
    agents: appAgents = [],
    defaultAgent,
  } = useAppContext()
  const [activeView, setActiveView] = useState('home')

  // Initial state for ChatInterface
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
  const [initialAgentSelection, setInitialAgentSelection] = useState(null)
  const [settings, setSettings] = useState(loadSettings())
  const fileInputRef = useRef(null)

  // Homepage Input State
  const [homeInput, setHomeInput] = useState('')
  const [isHomeSearchActive, setIsHomeSearchActive] = useState(false)
  const [isHomeThinkingActive, setIsHomeThinkingActive] = useState(false)
  const [homeAttachments, setHomeAttachments] = useState([])
  const [homeSelectedSpace, setHomeSelectedSpace] = useState(null)
  const homeSpaceSelectorRef = useRef(null)
  const [isHomeSpaceSelectorOpen, setIsHomeSpaceSelectorOpen] = useState(false)
  const [homeSpaceSelectionType, setHomeSpaceSelectionType] = useState('auto') // 'auto' | 'space'
  const [homeExpandedSpaceId, setHomeExpandedSpaceId] = useState(null)
  const [homeAgentIds, setHomeAgentIds] = useState([])
  const [homePrimaryAgentId, setHomePrimaryAgentId] = useState(null)
  const [homeAgentsLoading, setHomeAgentsLoading] = useState(false)
  const [homeSelectedAgentId, setHomeSelectedAgentId] = useState(null)
  const [isHomeAgentAuto, setIsHomeAgentAuto] = useState(true) // Default to auto mode
  const homeContainerRef = useRef(null)
  const [isHomeMobile, setIsHomeMobile] = useState(() => window.innerWidth < 768)

  useScrollLock(isHomeSpaceSelectorOpen && isHomeMobile)

  // Reset conversation state when entering Home/New Chat view
  useEffect(() => {
    useChatStore.getState().resetConversation()
  }, [])

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

  useEffect(() => {
    const handleSettingsChange = () => {
      const newSettings = loadSettings()
      setSettings(newSettings)
    }

    const handleSpaceAgentsChange = async event => {
      const { spaceId } = event.detail || {}
      // Only reload if the changed space matches the current home selected space
      if (homeSelectedSpace?.id && String(homeSelectedSpace.id) === String(spaceId)) {
        setHomeAgentsLoading(true)
        const { data, error } = await listSpaceAgents(homeSelectedSpace.id)
        if (!error && data) {
          setHomeAgentIds(data.map(item => item.agent_id))
          const primaryAgent = data.find(item => item.is_primary)
          setHomePrimaryAgentId(primaryAgent?.agent_id || null)
        } else {
          setHomeAgentIds([])
          setHomePrimaryAgentId(null)
        }
        setHomeAgentsLoading(false)
      }
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    window.addEventListener('space-agents-changed', handleSpaceAgentsChange)
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange)
      window.removeEventListener('space-agents-changed', handleSpaceAgentsChange)
    }
  }, [homeSelectedSpace?.id])

  useEffect(() => {
    const handleResize = () => {
      setIsHomeMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const loadAgents = async () => {
      if (!homeSelectedSpace?.id) {
        setHomeAgentIds([])
        setHomePrimaryAgentId(null)
        setHomeSelectedAgentId(null)
        return
      }
      setHomeAgentsLoading(true)
      const { data, error } = await listSpaceAgents(homeSelectedSpace.id)
      if (!error && data) {
        setHomeAgentIds(data.map(item => item.agent_id))
        const primaryAgent = data.find(item => item.is_primary)
        setHomePrimaryAgentId(primaryAgent?.agent_id || null)
      } else {
        setHomeAgentIds([])
        setHomePrimaryAgentId(null)
      }
      setHomeSelectedAgentId(null)
      setIsHomeAgentAuto(true)
      setHomeAgentsLoading(false)
    }
    loadAgents()
  }, [homeSelectedSpace?.id])

  useEffect(() => {
    const handleClickOutside = event => {
      if (homeSpaceSelectorRef.current && !homeSpaceSelectorRef.current.contains(event.target)) {
        setIsHomeSpaceSelectorOpen(false)
      }
    }

    if (isHomeSpaceSelectorOpen && !isHomeMobile) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => document.removeEventListener('click', handleClickOutside)
  }, [isHomeSpaceSelectorOpen, isHomeMobile])

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

  const handleSelectHomeSpaceAuto = () => {
    setHomeSelectedSpace(null)
    setHomeSpaceSelectionType('auto')
    setIsHomeAgentAuto(true)
    setHomeSelectedAgentId(null)
    setHomeExpandedSpaceId(null)
    setIsHomeSpaceSelectorOpen(false)
  }

  const handleToggleHomeSpace = space => {
    setHomeSelectedSpace(space)
    setHomeSpaceSelectionType('space')
    setIsHomeAgentAuto(true)
    setHomeSelectedAgentId(null)
    setHomeExpandedSpaceId(prev => (prev === space.id ? null : space.id))
  }

  const handleSelectHomeAgent = (space, agentId) => {
    setHomeSelectedSpace(space)
    setHomeSpaceSelectionType('space')
    setIsHomeAgentAuto(false)
    setHomeSelectedAgentId(agentId)
    setIsHomeSpaceSelectorOpen(false)
  }

  const handleSelectHomeAgentAuto = space => {
    setHomeSelectedSpace(space)
    setHomeSpaceSelectionType('space')
    setIsHomeAgentAuto(true)
    setHomeSelectedAgentId(null)
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

    // Two states: auto (AI selects space), manual (user selected space)
    let spaceMode, spaceValue
    if (isHomeSpaceAuto) {
      spaceMode = 'auto'
      spaceValue = null
    } else {
      spaceMode = 'manual'
      spaceValue = homeSelectedSpace
    }

    setInitialSpaceSelection({
      mode: spaceMode,
      space: spaceValue,
    })
    // Pass agent selection info: null for auto mode, agent object for manual mode
    setInitialAgentSelection(isHomeAgentAuto ? null : selectedHomeAgent)

    // Switch to chat view
    setActiveView('chat')

    // Reset home input
    setHomeInput('')
    setHomeAttachments([])
    setIsHomeSearchActive(false)
    setIsHomeThinkingActive(false)
    setHomeSelectedSpace(null)
    setHomeSpaceSelectionType('auto')
    setHomeSelectedAgentId(null)
    setIsHomeAgentAuto(true) // Reset to auto mode for next chat
    setHomeExpandedSpaceId(null)
  }

  const isHomeSpaceAuto = homeSpaceSelectionType === 'auto'
  const homeAgents = useMemo(() => {
    // In Auto mode or when no space selected, return empty
    if (!homeSelectedSpace?.id) return []
    // In manual space mode, return space's agents
    const idSet = new Set(homeAgentIds.map(id => String(id)))
    return appAgents.filter(agent => idSet.has(String(agent.id)))
  }, [appAgents, homeAgentIds, homeSelectedSpace?.id])

  const selectedHomeAgent = useMemo(() => {
    if (isHomeAgentAuto) return null
    // First try to find in homeAgents (space's agents)
    const found = homeAgents.find(agent => String(agent.id) === String(homeSelectedAgentId))
    if (found) return found
    // If not found in homeAgents, try to find in all appAgents (for default agent)
    return appAgents.find(agent => String(agent.id) === String(homeSelectedAgentId)) || null
  }, [homeAgents, homeSelectedAgentId, isHomeAgentAuto, appAgents])

  const homeSpaceButtonLabel = useMemo(() => {
    if (isHomeSpaceAuto) return t('homeView.spacesAuto')
    const spaceLabel = homeSelectedSpace?.label || t('homeView.spacesNone')
    const agentLabel = isHomeAgentAuto
      ? t('homeView.agentsAuto')
      : getAgentDisplayName(selectedHomeAgent, t) || t('homeView.agentsLabel')
    return `${t('homeView.spacesLabel', { label: spaceLabel })} · ${agentLabel}`
  }, [isHomeSpaceAuto, homeSelectedSpace?.label, isHomeAgentAuto, selectedHomeAgent, t])

  const renderHomeSpaceMenuContent = () => (
    <div className="p-2 flex flex-col gap-1">
      <button
        onClick={handleSelectHomeSpaceAuto}
        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
          isHomeSpaceAuto ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200'
        }`}
      >
        <span className="text-sm font-medium">{t('homeView.auto')}</span>
        {isHomeSpaceAuto && <Check size={14} className="text-primary-500" />}
      </button>
      {spaces.length > 0 && <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />}
      {spaces.map((space, idx) => {
        const isSelected = homeSelectedSpace?.label === space.label
        return (
          <div key={idx} className="rounded-lg">
            <button
              onClick={() => handleToggleHomeSpace(space)}
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
              <div className="flex items-center gap-2">
                {isSelected && <Check size={14} className="text-primary-500" />}
                <ChevronDown
                  size={14}
                  className={`text-gray-400 transition-transform ${
                    homeExpandedSpaceId === space.id ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
            {homeExpandedSpaceId === space.id && (
              <div className="ml-9 mt-1 mb-2 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectHomeAgentAuto(space)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                    isHomeAgentAuto && isSelected
                      ? 'text-primary-500'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <span className="text-sm font-medium">{t('homeView.auto')}</span>
                  {isHomeAgentAuto && isSelected && (
                    <Check size={14} className="text-primary-500" />
                  )}
                </button>
                {homeAgentsLoading && isSelected ? (
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
                      <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
                      <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
                    </div>
                  </div>
                ) : homeAgents.length === 0 && isSelected ? (
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {t('homeView.agentsNone')}
                  </div>
                ) : (
                  isSelected &&
                  homeAgents.map(agent => {
                    const isAgentSelected = !isHomeAgentAuto && selectedHomeAgent?.id === agent.id
                    const isDefault =
                      agent.isDefault || String(agent.id) === String(homePrimaryAgentId)
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => handleSelectHomeAgent(space, agent.id)}
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
                              {t('homeView.default')}
                            </span>
                          )}
                        </div>
                        {isAgentSelected && <Check size={14} className="text-primary-500" />}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex-1 h-full overflow-hidden bg-background text-foreground transition-colors duration-300 relative flex flex-col">
      {activeView === 'chat' ? (
        <ChatInterface
          spaces={spaces}
          initialMessage={initialMessage}
          initialAttachments={initialAttachments}
          initialToggles={initialToggles}
          initialSpaceSelection={initialSpaceSelection}
          initialAgentSelection={initialAgentSelection}
          isSidebarPinned={isSidebarPinned}
        />
      ) : (
        <div
          ref={homeContainerRef}
          className={clsx(
            'flex-1 h-full overflow-y-auto p-4 transition-all duration-300 flex flex-col items-center',
            isSidebarPinned ? 'md:ml-20' : 'md:ml-16',
          )}
        >
          {/* Mobile Header for Home View */}
          <div className="md:hidden w-full h-14 shrink-0 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-background z-30 fixed top-0 left-0">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
              >
                <Menu size={20} />
              </button>
              <span className="font-semibold text-gray-900 dark:text-white">{t('app.name')}</span>
            </div>
            {/* Space for right button if needed, or just spacer */}
            <div className="w-8" />
          </div>

          {/* Main Container */}
          <div className="w-full max-w-3xl flex flex-col items-center gap-4 sm:gap-8 sm:mt-14">
            <div className="p-4 block sm:hidden mt-10 rounded-3xl mb-2">
              <Logo size={128} className="text-gray-900 dark:text-white" priority />
            </div>
            {/* Title */}
            <h1 className="home-title text-3xl md:text-5xl font-serif! font-medium text-center mb-4 mt-0 sm:mb-8 text-[#1f2937] dark:text-white">
              {t('app.tagline')}
            </h1>

            {/* Search Box */}
            <div className="home-search-box w-full relative group z-20">
              <div className="absolute inset-0 input-glow-veil rounded-xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-4">
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
                  placeholder={t('homeView.askAnything')}
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
                      <span className="hidden md:inline">{t('homeView.think')}</span>
                    </button>
                    <button
                      disabled={
                        !(selectedHomeAgent?.provider || defaultAgent?.provider) ||
                        !providerSupportsSearch(
                          selectedHomeAgent?.provider || defaultAgent?.provider,
                        )
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
                      <span className="hidden md:inline">{t('homeView.search')}</span>
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
                        <span className="hidden md:inline">{homeSpaceButtonLabel}</span>
                        <ChevronDown size={14} />
                      </button>
                      {!isHomeMobile && isHomeSpaceSelectorOpen && (
                        <div className="absolute top-full left-0 mt-2 w-60 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-50">
                          {renderHomeSpaceMenuContent()}
                        </div>
                      )}
                    </div>

                    {isHomeMobile &&
                      isHomeSpaceSelectorOpen &&
                      createPortal(
                        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
                          <div
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                            onClick={() => setIsHomeSpaceSelectorOpen(false)}
                            aria-hidden="true"
                          />
                          <div className="relative w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
                            <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-gray-100 dark:border-zinc-800/50">
                              <div className="flex flex-col">
                                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none mb-1">
                                  {t('homeView.spaces')}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                  {t('homeView.agents')}
                                </p>
                              </div>
                              <button
                                onClick={() => setIsHomeSpaceSelectorOpen(false)}
                                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <X size={20} />
                              </button>
                            </div>
                            <div className="overflow-y-auto min-h-0 py-2">
                              {renderHomeSpaceMenuContent()}
                            </div>
                            <div className="h-6 shrink-0" />
                          </div>
                        </div>,
                        document.body,
                      )}
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
        </div>
      )}
    </div>
  )
}

export default HomeView
