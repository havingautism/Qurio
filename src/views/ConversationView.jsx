import { useEffect, useState } from 'react'
import MainContent from '../components/MainContent'
import { conversationRoute } from '../router'
import { getConversation } from '../lib/conversationsService'
import { useAppContext } from '../App'

const ConversationView = () => {
  const { conversationId } = conversationRoute.useParams()
  const context = useAppContext()
  const [conversation, setConversation] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [prevConversationId, setPrevConversationId] = useState(conversationId)

  // Effect to fetch conversation data when conversationId changes
  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversationId) return

      // Show loader when switching to a different conversation
      if (conversationId !== prevConversationId) {
        setIsLoading(true)
        setConversation(null) // avoid flashing previous conversation while loading
        setPrevConversationId(conversationId)
      }

      try {
        const { data } = await getConversation(conversationId)
        if (data) {
          setConversation(data)
        }
      } catch (error) {
        console.error('Failed to fetch conversation:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchConversation()
  }, [conversationId, prevConversationId])

  // Listen for conversation space updates
  useEffect(() => {
    const handleSpaceUpdated = async event => {
      const { conversationId: updatedId, space } = event.detail

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

  // Lightweight placeholder while fetching conversation data
  if (isLoading || !conversation) {
    return <div className="min-h-screen bg-background text-foreground" />
  }

  return (
    <MainContent
      currentView="chat"
      activeConversation={conversation}
      conversationId={conversationId}
      {...context}
    />
  )
}

export default ConversationView
