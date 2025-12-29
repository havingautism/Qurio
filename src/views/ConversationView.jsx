import { useEffect, useMemo, useState } from 'react'
import { conversationRoute } from '../router'
import { useLocation } from '@tanstack/react-router'
import { getConversation } from '../lib/conversationsService'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

const ConversationView = () => {
  const { conversationId } = conversationRoute.useParams()
  const location = useLocation()
  const { spaces, toggleSidebar, isSidebarPinned } = useAppContext()
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

  // Directly render ChatInterface with the conversation data
  return (
    <ChatInterface
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
