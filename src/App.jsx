import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import React, { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import ConfirmationModal from './components/ConfirmationModal'
import { GitHubPagesRedirectHandler } from './components/GitHubPagesRedirectHandler'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import SpaceModal from './components/SpaceModal'
import AgentModal from './components/AgentModal'
import { ToastProvider } from './contexts/ToastContext'
import { listConversations } from './lib/conversationsService'
import { loadSettings } from './lib/settings'
import { createAgent, deleteAgent, listAgents, updateAgent } from './lib/agentsService'
import {
  createSpace,
  deleteSpace,
  listSpaces,
  updateSpace,
  updateSpaceAgents,
} from './lib/spacesService'
import { initSupabase } from './lib/supabase'
import { applyTheme } from './lib/themes'
import i18n from './lib/i18n' // Initialize i18next

export const AppContext = React.createContext(null)
export const useAppContext = () => React.useContext(AppContext)

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
  const [agentsLoading, setAgentsLoading] = useState(false)

  // Conversations Data
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [spacesLoading, setSpacesLoading] = useState(false)

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
        setAgents(prev => prev.map(item => (item.id === data.id ? data : item)))
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
          setSpaces(data)
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

  // Load agents from Supabase on mount
  useEffect(() => {
    const load = async () => {
      setAgentsLoading(true)
      try {
        initSupabase()
        const { data, error } = await listAgents()
        if (!error && data) {
          setAgents(data)
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
    const { agentIds = [], ...spacePayload } = payload || {}
    if (editingSpace) {
      const { data, error } = await updateSpace(editingSpace.id, spacePayload)
      if (!error && data) {
        setSpaces(prev => prev.map(s => (s.id === data.id ? data : s)))
        await updateSpaceAgents(data.id, agentIds)
      } else {
        console.error('Update space failed:', error)
      }
    } else {
      const { data, error } = await createSpace(spacePayload)
      if (!error && data) {
        setSpaces(prev => [...prev, data])
        await updateSpaceAgents(data.id, agentIds)
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
            <div className="flex h-dvh overflow-hidden bg-background text-foreground font-sans selection:bg-primary-500/30">
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
