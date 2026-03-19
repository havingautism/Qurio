import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import AgentModal from './components/AgentModal'
import ConfirmationModal from './components/ConfirmationModal'
import { GitHubPagesRedirectHandler } from './components/GitHubPagesRedirectHandler'
const SettingsModal = React.lazy(() => import('./components/SettingsModal'))
import ToolsModal from './components/ToolsModal'
import SkillsWorkshopModal from './components/SkillsWorkshopModal'
import Sidebar from './components/Sidebar'
import SpaceModal from './components/SpaceModal'
import DatabaseSetupModal from './components/DatabaseSetupModal'
import { ToastProvider } from './contexts/ToastContext'
import KnowledgeBaseModal from './components/KnowledgeBaseModal'
import {
  createAgent,
  deleteAgent,
  getAgentById,
  listAgents,
  updateAgent,
} from './lib/agentsService'
import {
  conversationEventHasScope,
  isExpertConversation,
  listConversations,
} from './lib/conversationsService'
import i18n from './lib/i18n' // Initialize i18next
import { getBackendUrl, loadSettings, updateMemorySettings } from './lib/settings'
import {
  createSpace,
  deleteSpace,
  listSpaces,
  updateSpace,
  updateSpaceAgents,
} from './lib/spacesService'
import { fetchRemoteSettings, initSupabase } from './lib/supabase'
import { applyTheme } from './lib/themes'
import { DeepResearchGuideProvider } from './contexts/DeepResearchGuideContext'
import {
  annotateSystemAgent,
  buildDefaultSystemAgentPayload,
  buildScrapbookSystemAgentPayload,
  DEFAULT_AGENT_ID,
  DEEP_RESEARCH_AGENT_ID,
  SCRAPBOOK_AGENT_ID,
  isDeepResearchSystemAgent,
} from './lib/systemAgents'
import { resolveDefaultAgentStartupAction } from './lib/systemAgentStartupPolicy'

export const AppContext = React.createContext(null)
export const useAppContext = () => React.useContext(AppContext)

const isDeepResearchSpace = space => space?.isDeepResearch || space?.is_deep_research

const isDeepResearchAgent = agent => isDeepResearchSystemAgent(agent)

const SYSTEM_AGENT_SYNC_KEYS = [
  'name',
  'description',
  'prompt',
  'emoji',
  'isDefault',
  'isDeepResearch',
  'isHidden',
  'provider',
  'defaultModelProvider',
  'liteModelProvider',
  'defaultModelSource',
  'liteModelSource',
  'useGlobalModelSettings',
  'liteModel',
  'defaultModel',
  'responseLanguage',
  'baseTone',
  'traits',
  'warmth',
  'enthusiasm',
  'headings',
  'emojis',
  'customInstruction',
  'temperature',
  'topP',
  'frequencyPenalty',
  'presencePenalty',
]

const SCRAPBOOK_AGENT_SYNC_KEYS = ['name', 'description', 'emoji', 'isHidden']

const buildAgentPatch = (currentAgent, nextAgent) => {
  const patch = {}
  for (const key of SYSTEM_AGENT_SYNC_KEYS) {
    if (!Object.is(currentAgent?.[key] ?? null, nextAgent?.[key] ?? null)) {
      patch[key] = nextAgent[key]
    }
  }
  return patch
}

const buildScopedAgentPatch = (currentAgent, nextAgent, keys) => {
  const patch = {}
  for (const key of keys) {
    if (!Object.is(currentAgent?.[key] ?? null, nextAgent?.[key] ?? null)) {
      patch[key] = nextAgent[key]
    }
  }
  return patch
}

