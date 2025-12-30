import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import React, { useEffect, useRef, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import AgentModal from './components/AgentModal'
import ConfirmationModal from './components/ConfirmationModal'
import { GitHubPagesRedirectHandler } from './components/GitHubPagesRedirectHandler'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import SpaceModal from './components/SpaceModal'
import { ToastProvider } from './contexts/ToastContext'
import { createAgent, deleteAgent, listAgents, updateAgent } from './lib/agentsService'
import { listConversations } from './lib/conversationsService'
import {
  DEEP_RESEARCH_AGENT_DESCRIPTION,
  DEEP_RESEARCH_AGENT_NAME,
  DEEP_RESEARCH_AGENT_PROMPT,
  DEEP_RESEARCH_EMOJI,
  DEEP_RESEARCH_PROFILE,
  DEEP_RESEARCH_SPACE_DESCRIPTION,
  DEEP_RESEARCH_SPACE_LABEL,
} from './lib/deepResearchDefaults'
import i18n from './lib/i18n' // Initialize i18next
import { loadSettings, updateMemorySettings } from './lib/settings'
import {
  createSpace,
  deleteSpace,
  listSpaces,
  updateSpace,
  updateSpaceAgents,
} from './lib/spacesService'
import { fetchRemoteSettings, initSupabase } from './lib/supabase'
import { applyTheme } from './lib/themes'

export const AppContext = React.createContext(null)
export const useAppContext = () => React.useContext(AppContext)

const isDeepResearchSpace = space => space?.isDeepResearch || space?.is_deep_research

const isDeepResearchAgent = agent => agent?.isDeepResearch || agent?.is_deep_research

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  // Initialize theme based on system preference or default to dark
  const [theme, setTheme] = useState('system') // 'light' | 'dark' | 'system'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Space Modal State
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false)
  const [editingSpace, setEditingSpace] = useState(null)

  // Agent Modal State
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)

  // Mobile Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Spaces Data
  const [spaces, setSpaces] = useState([])

  // Agents Data
  const [agents, setAgents] = useState([])
  const [agentsLoading, setAgentsLoading] = useState(true)

  // Conversations Data
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [spacesLoading, setSpacesLoading] = useState(true)

  // Sidebar pin state
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    const saved = localStorage.getItem('sidebar-pinned')
    return saved === 'true'
  })

  // Global confirmation dialog state
  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDangerous: false,
    onConfirm: null,
    onClose: null,
  })

  // Extract conversation ID from URL
  const activeConversationId = React.useMemo(() => {
    const match = location.pathname.match(/\/conversation\/(.+)/)
    return match ? match[1] : null
  }, [location])
  const isShareRoute = location.pathname.includes('/share')

  // Derive current view from location (removed unused logic)
  // const currentView = React.useMemo(() => { ... })

  // Reset scroll on route changes (only for non-conversation routes)
  useEffect(() => {
    // Don't reset scroll for conversation routes to maintain scroll position
    const isConversationRoute =
      location.pathname.includes('/conversation/') || location.pathname.includes('/new_chat')

    if (!isConversationRoute) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.body?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }, [location.pathname, location.search])

  useEffect(() => {
    const root = document.documentElement
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    const applyTheme = t => {
      if (t === 'dark' || (t === 'system' && systemTheme === 'dark')) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    applyTheme(theme)

    // Listener for system theme changes if in system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // Apply User Configured Theme Color
  useEffect(() => {
    const applyConfiguredTheme = () => {
      const settings = loadSettings()
      if (settings.themeColor) {
        applyTheme(settings.themeColor)
      }
    }

    // Apply immediately
    applyConfiguredTheme()

    // Re-apply on settings change
    const handleSettingsChange = () => {
      applyConfiguredTheme()
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    return () => window.removeEventListener('settings-changed', handleSettingsChange)
  }, [])

  // Apply User Configured Message Font Size
  useEffect(() => {
    const applyFontSize = () => {
      const settings = loadSettings()
      const fontSizeMap = {
        small: '14px',
        medium: '16px',
        large: '18px',
        'extra-large': '20px',
      }
      if (settings.fontSize && fontSizeMap[settings.fontSize]) {
        document.documentElement.style.setProperty(
          '--message-font-size',
          fontSizeMap[settings.fontSize],
        )
      }
    }

    applyFontSize()

    window.addEventListener('settings-changed', applyFontSize)
    return () => window.removeEventListener('settings-changed', applyFontSize)
  }, [])

  // Sync Remote Settings to Memory on Mount
  useEffect(() => {
    const syncRemoteSettings = async () => {
      // 1. Ensure Client is initialized (reads from LocalStorage/Env)
      initSupabase()

      // 2. Fetch API Keys from DB
      const { data } = await fetchRemoteSettings()

      // 3. Update Memory Cache if found
      if (data) {
        updateMemorySettings(data)
        // Trigger re-render of components relying on settings
        window.dispatchEvent(new Event('settings-changed'))
      }
    }

    syncRemoteSettings()
  }, [])

  const cycleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  const handleNavigate = view => {
    setIsSidebarOpen(false)
    switch (view) {
      case 'home':
        navigate({ to: '/new_chat' })
        break
      case 'spaces':
        navigate({ to: '/spaces' })
        break
      case 'agents':
        navigate({ to: '/agents' })
        break
      case 'library':
        navigate({ to: '/library' })
        break
      case 'bookmarks':
        navigate({ to: '/bookmarks' })
        break
      case 'chat':
        navigate({ to: '/new_chat' })
        break
      default:
        navigate({ to: '/' })
    }
  }

  const handleNavigateToSpace = space => {
    setIsSidebarOpen(false)
    if (space) {
      navigate({
        to: '/space/$spaceId',
        params: { spaceId: String(space.id) },
      })
    } else {
      navigate({ to: '/spaces' })
    }
  }

  const handleCreateSpace = () => {
    setEditingSpace(null)
    setIsSpaceModalOpen(true)
  }

  const handleEditSpace = space => {
    setEditingSpace(space)
    setIsSpaceModalOpen(true)
  }

  const handleCreateAgent = () => {
    setEditingAgent(null)
    setIsAgentModalOpen(true)
  }

  const handleEditAgent = agent => {
    setEditingAgent(agent)
    setIsAgentModalOpen(true)
  }

  const handleSaveAgent = async agent => {
    if (editingAgent) {
      const { data, error } = await updateAgent(editingAgent.id, agent)
      if (!error && data) {
        const isDeepResearch =
          editingAgent?.isDeepResearchSystem || isDeepResearchAgent(data)
        setAgents(prev =>
          prev.map(item =>
            item.id === data.id
              ? { ...data, isDeepResearchSystem: isDeepResearch }
              : item,
          ),
        )
      } else {
        console.error('Update agent failed:', error)
        throw error
      }
    } else {
      const { data, error } = await createAgent(agent)
      if (!error && data) {
        setAgents(prev => [...prev, data])
      } else {
        console.error('Create agent failed:', error)
        throw error
      }
    }
    setEditingAgent(null)
  }

  const handleDeleteAgent = async id => {
    const target = agents.find(agent => agent.id === id)
    if (target?.isDefault) {
      return
    }
    const { error } = await deleteAgent(id)
    if (!error) {
      setAgents(prev => prev.filter(agent => agent.id !== id))
    } else {
      console.error('Delete agent failed:', error)
    }
    setIsAgentModalOpen(false)
    setEditingAgent(null)
  }

  const handleOpenConversation = conversation => {
    setIsSidebarOpen(false)
    if (conversation?.id) {
      navigate({
        to: '/conversation/$conversationId',
        params: { conversationId: String(conversation.id) },
      })
    } else {
      navigate({ to: '/new_chat' })
    }
  }

  // Load spaces from Supabase on mount
  useEffect(() => {
    const load = async () => {
      setSpacesLoading(true)
      try {
        initSupabase()
        const { data, error } = await listSpaces()
        if (!error && data) {
          const annotated = data.map(space => ({
            ...space,
            isDeepResearchSystem: isDeepResearchSpace(space),
            isDeepResearch: isDeepResearchSpace(space),
          }))
          setSpaces(annotated)
        } else {
          console.error('Failed to fetch spaces:', error)
        }
      } catch (err) {
        console.error('Unexpected error fetching spaces:', err)
      } finally {
        setSpacesLoading(false)
      }
    }
    load()
  }, [])

  const creatingDefaultAgentRef = useRef(false)
  const cleaningDuplicatesRef = useRef(false)

  // Load agents from Supabase on mount
  useEffect(() => {
    const load = async () => {
      setAgentsLoading(true)
      try {
        initSupabase()
        const { data, error } = await listAgents()
        if (!error && data) {
          const settings = loadSettings()
          let nextAgents = data.map(agent => ({
            ...agent,
            isDeepResearchSystem: isDeepResearchAgent(agent),
            isDeepResearch: isDeepResearchAgent(agent),
          }))
          const defaultAgents = data.filter(agent => agent.isDefault)
          if (defaultAgents.length > 1) {
            const keepDefault = defaultAgents[0]
            const demoteDefaults = defaultAgents.slice(1)
            await Promise.all(
              demoteDefaults.map(agent => updateAgent(agent.id, { isDefault: false })),
            )
            nextAgents = data.map(agent =>
              agent.id === keepDefault.id
                ? keepDefault
                : agent.isDefault
                  ? { ...agent, isDefault: false }
                  : agent,
            )
          }
          const existingDefault = nextAgents.find(agent => agent.isDefault)
          if (!existingDefault && !creatingDefaultAgentRef.current) {
            creatingDefaultAgentRef.current = true
            const { data: createdDefault, error: createError } = await createAgent({
              name: 'Default Agent',
              description: 'Fallback agent (non-editable).',
              prompt: settings.systemPrompt || '',
              emoji: '',
              isDefault: true,
              provider: 'gemini',
              liteModel: '',
              defaultModel: '',
              responseLanguage: settings.llmAnswerLanguage || '',
              baseTone: settings.baseTone || '',
              traits: settings.traits || '',
              warmth: settings.warmth || '',
              enthusiasm: settings.enthusiasm || '',
              headings: settings.headings || '',
              emojis: settings.emojis || '',
              customInstruction: settings.customInstruction || '',
              temperature: null,
              topP: null,
              frequencyPenalty: null,
              presencePenalty: null,
            })
            if (!createError && createdDefault) {
              nextAgents = [...data, createdDefault]
            } else {
              console.error('Create default agent failed:', createError)
              creatingDefaultAgentRef.current = false
            }
          } else {
            const patch = {}
            if (!existingDefault.description) patch.description = 'Fallback agent (non-editable).'
            if (!existingDefault.prompt && settings.systemPrompt)
              patch.prompt = settings.systemPrompt
            if (!existingDefault.responseLanguage && settings.llmAnswerLanguage)
              patch.responseLanguage = settings.llmAnswerLanguage
            if (!existingDefault.baseTone && settings.baseTone) patch.baseTone = settings.baseTone
            if (!existingDefault.traits && settings.traits) patch.traits = settings.traits
            if (!existingDefault.warmth && settings.warmth) patch.warmth = settings.warmth
            if (!existingDefault.enthusiasm && settings.enthusiasm)
              patch.enthusiasm = settings.enthusiasm
            if (!existingDefault.headings && settings.headings) patch.headings = settings.headings
            if (!existingDefault.emojis && settings.emojis) patch.emojis = settings.emojis
            if (!existingDefault.customInstruction && settings.customInstruction)
              patch.customInstruction = settings.customInstruction
            if (Object.keys(patch).length > 0) {
              const { data: updatedDefault, error: updateError } = await updateAgent(
                existingDefault.id,
                patch,
              )
              if (!updateError && updatedDefault) {
                nextAgents = data.map(agent =>
                  agent.id === updatedDefault.id ? updatedDefault : agent,
                )
              } else {
                console.error('Update default agent failed:', updateError)
              }
            }
          }
          setAgents(nextAgents)
        } else {
          console.error('Failed to fetch agents:', error)
        }
      } catch (err) {
        console.error('Unexpected error fetching agents:', err)
      } finally {
        setAgentsLoading(false)
      }
    }
    load()
  }, [])

  const ensuringDeepResearchRef = useRef(false)

  useEffect(() => {
    const ensureDeepResearchAssets = async () => {
      if (ensuringDeepResearchRef.current) return
      if (spacesLoading || agentsLoading) return
      if (!spaces.length && !agents.length) return

      const settings = loadSettings()
      const defaultAgent = agents.find(agent => agent.isDefault) || null
      const candidateAgents = agents.filter(agent => isDeepResearchAgent(agent))
      const candidateSpaces = spaces.filter(space => isDeepResearchSpace(space))
      const existingAgent = candidateAgents[0] || null
      const existingSpace = candidateSpaces[0] || null

      if (existingAgent && existingSpace) {
        return
      }

      ensuringDeepResearchRef.current = true
      try {
        let deepAgent = existingAgent
        if (!deepAgent) {
          const { data: createdAgent, error: agentError } = await createAgent({
            name: DEEP_RESEARCH_AGENT_NAME,
            description: DEEP_RESEARCH_AGENT_DESCRIPTION,
            prompt: DEEP_RESEARCH_AGENT_PROMPT,
            emoji: DEEP_RESEARCH_EMOJI,
            isDefault: false,
            isDeepResearch: true,
            provider: defaultAgent?.provider || 'gemini',
            liteModel: defaultAgent?.liteModel || '',
            defaultModel: defaultAgent?.defaultModel || '',
            responseLanguage: settings.llmAnswerLanguage || '',
            baseTone: DEEP_RESEARCH_PROFILE.baseTone,
            traits: DEEP_RESEARCH_PROFILE.traits,
            warmth: DEEP_RESEARCH_PROFILE.warmth,
            enthusiasm: DEEP_RESEARCH_PROFILE.enthusiasm,
            headings: DEEP_RESEARCH_PROFILE.headings,
            emojis: DEEP_RESEARCH_PROFILE.emojis,
            customInstruction: settings.customInstruction || '',
            temperature: null,
            topP: null,
            frequencyPenalty: null,
            presencePenalty: null,
          })
          if (!agentError && createdAgent) {
            deepAgent = { ...createdAgent, isDeepResearchSystem: true }
            setAgents(prev => [...prev, deepAgent])
          } else {
            console.error('Create deep research agent failed:', agentError)
          }
        } else {
          if (!existingAgent.isDeepResearchSystem) {
            setAgents(prev =>
              prev.map(agent =>
                agent.id === existingAgent.id
                  ? { ...agent, isDeepResearchSystem: true }
                  : agent,
              ),
            )
          }
        }

        if (deepAgent?.id) {
          const patch = {}
          if (deepAgent.name !== DEEP_RESEARCH_AGENT_NAME) patch.name = DEEP_RESEARCH_AGENT_NAME
          if (deepAgent.description !== DEEP_RESEARCH_AGENT_DESCRIPTION)
            patch.description = DEEP_RESEARCH_AGENT_DESCRIPTION
          if (deepAgent.prompt !== DEEP_RESEARCH_AGENT_PROMPT)
            patch.prompt = DEEP_RESEARCH_AGENT_PROMPT
          if (deepAgent.emoji !== DEEP_RESEARCH_EMOJI) patch.emoji = DEEP_RESEARCH_EMOJI
          if (!deepAgent.isDeepResearch) patch.isDeepResearch = true
          if (deepAgent.baseTone !== DEEP_RESEARCH_PROFILE.baseTone)
            patch.baseTone = DEEP_RESEARCH_PROFILE.baseTone
          if (deepAgent.traits !== DEEP_RESEARCH_PROFILE.traits)
            patch.traits = DEEP_RESEARCH_PROFILE.traits
          if (deepAgent.warmth !== DEEP_RESEARCH_PROFILE.warmth)
            patch.warmth = DEEP_RESEARCH_PROFILE.warmth
          if (deepAgent.enthusiasm !== DEEP_RESEARCH_PROFILE.enthusiasm)
            patch.enthusiasm = DEEP_RESEARCH_PROFILE.enthusiasm
          if (deepAgent.headings !== DEEP_RESEARCH_PROFILE.headings)
            patch.headings = DEEP_RESEARCH_PROFILE.headings
          if (deepAgent.emojis !== DEEP_RESEARCH_PROFILE.emojis)
            patch.emojis = DEEP_RESEARCH_PROFILE.emojis
          if (Object.keys(patch).length > 0) {
            const { data: updatedAgent, error: updateError } = await updateAgent(
              deepAgent.id,
              patch,
            )
            if (!updateError && updatedAgent) {
              deepAgent = { ...updatedAgent, isDeepResearchSystem: true }
              setAgents(prev =>
                prev.map(agent => (agent.id === updatedAgent.id ? deepAgent : agent)),
              )
            } else {
              console.error('Update deep research agent failed:', updateError)
            }
          }
        }

        let deepSpace = existingSpace
        if (!deepSpace) {
          const { data: createdSpace, error: spaceError } = await createSpace({
            emoji: DEEP_RESEARCH_EMOJI,
            label: DEEP_RESEARCH_SPACE_LABEL,
            description: DEEP_RESEARCH_SPACE_DESCRIPTION,
            isDeepResearch: true,
          })
          if (!spaceError && createdSpace) {
            deepSpace = { ...createdSpace, isDeepResearchSystem: true }
            setSpaces(prev => [...prev, deepSpace])
          } else {
            console.error('Create deep research space failed:', spaceError)
          }
        } else {
          if (!existingSpace.isDeepResearchSystem) {
            setSpaces(prev =>
              prev.map(space =>
                space.id === existingSpace.id ? { ...space, isDeepResearchSystem: true } : space,
              ),
            )
          }
        }

        if (deepSpace?.id) {
          const patch = {}
          if (deepSpace.label !== DEEP_RESEARCH_SPACE_LABEL) patch.label = DEEP_RESEARCH_SPACE_LABEL
          if (deepSpace.description !== DEEP_RESEARCH_SPACE_DESCRIPTION)
            patch.description = DEEP_RESEARCH_SPACE_DESCRIPTION
          if (deepSpace.emoji !== DEEP_RESEARCH_EMOJI) patch.emoji = DEEP_RESEARCH_EMOJI
          if (!deepSpace.isDeepResearch) patch.isDeepResearch = true
          if (Object.keys(patch).length > 0) {
            const { data: updatedSpace, error: updateError } = await updateSpace(
              deepSpace.id,
              patch,
            )
            if (!updateError && updatedSpace) {
              deepSpace = { ...updatedSpace, isDeepResearchSystem: true }
              setSpaces(prev =>
                prev.map(space => (space.id === updatedSpace.id ? deepSpace : space)),
              )
            } else {
              console.error('Update deep research space failed:', updateError)
            }
          }
        }

        if (deepSpace?.id && deepAgent?.id) {
          await updateSpaceAgents(deepSpace.id, [deepAgent.id], deepAgent.id)
        }
      } finally {
        ensuringDeepResearchRef.current = false
      }
    }

    ensureDeepResearchAssets()
  }, [agents, agentsLoading, spaces, spacesLoading])

  useEffect(() => {
    const cleanupDuplicates = async () => {
      if (cleaningDuplicatesRef.current) return
      if (agentsLoading || spacesLoading) return
      if (!agents.length && !spaces.length) return
      cleaningDuplicatesRef.current = true

      try {
        const defaultAgents = agents.filter(agent => agent.isDefault)
        if (defaultAgents.length > 1) {
          const sortedDefaults = [...defaultAgents].sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
            return aTime - bTime
          })
          const [keepDefault, ...removeDefaults] = sortedDefaults
          for (const agent of removeDefaults) {
            const { error } = await deleteAgent(agent.id)
            if (!error) {
              setAgents(prev => prev.filter(item => item.id !== agent.id))
            } else {
              console.error('Failed to delete duplicate default agent:', error)
            }
          }
          if (keepDefault) {
            setAgents(prev =>
              prev.map(agent =>
                agent.id === keepDefault.id ? { ...agent, isDefault: true } : agent,
              ),
            )
          }
        }
      } finally {
        cleaningDuplicatesRef.current = false
      }
    }

    cleanupDuplicates()
  }, [agents, agentsLoading, spaces, spacesLoading])

  // Load conversations from Supabase on mount
  useEffect(() => {
    const loadConversations = async () => {
      setConversationsLoading(true)
      try {
        const { data, error } = await listConversations({ limit: 50 })
        if (!error && data) {
          setConversations(data)
        } else {
          console.error('Failed to fetch conversations:', error)
        }
      } catch (err) {
        console.error('Unexpected error fetching conversations:', err)
      } finally {
        setConversationsLoading(false)
      }
    }
    loadConversations()

    // Listen for conversation changes
    const handleConversationsChanged = () => loadConversations()
    window.addEventListener('conversations-changed', handleConversationsChanged)
    return () => {
      window.removeEventListener('conversations-changed', handleConversationsChanged)
    }
  }, [])

  const handleSaveSpace = async payload => {
    const { agentIds = [], defaultAgentId = null, ...spacePayload } = payload || {}
    if (editingSpace) {
      const { data, error } = await updateSpace(editingSpace.id, spacePayload)
      if (!error && data) {
        setSpaces(prev => prev.map(s => (s.id === data.id ? data : s)))
        await updateSpaceAgents(data.id, agentIds, defaultAgentId)
      } else {
        console.error('Update space failed:', error)
      }
    } else {
      const { data, error } = await createSpace(spacePayload)
      if (!error && data) {
        setSpaces(prev => [...prev, data])
        await updateSpaceAgents(data.id, agentIds, defaultAgentId)
      } else {
        console.error('Create space failed:', error)
      }
    }
    setIsSpaceModalOpen(false)
    setEditingSpace(null)
  }

  const handleDeleteSpace = async id => {
    const { error } = await deleteSpace(id)
    if (!error) {
      setSpaces(prev => prev.filter(s => s.id !== id))
      // Navigate away if currently viewing the deleted space
      if (location.pathname === `/space/${id}`) {
        navigate({ to: '/spaces' })
      }
    } else {
      console.error('Delete space failed:', error)
    }
    setIsSpaceModalOpen(false)
    setEditingSpace(null)
  }

  // Global confirmation dialog handler
  const showConfirmation = options => {
    setConfirmation({
      isOpen: true,
      title: options.title || 'Confirm',
      message: options.message || 'Are you sure?',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      isDangerous: options.isDangerous || false,
      onConfirm: options.onConfirm || null,
      onClose: options.onClose || null,
    })
  }

  // Remove old route sync logic - React Router handles this automatically

  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <GitHubPagesRedirectHandler />
        <AppContext.Provider
          value={{
            spaces,
            agents,
            defaultAgent: agents.find(agent => agent.isDefault) || null,
            deepResearchSpace:
              spaces.find(space => space.isDeepResearchSystem) || null,
            deepResearchAgent:
              agents.find(agent => agent.isDeepResearchSystem) || null,
            conversations,
            conversationsLoading,
            spacesLoading,
            agentsLoading,
            onNavigate: handleNavigate,
            onNavigateToSpace: handleNavigateToSpace,
            onOpenConversation: handleOpenConversation,
            onCreateSpace: handleCreateSpace,
            onEditSpace: handleEditSpace,
            onCreateAgent: handleCreateAgent,
            onEditAgent: handleEditAgent,
            isSidebarPinned,
            toggleSidebar: () => setIsSidebarOpen(prev => !prev),
            showConfirmation,
          }}
        >
          {isShareRoute ? (
            <Outlet />
          ) : (
            <div className="fixed inset-0 flex overflow-hidden bg-background text-foreground font-sans selection:bg-primary-500/30">
              <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onNavigate={handleNavigate}
                onNavigateToSpace={handleNavigateToSpace}
                onCreateSpace={handleCreateSpace}
                onEditSpace={handleEditSpace}
                onOpenConversation={handleOpenConversation}
                spaces={spaces}
                spacesLoading={spacesLoading}
                agents={agents}
                agentsLoading={agentsLoading}
                onCreateAgent={handleCreateAgent}
                onEditAgent={handleEditAgent}
                theme={theme}
                onToggleTheme={cycleTheme}
                isSidebarPinned={isSidebarPinned}
                onPinChange={setIsSidebarPinned}
                activeConversationId={activeConversationId}
              />
              <div
                className={`flex-1 relative transition-all duration-300 ml-0 w-full flex flex-col overflow-hidden`}
              >
                {/* Mobile Header - Hide on Chat/Conversation routes as they have their own header */}
                {!location.pathname.includes('/conversation/') &&
                  !location.pathname.includes('/new_chat') && (
                    <div className="md:hidden h-14 shrink-0 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-background z-30">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setIsSidebarOpen(true)}
                          className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                          </svg>
                        </button>
                        <span className="font-semibold text-gray-900 dark:text-white">Qurio</span>
                      </div>
                      <button
                        onClick={() => handleNavigate('home')}
                        className="p-2 -mr-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12h14"></path>
                          <path d="M12 5v14"></path>
                        </svg>
                      </button>
                    </div>
                  )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <Outlet />
                </div>
              </div>
              <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
              <SpaceModal
                isOpen={isSpaceModalOpen}
                onClose={() => setIsSpaceModalOpen(false)}
                editingSpace={editingSpace}
                onSave={handleSaveSpace}
                onDelete={handleDeleteSpace}
              />
              <AgentModal
                isOpen={isAgentModalOpen}
                onClose={() => setIsAgentModalOpen(false)}
                editingAgent={editingAgent}
                onSave={handleSaveAgent}
                onDelete={handleDeleteAgent}
              />
              <ConfirmationModal
                isOpen={confirmation.isOpen}
                onClose={() => {
                  setConfirmation(prev => ({ ...prev, isOpen: false }))
                  confirmation.onClose?.()
                }}
                onConfirm={() => {
                  setConfirmation(prev => ({ ...prev, isOpen: false }))
                  confirmation.onConfirm?.()
                }}
                title={confirmation.title}
                message={confirmation.message}
                confirmText={confirmation.confirmText}
                cancelText={confirmation.cancelText}
                isDangerous={confirmation.isDangerous}
              />
            </div>
          )}
        </AppContext.Provider>
      </ToastProvider>
    </I18nextProvider>
  )
}

export default App
