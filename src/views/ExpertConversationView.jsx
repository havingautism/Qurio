// Expert conversation detail page — loads conversation data, renders ChatInterface with Expert config locked
// Differences from ConversationView: no type dispatch (always ChatInterface), expertMode forced true,
// space selection locked, ExpertMessageList replaces default MessageList
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useShallow } from 'zustand/react/shallow'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
import ExpertMessageList from '../components/ExpertMessageList'
import ConversationLoadingOverlay from '../components/ConversationLoadingOverlay'
import ConversationErrorState from '../components/ConversationErrorState'
import useChatStore from '../lib/chatStore'
import { getConversation } from '../lib/conversationsService'
import { expertConversationRoute } from '../router'

const ExpertConversationView = () => {
  const { conversationId } = expertConversationRoute.useParams()
  const location = useLocation()
  const { spaces, isSidebarPinned, spacesLoading } = useAppContext()
  // optimisticSelection: temporary space/agent selection from chatStore (set when navigating from sidebar)
  const { optimisticSelection, clearOptimisticSelection } = useChatStore(
    useShallow(state => ({
      optimisticSelection: state.optimisticSelection,
      clearOptimisticSelection: state.clearOptimisticSelection,
    })),
  )
  const [conversation, setConversation] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  // Initial state from HomeView/expert navigation (via navigate({ state }))
  const initialChatState = location.state

  // Fetch conversation data with retry (3 attempts, 220ms*attempt backoff, retriable errors only)
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
          if (!data) throw new Error('Conversation not found')
          setConversation(data)
          // Clear optimistic selection once real data is loaded
          if (optimisticSelection?.conversationId === conversationId) {
            clearOptimisticSelection()
          }
          return
        } catch (error) {
          if (cancelled) return
          const shouldRetry = attempt < maxAttempts && isRetriableError(error)
          if (shouldRetry) {
            await sleep(220 * attempt)
            continue
          }
          console.error('Failed to fetch expert conversation:', error)
          setFetchError(error)
          return
        }
      }
    }
    fetchConversation()
    return () => {
      cancelled = true
    }
  }, [conversationId, reloadToken, optimisticSelection?.conversationId, clearOptimisticSelection])

  // Listen for partial conversation updates (title, emoji, etc.) without full refetch
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

  // Initial state priority: location.state (from navigation) > optimisticSelection (from chatStore) > default
  const initialSpaceSelection = useMemo(() => {
    if (initialChatState?.initialSpaceSelection) return initialChatState.initialSpaceSelection
    if (optimisticMatch?.space) {
      return {
        mode: optimisticMatch.isManualSpaceSelection ? 'manual' : 'auto',
        space: optimisticMatch.space,
      }
    }
    return { mode: 'auto', space: null }
  }, [initialChatState, optimisticMatch])

  const initialAgentSelection = useMemo(() => {
    if (initialChatState?.initialAgentSelection) return initialChatState.initialAgentSelection
    if (optimisticMatch?.agentId) return { id: optimisticMatch.agentId }
    return null
  }, [initialChatState, optimisticMatch])

  const initialIsAgentAutoMode = useMemo(() => {
    if (initialChatState?.initialIsAgentAutoMode !== undefined) {
      return initialChatState.initialIsAgentAutoMode
    }
    if (optimisticMatch) return optimisticMatch.isAgentAutoMode
    return true
  }, [initialChatState, optimisticMatch])

  const initialMessage = initialChatState?.initialMessage || ''
  const initialAttachments = initialChatState?.initialAttachments || []
  const initialDocumentIds = initialChatState?.initialDocumentIds || []
  const initialToggles = {
    ...(initialChatState?.initialToggles || {}),
    expertMode: true, // Always force expertMode for this view
  }

  // Show loading overlay while waiting for data (only when no initialChatState to render immediately)
  const shouldDelayRender =
    !initialChatState &&
    !fetchError &&
    conversationId &&
    (spacesLoading || !conversation || conversation?._isPlaceholder)

  if (fetchError) {
    return (
      <ConversationErrorState
        title="Failed to load expert conversation"
        description="The conversation data could not be fetched just now. Please retry."
        details={fetchError?.message}
        onRetry={() => setReloadToken(prev => prev + 1)}
        onRefresh={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      <ChatInterface
        spaces={spaces}
        activeConversation={conversation}
        conversationId={conversationId}
        isSidebarPinned={isSidebarPinned}
        isSpaceSelectionLocked={true} // Expert conversations lock space, cannot switch
        initialMessage={initialMessage}
        initialAttachments={initialAttachments}
        initialDocumentIds={initialDocumentIds}
        initialToggles={initialToggles}
        initialSpaceSelection={initialSpaceSelection}
        initialAgentSelection={initialAgentSelection}
        initialIsAgentAutoMode={initialIsAgentAutoMode}
        MessageListComponent={ExpertMessageList} // Uses Expert-specific message list
      />
      {shouldDelayRender && <ConversationLoadingOverlay text="Loading expert conversation..." />}
    </div>
  )
}

export default ExpertConversationView