const syncEmailMonitorProvider = async () => {
  try {
    await fetch(`${getBackendUrl()}/api/email/monitor/provider`, { method: 'POST' })
  } catch (error) {
    console.warn('Failed to sync email monitor provider:', error)
  }
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  // Initialize theme based on system preference or default to dark
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app-theme-mode') || 'system'
    }
    return 'system'
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDatabaseSetupOpen, setIsDatabaseSetupOpen] = useState(false)

  // Space Modal State
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false)
  const [editingSpace, setEditingSpace] = useState(null)

  // Agent Modal State
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)

  // Tools Modal State
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false)

  // Skills Workshop Modal State
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState(false)

  // Knowledge Base Modal State
  const [isKnowledgeBaseModalOpen, setIsKnowledgeBaseModalOpen] = useState(false)

  // Mobile Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Spaces Data
  const [spaces, setSpaces] = useState([])

  // Agents Data
  const [agents, setAgents] = useState([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const defaultAgent = agents.find(agent => agent.isDefault) || null
  const deepResearchSpace = spaces.find(space => space.isDeepResearchSystem) || null
  const deepResearchAgent = agents.find(agent => agent.isDeepResearchSystem) || null
  const scrapbookAgent = agents.find(agent => String(agent.id) === SCRAPBOOK_AGENT_ID) || null

  // Conversations Data
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [conversationsNextCursor, setConversationsNextCursor] = useState(null)
  const [conversationsHasMore, setConversationsHasMore] = useState(false)
  const [conversationStatuses, setConversationStatuses] = useState({})
  const setConversationStatus = useCallback((conversationId, status) => {
    if (!conversationId) return
    setConversationStatuses(prev => {
      if (prev[conversationId] === status) return prev
      return { ...prev, [conversationId]: status }
    })
  }, [])
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
    const match = location.pathname.match(/\/(conversation|deepresearch|expert)\/(.+)/)
    return match ? match[2] : null
  }, [location])

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

  const isActiveConversationStreaming =
    activeConversationId && conversationStatuses[activeConversationId] === 'loading'

  const confirmNavigationIfStreaming = useCallback(
    onProceed => {
      if (!isActiveConversationStreaming) {
        onProceed()
        return
      }
      showConfirmation({
        title: 'Leave current conversation?',
        message: 'The current reply is still streaming. Leaving will interrupt it.',
        confirmText: 'Leave',
        cancelText: 'Stay',
        onConfirm: onProceed,
      })
    },
    [isActiveConversationStreaming],
  )
  const isShareRoute = location.pathname.includes('/share')

  // Derive current view from location (removed unused logic)
  // const currentView = React.useMemo(() => { ... })

  // Reset scroll on route changes (only for non-conversation routes)
  useEffect(() => {
    // Don't reset scroll for conversation routes to maintain scroll position
    const isConversationRoute =
      location.pathname.includes('/conversation/') ||
      location.pathname.includes('/deepresearch/') ||
      location.pathname.includes('/new_chat')

    if (!isConversationRoute) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.body?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }, [location.pathname, location.search])

  // Combined theme application to avoid race conditions and ensure CSS variables are applied before first render
  useLayoutEffect(() => {
    const root = document.documentElement
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    // Apply dark/light mode class
    const applyDarkMode = t => {
      if (t === 'dark' || (t === 'system' && systemTheme === 'dark')) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    // Apply theme color CSS variables
    const applyThemeColor = () => {
      const settings = loadSettings()
      if (settings.themeColor) {
        applyTheme(settings.themeColor)
      }
    }

    // Apply both synchronously to prevent flash
    applyDarkMode(theme)
    applyThemeColor()

    // Save theme mode to localStorage
    localStorage.setItem('app-theme-mode', theme)

    // Listener for system theme changes if in system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyDarkMode('system')
      }
    }

    // Re-apply theme color on settings change
    const handleSettingsChange = () => {
      applyThemeColor()
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    window.addEventListener('settings-changed', handleSettingsChange)

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
      window.removeEventListener('settings-changed', handleSettingsChange)
    }
  }, [theme])

  // Apply User Configured Message Font Size
  useLayoutEffect(() => {
    const applyFontSize = () => {
      const settings = loadSettings()
      const desktopFontSizeMap = {
        small: '1rem',
        medium: '1.0625rem',
        large: '1.125rem',
        'extra-large': '1.25rem',
      }
      const mobileFontSizeMap = {
        small: '0.9375rem',
        medium: '1rem',
        large: '1.0625rem',
        'extra-large': '1.125rem',
      }
      const sizeKey = settings.fontSize
      if (!sizeKey || !desktopFontSizeMap[sizeKey]) return

      const root = document.documentElement
      root.style.setProperty('--message-font-size-desktop', desktopFontSizeMap[sizeKey])
      root.style.setProperty('--message-font-size-mobile', mobileFontSizeMap[sizeKey])
      root.style.setProperty('--message-font-size', desktopFontSizeMap[sizeKey])
    }

    applyFontSize()

    window.addEventListener('settings-changed', applyFontSize)
    return () => window.removeEventListener('settings-changed', applyFontSize)
  }, [])

  // Sync Remote Settings to Memory on Mount
  useEffect(() => {
    const syncRemoteSettings = async () => {
      const localSettings = loadSettings()
      const providerId = localSettings.databaseProvider
      if (!providerId) return

      // Ensure client is initialized
      initSupabase()

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

  // Keep backend email monitor provider aligned with the selected DB provider on app startup
  // and after DB settings changes, without requiring the user to open the Email panel first.
  useEffect(() => {
    syncEmailMonitorProvider()
    const handleDatabaseSettingsChanged = () => {
      syncEmailMonitorProvider()
    }
    window.addEventListener('database-settings-changed', handleDatabaseSettingsChanged)
    return () =>
      window.removeEventListener('database-settings-changed', handleDatabaseSettingsChanged)
  }, [])

  useEffect(() => {
    const settings = loadSettings()
    if (!settings.databaseProvider) {
      setIsDatabaseSetupOpen(true)
    }
  }, [location.pathname])

  useEffect(() => {
    const handleDbAuthFailed = () => {
      setIsSettingsOpen(false)
      setIsDatabaseSetupOpen(true)
    }

    window.addEventListener('db-auth-failed', handleDbAuthFailed)
    return () => window.removeEventListener('db-auth-failed', handleDbAuthFailed)
  }, [])

  const cycleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  const handleNavigate = view => {
    const proceed = () => {
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
        case 'scrapbook':
          navigate({ to: '/scrapbook' })
          break
        case 'deepResearch':
          navigate({ to: '/deepresearch' })
          break
        case 'expert':
          navigate({ to: '/expert' })
          break
        case 'chat':
          navigate({ to: '/new_chat' })
          break
        default:
          navigate({ to: '/' })
      }
    }
    confirmNavigationIfStreaming(proceed)
  }

  const handleNavigateToSpace = space => {
    const proceed = () => {
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
    confirmNavigationIfStreaming(proceed)
  }

  const handleOpenExpertGuide = () => {
    const proceed = () => {
      setIsSidebarOpen(false)
      navigate({
        to: '/expert',
        state: {
          openGuideAt: Date.now(),
        },
      })
    }
    confirmNavigationIfStreaming(proceed)
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
        const isDeepResearch = editingAgent?.isDeepResearchSystem || isDeepResearchAgent(data)
        setAgents(prev =>
          prev.map(item =>
            item.id === data.id ? { ...data, isDeepResearchSystem: isDeepResearch } : item,
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

  const handleOpenConversation = (conversation, source = 'default') => {
    const proceed = async () => {
      setIsSidebarOpen(false)
      if (conversation?.id) {
        const conversationId = String(conversation.id)
        const deepResearchId = spaces.find(space => space.isDeepResearchSystem)?.id || null
        const isDeepResearchConversation =
          deepResearchId && String(conversation.space_id) === String(deepResearchId)
        let isExpertModeConversation = source === 'expert'

        if (!isExpertModeConversation) {
          try {
            const { isExpert, error } = await isExpertConversation(conversationId)
            if (!error && isExpert) {
              isExpertModeConversation = true
            }
          } catch (error) {
            console.warn('Failed to detect expert conversation route target:', error)
          }
        }

        navigate({
          to: isExpertModeConversation
            ? '/expert/$conversationId'
            : isDeepResearchConversation
              ? '/deepresearch/$conversationId'
              : '/conversation/$conversationId',
          params: { conversationId },
        })
      } else {
        navigate({ to: '/new_chat' })
      }
    }
    confirmNavigationIfStreaming(proceed)
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

  // Load agents from Supabase
  const loadAgents = async () => {
    setAgentsLoading(true)
    try {
      initSupabase()
      const { data, error } = await listAgents({ excludeIds: [SCRAPBOOK_AGENT_ID] })
      if (!error && data) {
        const settings = loadSettings()
        let nextAgents = data.map(annotateSystemAgent)
        const existingDefault = nextAgents.find(agent => String(agent.id) === DEFAULT_AGENT_ID)
        const desiredDefault = buildDefaultSystemAgentPayload(settings)
        const defaultStartupAction = resolveDefaultAgentStartupAction(existingDefault)
        if (defaultStartupAction === 'create' && !creatingDefaultAgentRef.current) {
          creatingDefaultAgentRef.current = true
          const { data: createdDefault, error: createError } = await createAgent(desiredDefault)
          if (!createError && createdDefault) {
            nextAgents = [...nextAgents, annotateSystemAgent(createdDefault)]
          } else {
            console.error('Create default agent failed:', createError)
            creatingDefaultAgentRef.current = false
          }
        }

        const desiredScrapbook = buildScrapbookSystemAgentPayload(settings)
        let scrapbookToInject = null
        const { data: existingScrapbook, error: scrapbookLoadError } =
          await getAgentById(SCRAPBOOK_AGENT_ID)

        if (scrapbookLoadError) {
          console.error('Load scrapbook agent failed:', scrapbookLoadError)
        } else if (!existingScrapbook) {
          const { data: createdScrapbook, error: scrapbookCreateError } =
            await createAgent(desiredScrapbook)
          if (scrapbookCreateError) {
            console.error('Create scrapbook agent failed:', scrapbookCreateError)
          } else if (createdScrapbook) {
            scrapbookToInject = annotateSystemAgent(createdScrapbook)
          }
        } else {
          scrapbookToInject = existingScrapbook // already annotated by getAgentById -> mapAgent
          const scrapbookPatch = buildScopedAgentPatch(
            existingScrapbook,
            desiredScrapbook,
            SCRAPBOOK_AGENT_SYNC_KEYS,
          )
          if (Object.keys(scrapbookPatch).length > 0) {
            const { data: updatedScrapbook, error: scrapbookUpdateError } = await updateAgent(
              existingScrapbook.id,
              scrapbookPatch,
            )
            if (!scrapbookUpdateError && updatedScrapbook) {
              scrapbookToInject = annotateSystemAgent(updatedScrapbook)
            } else {
              console.error('Update scrapbook agent failed:', scrapbookUpdateError)
            }
          }
        }

        // Ensure Scrapbook Agent is in the final list
        if (scrapbookToInject) {
          const index = nextAgents.findIndex(a => String(a.id) === String(scrapbookToInject.id))
          if (index !== -1) {
            nextAgents[index] = scrapbookToInject
          } else {
            nextAgents.push(scrapbookToInject)
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

  // Load agents on mount and listen for changes
  useEffect(() => {
    loadAgents()

    const handleAgentsChanged = () => loadAgents()
    window.addEventListener('agents-changed', handleAgentsChanged)
    return () => {
      window.removeEventListener('agents-changed', handleAgentsChanged)
    }
  }, [])

  useEffect(() => {
    const cleanupDuplicates = async () => {
      if (cleaningDuplicatesRef.current) return
      if (agentsLoading || spacesLoading) return
      if (!agents.length && !spaces.length) return
      cleaningDuplicatesRef.current = true

      try {
        const defaultAgents = agents.filter(agent => String(agent.id) === DEFAULT_AGENT_ID)
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

        const deepResearchAgents = agents.filter(
          agent => String(agent.id) === DEEP_RESEARCH_AGENT_ID,
        )
        if (deepResearchAgents.length > 1) {
          const sortedDeepAgents = [...deepResearchAgents].sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
            return aTime - bTime
          })
          const [keepDeepResearch, ...removeDeepResearch] = sortedDeepAgents
          for (const agent of removeDeepResearch) {
            const { error } = await deleteAgent(agent.id)
            if (!error) {
              setAgents(prev => prev.filter(item => item.id !== agent.id))
            } else {
              console.error('Failed to delete duplicate deep research agent:', error)
            }
          }
          if (keepDeepResearch) {
            setAgents(prev =>
              prev.map(agent =>
                agent.id === keepDeepResearch.id
                  ? { ...agent, isDeepResearch: true, isDeepResearchSystem: true }
                  : agent,
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
        const { data, error, nextCursor, hasMore } = await listConversations({ limit: 50 })
        if (!error && data) {
          setConversations(data)
          setConversationsNextCursor(nextCursor || null)
          setConversationsHasMore(!!hasMore)
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
    const handleConversationsChanged = event => {
      if (!conversationEventHasScope(event, 'library')) return
      loadConversations()
    }
    const handleConversationPatched = event => {
      const patch = event?.detail || {}
      const id = patch?.id ? String(patch.id) : ''
      if (!id) return
      const { id: _, ...rest } = patch
      const hasPatchFields = Object.keys(rest).length > 0
      if (!hasPatchFields) return
      setConversations(prev => {
        const nowIso = new Date().toISOString()
        let found = false
        const next = (prev || []).map(conv => {
          if (String(conv?.id) !== id) return conv
          found = true
          return {
            ...conv,
            ...rest,
            updated_at: rest.updated_at || nowIso,
          }
        })
        return found ? next : prev
      })
    }
    window.addEventListener('conversations-changed', handleConversationsChanged)
    window.addEventListener('conversation-patched', handleConversationPatched)
    return () => {
      window.removeEventListener('conversations-changed', handleConversationsChanged)
      window.removeEventListener('conversation-patched', handleConversationPatched)
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

  // Remove old route sync logic - React Router handles this automatically

  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <GitHubPagesRedirectHandler />
        <DeepResearchGuideProvider
          deepResearchSpace={deepResearchSpace}
          deepResearchAgent={deepResearchAgent}
          defaultAgent={defaultAgent}
        >
          <AppContext.Provider
            value={{
              spaces,
              agents,
              defaultAgent,
              deepResearchSpace,
              deepResearchAgent,
              scrapbookAgent,
              conversations,
              conversationsLoading,
              conversationsNextCursor,
              conversationsHasMore,
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
              toggleSidebar: () => setIsSidebarOpen(true),
              conversationStatuses,
              setConversationStatus,
              showConfirmation,
            }}
          >
            {isShareRoute ? (
              <Outlet />
            ) : (
              <div className="bg-background text-foreground selection:bg-primary-500/30 fixed inset-0 flex overflow-hidden font-sans">
                <Sidebar
                  isOpen={isSidebarOpen}
                  onClose={() => setIsSidebarOpen(false)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenTools={() => setIsToolsModalOpen(true)}
                  onOpenSkills={() => setIsSkillsModalOpen(true)}
                  onOpenKnowledgeBase={() => setIsKnowledgeBaseModalOpen(true)}
                  onNavigate={handleNavigate}
                  onOpenExpertGuide={handleOpenExpertGuide}
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
                  className={`relative ml-0 flex w-full flex-1 flex-col overflow-hidden transition-all duration-300`}
                >
                  {/* Mobile Header - Hide on Chat/Conversation/Scrapbook/Main Views as they have their own header */}
                  {!location.pathname.includes('/conversation') &&
                    !location.pathname.includes('/deepresearch') &&
                    !location.pathname.includes('/expert') &&
                    !location.pathname.includes('/scrapbook') &&
                    !location.pathname.includes('/library') &&
                    !location.pathname.includes('/agents') &&
                    !location.pathname.includes('/space') &&
                    !location.pathname.includes('/bookmarks') &&
                    !location.pathname.includes('/new_chat') && (
                      <div className="relative z-30 h-20 shrink-0 md:hidden">
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 top-0 h-21 bg-linear-to-b from-white/68 via-white/28 to-transparent mask-[linear-gradient(to_bottom,black_58%,transparent)] opacity-100 backdrop-blur-xl dark:from-zinc-950/68 dark:via-zinc-950/28"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-start px-4 pt-4">
                          <div className="pointer-events-auto flex w-full items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="Open sidebar"
                                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="21"
                                  height="21"
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
                              <span className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                                Qurio
                              </span>
                            </div>
                            <button
                              onClick={() => handleNavigate('home')}
                              aria-label="New chat"
                              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="21"
                                height="21"
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
                        </div>
                      </div>
                    )}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <Outlet />
                  </div>
                </div>
                <React.Suspense fallback={null}>
                  <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    onOpenDatabaseSetup={() => {
                      setIsSettingsOpen(false)
                      setTimeout(() => setIsDatabaseSetupOpen(true), 150)
                    }}
                  />
                </React.Suspense>
                <DatabaseSetupModal
                  isOpen={isDatabaseSetupOpen}
                  onClose={() => setIsDatabaseSetupOpen(false)}
                />
                <ToolsModal isOpen={isToolsModalOpen} onClose={() => setIsToolsModalOpen(false)} />
                <SkillsWorkshopModal
                  isOpen={isSkillsModalOpen}
                  onClose={() => setIsSkillsModalOpen(false)}
                />
                <KnowledgeBaseModal
                  isOpen={isKnowledgeBaseModalOpen}
                  onClose={() => setIsKnowledgeBaseModalOpen(false)}
                />
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
        </DeepResearchGuideProvider>
      </ToastProvider>
    </I18nextProvider>
  )
}

export default App
