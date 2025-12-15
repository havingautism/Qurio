import { useEffect, useState } from 'react'
import { conversationRoute } from '../router'
import { getConversation } from '../lib/conversationsService'
import { useAppContext } from '../App'
import ChatInterface from '../components/ChatInterface'

const ConversationView = () => {
  const { conversationId } = conversationRoute.useParams()
  const { spaces, toggleSidebar, isSidebarPinned } = useAppContext()
  const [conversation, setConversation] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Effect to fetch conversation data when conversationId changes
  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversationId) return

      setIsLoading(true)
      setConversation(null)

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

  // Lightweight placeholder while fetching conversation data
  if (isLoading || !conversation) {
    return <div className="min-h-screen bg-background text-foreground" />
  }

  // Directly render ChatInterface with the conversation data
  return (
    <ChatInterface
      spaces={spaces}
      activeConversation={conversation}
      conversationId={conversationId}
      isSidebarPinned={isSidebarPinned}
    />
  )
}

export default ConversationView
