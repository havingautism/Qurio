import { AlertCircle, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { conversationRoute } from '../router'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { getConversation, isExpertConversation } from '../lib/conversationsService'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
import DeepResearchChatInterface from '../components/DeepResearchChatInterface'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

const ConversationView = () => {
  const { conversationId } = conversationRoute.useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { spaces, deepResearchSpace, isSidebarPinned, spacesLoading } = useAppContext()
  const { optimisticSelection, clearOptimisticSelection } = useChatStore(
    useShallow(state => ({
      optimisticSelection: state.optimisticSelection,
      clearOptimisticSelection: state.clearOptimisticSelection,
    })),
  )
  const [conversation, setConversation] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Get initial chat state from router navigation state
  const initialChatState = location.state

  const [fetchError, setFetchError] = useState(null)

  // Effect to fetch conversation data when conversationId changes
  useEffect(() => {
    let cancelled = false

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

    const isRetriableError = error => {
      const message = String(error?.message || '').toLowerCase()
      return (
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('database error') ||
        message.includes('http 5')
      )
    }

    const fetchConversation = async () => {
      if (!conversationId) return

      setConversation(prev =>
        prev?.id === conversationId ? prev : { id: conversationId, _isPlaceholder: true },
      )
      setFetchError(null)

      const maxAttempts = 3
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const { data, error } = await getConversation(conversationId)
          if (cancelled) return
          if (error) throw error
          if (data) {
            const { isExpert, error: expertCheckError } = await isExpertConversation(conversationId)
            if (expertCheckError) {
              console.warn('Failed to check expert conversation marker:', expertCheckError)
            }
            if (!expertCheckError && isExpert) {
              navigate({
                to: '/expert/$conversationId',
                params: { conversationId: String(conversationId) },
                replace: true,
              })
              return
            }
            setConversation(data)
            if (optimisticSelection?.conversationId === conversationId) {
              clearOptimisticSelection()
            }
            return
          }
          throw new Error('Conversation not found')
        } catch (error) {
          if (cancelled) return
          const shouldRetry = attempt < maxAttempts && isRetriableError(error)
          if (shouldRetry) {
            await sleep(220 * attempt)
            continue
          }
          console.error('Failed to fetch conversation:', error)
          setFetchError(error)
          return
        }
      }
    }

    fetchConversation()
    return () => {
      cancelled = true
    }
  }, [
    conversationId,
    reloadToken,
    optimisticSelection?.conversationId,
    clearOptimisticSelection,
    navigate,
  ])

  const shouldDelayRender =
    !initialChatState &&
    !fetchError &&
    conversationId &&
    (spacesLoading || !conversation || conversation?._isPlaceholder)

  // Listen for conversation space updates
  useEffect(() => {
    const handleSpaceUpdated = async event => {
      const { conversationId: updatedId } = event.detail

      // If this is the current conversation, refetch its data
      if (updatedId === conversationId) {
        try {
          const { data } = await getConversation(conversationId)
          if (data) {
            setConversation(data)
          }
        } catch (error) {
          console.error('Failed to refetch conversation:', error)
        }
      }
    }

    window.addEventListener('conversation-space-updated', handleSpaceUpdated)

    return () => {
      window.removeEventListener('conversation-space-updated', handleSpaceUpdated)
    }
  }, [conversationId])

  useEffect(() => {
    const handleConversationChanged = async () => {
      if (!conversationId) return
      try {
        const { data } = await getConversation(conversationId)
        if (data) {
          setConversation(data)
        }
      } catch (error) {
        console.error('Failed to refetch conversation:', error)
      }
    }

    window.addEventListener('conversations-changed', handleConversationChanged)
    return () => {
      window.removeEventListener('conversations-changed', handleConversationChanged)
    }
  }, [conversationId])

  const optimisticMatch =
    optimisticSelection?.conversationId === conversationId ? optimisticSelection : null

  // Determine initial state - prioritize router state, then optimisticSelection
  const initialSpaceSelection = useMemo(() => {
    // First priority: router state from HomeView navigation
    if (initialChatState?.initialSpaceSelection) {
      return initialChatState.initialSpaceSelection
    }
    // Second priority: optimisticSelection from chatStore
    if (optimisticMatch?.space) {
      return {
        mode: optimisticMatch.isManualSpaceSelection ? 'manual' : 'auto',
        space: optimisticMatch.space,
      }
    }
    return { mode: 'auto', space: null }
  }, [initialChatState, optimisticMatch])

  const initialAgentSelection = useMemo(() => {
    // First priority: router state from HomeView navigation
    if (initialChatState?.initialAgentSelection) {
      return initialChatState.initialAgentSelection
    }
    // Second priority: optimisticSelection from chatStore
    if (optimisticMatch?.agentId) {
      return { id: optimisticMatch.agentId }
    }
    return null
  }, [initialChatState, optimisticMatch])

  const initialIsAgentAutoMode = useMemo(() => {
    // First priority: router state from HomeView navigation
    if (initialChatState?.initialIsAgentAutoMode !== undefined) {
      return initialChatState.initialIsAgentAutoMode
    }
    // Second priority: optimisticSelection from chatStore
    if (optimisticMatch) {
      return optimisticMatch.isAgentAutoMode
    }
    return true
  }, [initialChatState, optimisticMatch])

  const initialMessage = initialChatState?.initialMessage || ''
  const initialAttachments = initialChatState?.initialAttachments || []
  const initialDocumentIds = initialChatState?.initialDocumentIds || []
  const initialToggles = initialChatState?.initialToggles || {}

  const isDeepResearchConversation = useMemo(() => {
    if (initialChatState?.initialToggles?.deepResearch) return true
    const deepResearchId = deepResearchSpace?.id ? String(deepResearchSpace.id) : null
    if (!deepResearchId) return false
    if (conversation?.space_id && String(conversation.space_id) === deepResearchId) return true
    if (initialSpaceSelection?.space?.id) {
      return String(initialSpaceSelection.space.id) === deepResearchId
    }
    return false
  }, [
    conversation?.space_id,
    deepResearchSpace?.id,
    initialChatState?.initialToggles?.deepResearch,
    initialSpaceSelection?.space?.id,
  ])

  const ChatComponent = isDeepResearchConversation ? DeepResearchChatInterface : ChatInterface

  if (fetchError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="bg-card w-full max-w-md rounded-2xl border border-red-200/60 p-6 shadow-sm dark:border-red-900/60">
          <div className="mb-3 flex items-center gap-2 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Failed to load conversation</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            This can happen when the session switches too quickly or the network is unstable. Try
            loading it again.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setReloadToken(prev => prev + 1)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="border-border bg-background text-foreground hover:bg-accent rounded-lg border px-4 py-2 text-sm"
            >
              Refresh Page
            </button>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            {fetchError?.message ? `Details: ${fetchError.message}` : 'No additional error details.'}
          </p>
        </div>
      </div>
    )
  }

  if (shouldDelayRender) return null

  // Render the appropriate chat interface with the conversation data
  return (
    <ChatComponent
      spaces={spaces}
      activeConversation={conversation}
      conversationId={conversationId}
      isSidebarPinned={isSidebarPinned}
      isSpaceSelectionLocked={isDeepResearchConversation}
      initialMessage={initialMessage}
      initialAttachments={initialAttachments}
      initialDocumentIds={initialDocumentIds}
      initialToggles={initialToggles}
      initialSpaceSelection={initialSpaceSelection}
      initialAgentSelection={initialAgentSelection}
      initialIsAgentAutoMode={initialIsAgentAutoMode}
    />
  )
}

export default ConversationView
