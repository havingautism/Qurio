import { useEffect, useMemo, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useShallow } from 'zustand/react/shallow'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
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
  const initialChatState = location.state

  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversationId) return
      setConversation(prev =>
        prev?.id === conversationId ? prev : { id: conversationId, _isPlaceholder: true },
      )
      setFetchError(null)
      try {
        const { data, error } = await getConversation(conversationId)
        if (error) throw error
        if (!data) throw new Error('Conversation not found')
        setConversation(data)
        if (optimisticSelection?.conversationId === conversationId) {
          clearOptimisticSelection()
        }
      } catch (error) {
        console.error('Failed to fetch expert conversation:', error)
        setFetchError(error)
      }
    }
    fetchConversation()
  }, [conversationId, optimisticSelection?.conversationId, clearOptimisticSelection])

  useEffect(() => {
    const handleConversationChanged = async () => {
      if (!conversationId) return
      try {
        const { data } = await getConversation(conversationId)
        if (data) setConversation(data)
      } catch (error) {
        console.error('Failed to refetch expert conversation:', error)
      }
    }

    window.addEventListener('conversations-changed', handleConversationChanged)
    return () => {
      window.removeEventListener('conversations-changed', handleConversationChanged)
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
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <div className="mb-2 text-red-500">Failed to load expert conversation</div>
        <button
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-4 py-2"
        >
          Retry
        </button>
      </div>
    )
  }

  if (shouldDelayRender) return null

  return (
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
    />
  )
}

export default ExpertConversationView
