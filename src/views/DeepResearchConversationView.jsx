import { useEffect, useMemo, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { deepResearchConversationRoute } from '../router'
import { getConversation } from '../lib/conversationsService'
import { useAppContext } from '../App'
import DeepResearchChatInterface from '../components/DeepResearchChatInterface'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../lib/chatStore'

const DeepResearchConversationView = () => {
  const { conversationId } = deepResearchConversationRoute.useParams()
  const location = useLocation()
  const { spaces, isSidebarPinned } = useAppContext()
  const { optimisticSelection, clearOptimisticSelection } = useChatStore(
    useShallow(state => ({
      optimisticSelection: state.optimisticSelection,
      clearOptimisticSelection: state.clearOptimisticSelection,
    })),
  )
  const [conversation, setConversation] = useState(null)

  const initialChatState = location.state

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

  useEffect(() => {
    const handleSpaceUpdated = async event => {
      const { conversationId: updatedId } = event.detail

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

  const initialSpaceSelection = useMemo(() => {
    if (initialChatState?.initialSpaceSelection) {
      return initialChatState.initialSpaceSelection
    }
    if (optimisticMatch?.space) {
      return {
        mode: optimisticMatch.isManualSpaceSelection ? 'manual' : 'auto',
        space: optimisticMatch.space,
      }
    }
    return { mode: 'auto', space: null }
  }, [initialChatState, optimisticMatch])

  const initialAgentSelection = useMemo(() => {
    if (initialChatState?.initialAgentSelection) {
      return initialChatState.initialAgentSelection
    }
    if (optimisticMatch?.agentId) {
      return { id: optimisticMatch.agentId }
    }
    return null
  }, [initialChatState, optimisticMatch])

  const initialIsAgentAutoMode = useMemo(() => {
    if (initialChatState?.initialIsAgentAutoMode !== undefined) {
      return initialChatState.initialIsAgentAutoMode
    }
    if (optimisticMatch) {
      return optimisticMatch.isAgentAutoMode
    }
    return true
  }, [initialChatState, optimisticMatch])

  const initialMessage = initialChatState?.initialMessage || ''
  const initialAttachments = initialChatState?.initialAttachments || []
  const initialToggles = initialChatState?.initialToggles || {}

  return (
    <DeepResearchChatInterface
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

export default DeepResearchConversationView
