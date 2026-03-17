import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useLocation } from '@tanstack/react-router'
import { useShallow } from 'zustand/react/shallow'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
import ExpertMessageList from '../components/ExpertMessageList'
import ConversationLoadingOverlay from '../components/ConversationLoadingOverlay'
import useChatStore from '../lib/chatStore'
import { getConversation } from '../lib/conversationsService'
import { expertConversationRoute } from '../router'

const ExpertConversationView = () => {
  const { conversationId } = expertConversationRoute.useParams()
  const location = useLocation()
  const { spaces, isSidebarPinned, spacesLoading } = useAppContext()
  const { optimisticSelection, clearOptimisticSelection } = useChatStore(
    useShallow(state => ({
      optimisticSelection: state.optimisticSelection,
      clearOptimisticSelection: state.clearOptimisticSelection,
    })),
  )
  const [conversation, setConversation] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const initialChatState = location.state

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
    expertMode: true,
  }

  const shouldDelayRender =
    !initialChatState &&
    !fetchError &&
    conversationId &&
    (spacesLoading || !conversation || conversation?._isPlaceholder)

  if (fetchError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="bg-card w-full max-w-md rounded-2xl border border-red-200/60 p-6 shadow-sm dark:border-red-900/60">
          <div className="mb-3 flex items-center gap-2 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Failed to load expert conversation</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            The conversation data could not be fetched just now. Please retry.
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
            {fetchError?.message
              ? `Details: ${fetchError.message}`
              : 'No additional error details.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      <ChatInterface
        spaces={spaces}
        activeConversation={conversation}
        conversationId={conversationId}
        isSidebarPinned={isSidebarPinned}
        isSpaceSelectionLocked={true}
        initialMessage={initialMessage}
        initialAttachments={initialAttachments}
        initialDocumentIds={initialDocumentIds}
        initialToggles={initialToggles}
        initialSpaceSelection={initialSpaceSelection}
        initialAgentSelection={initialAgentSelection}
        initialIsAgentAutoMode={initialIsAgentAutoMode}
        MessageListComponent={ExpertMessageList}
      />
      {shouldDelayRender && <ConversationLoadingOverlay text="Loading expert conversation..." />}
    </div>
  )
}

export default ExpertConversationView
