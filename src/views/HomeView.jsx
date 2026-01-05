import { useGSAP } from '@gsap/react'
import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import gsap from 'gsap'
import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  FileText,
  Globe,
  Image,
  LayoutGrid,
  Menu,
  Paperclip,
  Sparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import DeepResearchCard from '../components/DeepResearchCard'
import EmojiDisplay from '../components/EmojiDisplay'
import Logo from '../components/Logo'
import HomeWidgets from '../components/widgets/HomeWidgets'
import useScrollLock from '../hooks/useScrollLock'
import { getAgentDisplayName } from '../lib/agentDisplay'
import useChatStore from '../lib/chatStore'
import { addConversationEvent, createConversation } from '../lib/conversationsService'
import { providerSupportsSearch, resolveThinkingToggleRule } from '../lib/providers'
import { loadSettings } from '../lib/settings'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import { listSpaceAgents } from '../lib/spacesService'

const HomeView = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    toggleSidebar,
    isSidebarPinned,
    spaces,
    agents: appAgents = [],
    defaultAgent,
    deepResearchSpace,
    deepResearchAgent,
  } = useAppContext()

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
  const [isHomeUploadMenuOpen, setIsHomeUploadMenuOpen] = useState(false)
  const homeUploadMenuRef = useRef(null)
  const [isDeepResearchModalOpen, setIsDeepResearchModalOpen] = useState(false)
  const [deepResearchStep, setDeepResearchStep] = useState(1)
  const [deepResearchQuestion, setDeepResearchQuestion] = useState('')
  const [deepResearchScope, setDeepResearchScope] = useState('')
  const [deepResearchScopeAuto, setDeepResearchScopeAuto] = useState(true)
  const [deepResearchOutput, setDeepResearchOutput] = useState('')
  const [deepResearchOutputAuto, setDeepResearchOutputAuto] = useState(true)
  const [deepResearchType, setDeepResearchType] = useState('general') // 'general' or 'academic'
  const deepResearchModalRef = useRef(null)

  useScrollLock((isHomeSpaceSelectorOpen && isHomeMobile) || isDeepResearchModalOpen)

  // Reset conversation state when entering Home/New Chat view
  useEffect(() => {
    useChatStore.getState().resetConversation()
  }, [])

  useGSAP(
    () => {
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
    { scope: homeContainerRef },
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

  useEffect(() => {
    if (!isHomeUploadMenuOpen) return
    const handleClickOutside = event => {
      if (homeUploadMenuRef.current && !homeUploadMenuRef.current.contains(event.target)) {
        setIsHomeUploadMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isHomeUploadMenuOpen])

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

  const handleHomeImageUpload = () => {
    setIsHomeUploadMenuOpen(false)
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

  const resetDeepResearchForm = useCallback(() => {
    setDeepResearchStep(1)
    setDeepResearchQuestion('')
    setDeepResearchScope('')
    setDeepResearchScopeAuto(true)
    setDeepResearchOutput('')
    setDeepResearchOutputAuto(true)
    setDeepResearchType('general') // Reset to general research
  }, [])

  const handleOpenDeepResearch = useCallback(() => {
    resetDeepResearchForm()
    setIsDeepResearchModalOpen(true)
  }, [resetDeepResearchForm])

  const closeDeepResearchModal = () => {
    setIsDeepResearchModalOpen(false)
    resetDeepResearchForm()
  }

  const buildDeepResearchPrompt = () => {
    const autoLabel = t('homeView.auto')
    const scopeValue =
      deepResearchScopeAuto || !deepResearchScope.trim() ? autoLabel : deepResearchScope.trim()
    const outputValue =
      deepResearchOutputAuto || !deepResearchOutput.trim() ? autoLabel : deepResearchOutput.trim()

    return [
      `${t('homeView.deepResearchQuestionLabel')}: ${deepResearchQuestion.trim()}`,
      `${t('homeView.deepResearchScopeLabel')}: ${scopeValue}`,
      `${t('homeView.deepResearchOutputLabel')}: ${outputValue}`,
    ].join('\n')
  }

  const handleStartDeepResearch = async () => {
    if (!deepResearchQuestion.trim()) return
    if (!deepResearchSpace || !deepResearchAgent) {
      console.error('Deep research space or agent missing.')
      return
    }

    try {
      const { data: conversation, error } = await createConversation({
        space_id: deepResearchSpace.id,
        title: 'Deep Research',
        api_provider: deepResearchAgent.provider || defaultAgent?.provider || '',
      })

      if (error || !conversation) {
        console.error('Failed to create deep research conversation:', error)
        return
      }

      addConversationEvent(conversation.id, 'deep_research', { enabled: true }).catch(err =>
        console.error('Failed to record deep research event:', err),
      )

      const chatState = {
        initialMessage: buildDeepResearchPrompt(),
        initialAttachments: [],
        initialToggles: {
          search: true,
          thinking: false,
          deepResearch: true,
          related: false,
        },
        initialSpaceSelection: {
          mode: 'manual',
          space: deepResearchSpace,
        },
        initialAgentSelection: deepResearchAgent,
        initialIsAgentAutoMode: false,
        researchType: deepResearchType, // Pass research type to chat state
      }

      navigate({
        to: '/deepresearch/$conversationId',
        params: { conversationId: conversation.id },
        state: chatState,
      })

      closeDeepResearchModal()
    } catch (err) {
      console.error('Failed to start deep research:', err)
    }
  }

  useEffect(() => {
    if (!isDeepResearchModalOpen) return
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        closeDeepResearchModal()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isDeepResearchModalOpen, closeDeepResearchModal])

  const handleStartChat = async () => {
    if (!homeInput.trim() && homeAttachments.length === 0) return
    const resolvedThinkingActive = isHomeThinkingActive
    const resolvedSpace = homeSelectedSpace
    const resolvedAgent = selectedHomeAgent

    try {
      // Determine space selection
      const selectedSpace = isHomeSpaceAuto ? null : resolvedSpace
      const selectedAgent = isHomeAgentAuto ? null : resolvedAgent

      // Create conversation in database first
      const { data: conversation, error } = await createConversation({
        space_id: selectedSpace?.id || null,
        title: 'New Conversation',
        api_provider: selectedAgent?.provider || defaultAgent?.provider || '',
      })

      if (error || !conversation) {
        console.error('Failed to create conversation:', error)
        return
      }
      // Prepare initial chat state to pass via router state
      const chatState = {
        initialMessage: homeInput,
        initialAttachments: homeAttachments,
        initialToggles: {
          search: isHomeSearchActive,
          thinking: resolvedThinkingActive,
          deepResearch: false,
          related: Boolean(settings.enableRelatedQuestions),
        },
        initialSpaceSelection: {
          mode: isHomeSpaceAuto ? 'auto' : 'manual',
          space: selectedSpace,
        },
        initialAgentSelection: selectedAgent,
        initialIsAgentAutoMode: isHomeAgentAuto,
      }

      // Navigate to the conversation route with state
      navigate({
        to: '/conversation/$conversationId',
        params: { conversationId: conversation.id },
        state: chatState,
      })

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
    } catch (err) {
      console.error('Failed to start chat:', err)
    }
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

  const homeModelConfig = useMemo(() => {
    const resolveFromAgent = agent => {
      if (!agent) return null
      const defaultModel = agent.defaultModel
      const liteModel = agent.liteModel ?? ''
      const defaultModelProvider = agent.defaultModelProvider || ''
      const liteModelProvider = agent.liteModelProvider || ''
      const hasDefault = typeof defaultModel === 'string' && defaultModel.trim() !== ''
      const hasLite = typeof liteModel === 'string' && liteModel.trim() !== ''
      if (!hasDefault && !hasLite) return null
      const model = defaultModel || liteModel
      const provider = defaultModelProvider || liteModelProvider || agent.provider || ''
      if (!model) return null
      return { model, provider }
    }
    return resolveFromAgent(selectedHomeAgent) || resolveFromAgent(defaultAgent) || { model: '' }
  }, [selectedHomeAgent, defaultAgent])

  const homeResolvedModel = homeModelConfig?.model || ''
  const homeThinkingRule = resolveThinkingToggleRule('', homeResolvedModel)
  const isHomeThinkingLocked = homeThinkingRule.isLocked

  useEffect(() => {
    if (!isHomeThinkingLocked) return
    setIsHomeThinkingActive(homeThinkingRule.isThinkingActive)
  }, [isHomeThinkingLocked, homeThinkingRule.isThinkingActive])

  const homeSpaceButtonLabel = useMemo(() => {
    if (isHomeSpaceAuto) return t('homeView.spacesAuto')
    const spaceLabel = homeSelectedSpace
      ? getSpaceDisplayLabel(homeSelectedSpace, t)
      : t('homeView.spacesNone')
    const agentLabel = isHomeAgentAuto
      ? t('homeView.agentsAuto')
      : getAgentDisplayName(selectedHomeAgent, t) || t('homeView.agentsLabel')
    return `${t('homeView.spacesLabel', { label: spaceLabel })} · ${agentLabel}`
  }, [isHomeSpaceAuto, homeSelectedSpace, isHomeAgentAuto, selectedHomeAgent, t])

  const availableHomeSpaces = useMemo(() => {
    const deepResearchId = deepResearchSpace?.id ? String(deepResearchSpace.id) : null
    return spaces.filter(
      space =>
        !(space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research) &&
        (!deepResearchId || String(space.id) !== String(deepResearchId)),
    )
  }, [spaces, deepResearchSpace?.id])

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
      {availableHomeSpaces.length > 0 && <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />}
      {availableHomeSpaces.map((space, idx) => {
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
                  {getSpaceDisplayLabel(space, t)}
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
      {/* Immersive Animated Background Blobs - Global for HomeView */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none opacity-40 dark:opacity-20">
        <div className="absolute h-[600px] w-[600px] -left-40 -top-40 bg-linear-to-br from-orange-400/30 to-magenta-500/30 rounded-full blur-[120px] animate-blob-float" />
        <div className="absolute h-[700px] w-[700px] -right-40 -bottom-40 bg-linear-to-tr from-primary-500/20 to-blue-600/20 rounded-full blur-[140px] animate-blob-float-alt" />
      </div>

      <div
        ref={homeContainerRef}
        className={clsx(
          'flex-1 h-full overflow-y-auto p-4 transition-all duration-300 flex flex-col items-center',
          isSidebarPinned ? 'md:ml-72' : 'md:ml-16',
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
                        className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md"
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
                  <div className="relative" ref={homeUploadMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsHomeUploadMenuOpen(prev => !prev)}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        homeAttachments.length > 0
                          ? 'text-primary-500'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <Paperclip size={18} />
                    </button>
                    {isHomeUploadMenuOpen && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
                        <div className="p-2 flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={handleHomeImageUpload}
                            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left text-sm text-gray-700 dark:text-gray-200"
                          >
                            <Image size={16} />
                            {t('common.uploadImage')}
                          </button>
                          <button
                            type="button"
                            disabled
                            onClick={() => setIsHomeUploadMenuOpen(false)}
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
                    disabled={isHomeThinkingLocked}
                    onClick={() =>
                      setIsHomeThinkingActive(prev => {
                        const next = !prev
                        if (next) {
                          handleSelectHomeSpaceAuto()
                        }
                        return next
                      })
                    }
                    className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                      isHomeThinkingActive
                        ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                        : 'text-gray-500 dark:text-gray-400'
                    } ${isHomeThinkingLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
                  >
                    <Brain size={18} />
                    <span className="hidden md:inline">{t('homeView.think')}</span>
                  </button>
                  <button
                    disabled={
                      !isHomeSpaceAuto &&
                      Boolean(selectedHomeAgent?.provider || defaultAgent?.provider) &&
                      !providerSupportsSearch(selectedHomeAgent?.provider || defaultAgent?.provider)
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
                      className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        isHomeSpaceAuto
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                      } hover:bg-gray-100 dark:hover:bg-zinc-800`}
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
                      <div className="fixed inset-0 z-50 flex items-end justify-center">
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

          <DeepResearchCard onClick={handleOpenDeepResearch} />

          {/* Widgets Section */}
          <div className="home-widgets w-full">
            <HomeWidgets />
          </div>
          {isDeepResearchModalOpen &&
            createPortal(
              <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                  onClick={closeDeepResearchModal}
                />
                <div
                  ref={deepResearchModalRef}
                  className="relative w-full max-w-xl bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-slide-up sm:animate-none"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Mobile Pull Handle */}
                  <div className="sm:hidden flex justify-center py-2 shrink-0">
                    <div className="w-10 h-1 bg-gray-300 dark:bg-zinc-700 rounded-full" />
                  </div>

                  <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800/60 shrink-0">
                    <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg">
                        <Sparkles size={18} />
                      </div>
                      <h3 className="text-base font-bold">
                        {t('homeView.deepResearchModalTitle')}
                      </h3>
                    </div>
                    <button
                      onClick={closeDeepResearchModal}
                      className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-6">
                    {/* Step Progress */}
                    <div className="flex items-center gap-2 mb-8">
                      {[1, 2, 3].map(step => (
                        <div key={step} className="flex-1 flex items-center gap-2">
                          <div
                            className={clsx(
                              'h-1.5 flex-1 rounded-full transition-all duration-300',
                              step <= deepResearchStep
                                ? 'bg-primary-500'
                                : 'bg-gray-100 dark:bg-zinc-800',
                            )}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-6">
                      {deepResearchStep === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {t('homeView.deepResearchQuestionTitle')}
                            </label>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('homeView.deepResearchQuestionHint')}
                            </p>
                          </div>
                          <textarea
                            value={deepResearchQuestion}
                            onChange={event => setDeepResearchQuestion(event.target.value)}
                            placeholder={t('homeView.deepResearchQuestionPlaceholder')}
                            autoFocus
                            className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700/50 rounded-2xl px-4 py-3 text-sm placeholder-gray-400 dark:placeholder-gray-500 min-h-[120px] resize-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                          />

                          {/* Research Type Selector */}
                          <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {t('homeView.deepResearchTypeTitle')}
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setDeepResearchType('general')}
                                className={clsx(
                                  'flex-1 px-4 py-3 rounded-xl border-2 transition-all text-left',
                                  deepResearchType === 'general'
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600',
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={clsx(
                                      'w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center transition-all',
                                      deepResearchType === 'general'
                                        ? 'border-primary-500 bg-primary-500'
                                        : 'border-gray-300 dark:border-zinc-600',
                                    )}
                                  >
                                    {deepResearchType === 'general' && (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                      {t('homeView.deepResearchTypeGeneral')}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {t('homeView.deepResearchTypeGeneralDesc')}
                                    </div>
                                  </div>
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeepResearchType('academic')}
                                className={clsx(
                                  'flex-1 px-4 py-3 rounded-xl border-2 transition-all text-left',
                                  deepResearchType === 'academic'
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600',
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={clsx(
                                      'w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center transition-all',
                                      deepResearchType === 'academic'
                                        ? 'border-primary-500 bg-primary-500'
                                        : 'border-gray-300 dark:border-zinc-600',
                                    )}
                                  >
                                    {deepResearchType === 'academic' && (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                      {t('homeView.deepResearchTypeAcademic')}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {t('homeView.deepResearchTypeAcademicDesc')}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {deepResearchStep === 2 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {t('homeView.deepResearchScopeTitle')}
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setDeepResearchScopeAuto(prev => !prev)
                                if (!deepResearchScopeAuto) setDeepResearchScope('')
                              }}
                              className={clsx(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all',
                                deepResearchScopeAuto
                                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700',
                              )}
                            >
                              <span>{t('homeView.auto')}</span>
                              {deepResearchScopeAuto && <Check size={14} />}
                            </button>
                          </div>
                          <textarea
                            value={deepResearchScope}
                            onChange={event => setDeepResearchScope(event.target.value)}
                            placeholder={t('homeView.deepResearchScopePlaceholder')}
                            disabled={deepResearchScopeAuto}
                            className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700/50 rounded-2xl px-4 py-3 text-sm placeholder-gray-400 dark:placeholder-gray-500 min-h-[120px] resize-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                      )}

                      {deepResearchStep === 3 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {t('homeView.deepResearchOutputTitle')}
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setDeepResearchOutputAuto(prev => !prev)
                                if (!deepResearchOutputAuto) setDeepResearchOutput('')
                              }}
                              className={clsx(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all',
                                deepResearchOutputAuto
                                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700',
                              )}
                            >
                              <span>{t('homeView.auto')}</span>
                              {deepResearchOutputAuto && <Check size={14} />}
                            </button>
                          </div>
                          <textarea
                            value={deepResearchOutput}
                            onChange={event => setDeepResearchOutput(event.target.value)}
                            placeholder={t('homeView.deepResearchOutputPlaceholder')}
                            disabled={deepResearchOutputAuto}
                            className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700/50 rounded-2xl px-4 py-3 text-sm placeholder-gray-400 dark:placeholder-gray-500 min-h-[120px] resize-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-5 py-6 border-t border-gray-100 dark:border-zinc-800/60 bg-gray-50/50 dark:bg-zinc-900/30 shrink-0">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={closeDeepResearchModal}
                        className="px-5 py-2.5 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <div className="flex items-center gap-2">
                        {deepResearchStep > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeepResearchStep(step => Math.max(1, step - 1))}
                            className="px-5 py-2.5 text-sm font-bold rounded-xl border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-zinc-800 transition-all"
                          >
                            {t('homeView.deepResearchBack')}
                          </button>
                        )}
                        {deepResearchStep < 3 ? (
                          <button
                            type="button"
                            disabled={!deepResearchQuestion.trim()}
                            onClick={() => setDeepResearchStep(step => Math.min(3, step + 1))}
                            className="px-6 py-2.5 text-sm font-bold rounded-xl bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 disabled:shadow-none"
                          >
                            {t('homeView.deepResearchNext')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!deepResearchQuestion.trim()}
                            onClick={handleStartDeepResearch}
                            className="px-6 py-2.5 text-sm font-bold rounded-xl bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                          >
                            <Sparkles size={16} />
                            {t('homeView.deepResearchStart')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </div>
      </div>
    </div>
  )
}

export default HomeView
