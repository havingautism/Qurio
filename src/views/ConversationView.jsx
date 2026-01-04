import { useEffect, useMemo, useState } from 'react'
import { conversationRoute } from '../router'
import { useLocation } from '@tanstack/react-router'
import { getConversation } from '../lib/conversationsService'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
import DeepResearchChatInterface from '../components/DeepResearchChatInterface'
import FancyLoader from '../components/FancyLoader'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

const ConversationView = () => {
  const { conversationId } = conversationRoute.useParams()
  const location = useLocation()
  const { spaces, deepResearchSpace, isSidebarPinned, spacesLoading } = useAppContext()
  const { optimisticSelection, clearOptimisticSelection } = useChatStore(
    useShallow(state => ({
      optimisticSelection: state.optimisticSelection,
      clearOptimisticSelection: state.clearOptimisticSelection,
    })),
  )
  const [conversation, setConversation] = useState(null)

  // Get initial chat state from router navigation state
  const initialChatState = location.state

  // Effect to fetch conversation data when conversationId changes
  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversationId) return

      setConversation(prev =>
        prev?.id === conversationId ? prev : { id: conversationId, _isPlaceholder: true },
      )

      try {
        const { data } = await getConversation(conversationId)
        if (data) {
          setConversation(data)
          if (optimisticSelection?.conversationId === conversationId) {
            clearOptimisticSelection()
          }
        }
      } catch (error) {
        console.error('Failed to fetch conversation:', error)
      }
    }

    fetchConversation()
  }, [conversationId])

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

  const shouldDelayRender =
    !initialChatState &&
    conversationId &&
    (spacesLoading || !conversation || conversation?._isPlaceholder)

  if (shouldDelayRender) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <FancyLoader />
      </div>
    )
  }

  const ChatComponent = isDeepResearchConversation ? DeepResearchChatInterface : ChatInterface

  // Render the appropriate chat interface with the conversation data
  return (
    <ChatComponent
      spaces={spaces}
      activeConversation={conversation}
      conversationId={conversationId}
      isSidebarPinned={isSidebarPinned}
      initialMessage={initialMessage}
      initialAttachments={initialAttachments}
      initialToggles={initialToggles}
      initialSpaceSelection={initialSpaceSelection}
      initialAgentSelection={initialAgentSelection}
      initialIsAgentAutoMode={initialIsAgentAutoMode}
    />
  )
}

export default ConversationView
