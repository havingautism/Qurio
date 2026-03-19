import { useEffect, useMemo, useState } from 'react'
import { conversationRoute } from '../router'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { getConversation, isExpertConversation } from '../lib/conversationsService'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
import DeepResearchChatInterface from '../components/DeepResearchChatInterface'
import ConversationLoadingOverlay from '../components/ConversationLoadingOverlay'
import ConversationErrorState from '../components/ConversationErrorState'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

const ConversationView = () => {
  const { conversationId } = conversationRoute.useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { spaces, deepResearchSpace, isSidebarPinned, spacesLoading } = useAppContext()
  const { optimisticSelection, clearOptimisticSelection, messagesLength } = useChatStore(
    useShallow(state => ({
      optimisticSelection: state.optimisticSelection,
      clearOptimisticSelection: state.clearOptimisticSelection,
      messagesLength: state.messages.length,
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
    const handleConversationPatched = event => {
      const patch = event?.detail || {}
      const patchedId = patch?.id ? String(patch.id) : ''
      if (!conversationId || patchedId !== String(conversationId)) return

      setConversation(prev => {
        const base = prev && typeof prev === 'object' ? prev : { id: conversationId }
        const next = { ...base, ...patch }
        if (patch.title_emojis !== undefined) {
          next.title_emojis = patch.title_emojis
        }
        return next
      })
    }

    window.addEventListener('conversation-patched', handleConversationPatched)
    return () => {
      window.removeEventListener('conversation-patched', handleConversationPatched)
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
  const systemContextPrefix = initialChatState?.systemContextPrefix || ''
  // Use useState to preserve scrapbookEntry even if location.state is cleared after navigation
  const [scrapbookEntry] = useState(() => initialChatState?.scrapbookEntry || null)

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
      <ConversationErrorState
        title="Failed to load conversation"
        description="This can happen when the session switches too quickly or the network is unstable. Try loading it again."
        details={fetchError?.message}
        onRetry={() => setReloadToken(prev => prev + 1)}
        onRefresh={() => window.location.reload()}
      />
    )
  }

  // Render the appropriate chat interface with the conversation data
  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
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
        systemContextPrefix={systemContextPrefix}
        scrapbookEntry={scrapbookEntry}
      />
      {shouldDelayRender && <ConversationLoadingOverlay text="Loading conversation..." />}
    </div>
  )
}

export default ConversationView
