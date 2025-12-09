import { useState } from 'react'
import { Plus, Clock, MessageSquare, Bookmark, MoreHorizontal, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import FancyLoader from './FancyLoader'
import DropdownMenu from './DropdownMenu'
import ConfirmationModal from './ConfirmationModal'
import { deleteConversation } from '../lib/supabase'
import { toggleFavorite } from '../lib/conversationsService'
import { useToast } from '../contexts/ToastContext'

const ConversationsListView = ({
  conversations = [],
  conversationsLoading = false,
  onCreateConversation,
  onOpenConversation,
  onConversationDeleted,
  isSidebarPinned = false,
  title = 'Library',
  showCreateButton = true,
}) => {
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null)
  const [conversationToDelete, setConversationToDelete] = useState(null)
  const toast = useToast()

  const handleToggleFavorite = async conversation => {
    const newStatus = !conversation.is_favorited
    // Optimistic update
    const updatedConversations = conversations.map(c =>
      c.id === conversation.id ? { ...c, is_favorited: newStatus } : c,
    )

    const { error } = await toggleFavorite(conversation.id, newStatus)

    if (error) {
      console.error('Failed to toggle favorite:', error)
      toast.error('Failed to update favorite status')
    } else {
      toast.success(newStatus ? 'Added to bookmarks' : 'Removed from bookmarks')
      // Trigger a conversation update by firing the event
      window.dispatchEvent(new Event('conversations-changed'))
    }
  }

  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return

    const { success, error } = await deleteConversation(conversationToDelete.id)

    if (success) {
      toast.success('Conversation deleted successfully')
      // Notify parent component about deletion
      if (onConversationDeleted) {
        onConversationDeleted(conversationToDelete.id)
      }
      // Trigger a conversation update by firing the event
      window.dispatchEvent(new Event('conversations-changed'))
    } else {
      console.error('Failed to delete conversation:', error)
      toast.error('Failed to delete conversation')
    }

    setConversationToDelete(null)
  }

  // Group conversations by date
  const groupConversationsByDate = items => {
    const startOfDay = date => {
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      return d
    }

    const todayStart = startOfDay(new Date())
    const groups = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Past: [],
    }

    items.forEach(conv => {
      const convDate = startOfDay(conv.created_at)
      const diffDays = Math.floor((todayStart - convDate) / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        groups.Today.push(conv)
      } else if (diffDays === 1) {
        groups.Yesterday.push(conv)
      } else if (diffDays <= 7) {
        groups['Previous 7 Days'].push(conv)
      } else {
        groups.Past.push(conv)
      }
    })

    return Object.keys(groups)
      .map(title => ({ title, items: groups[title] }))
      .filter(section => section.items.length > 0)
  }

  const groupedConversations = groupConversationsByDate(conversations)

  return (
    <div
      className={clsx(
        'flex flex-col min-h-screen p-4 md:p-8 bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'md:ml-20' : 'md:ml-16',
      )}
    >
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-lg">
            <MessageSquare className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        </div>

        {/* Loading State */}
        {conversationsLoading && (
          <div className="relative min-h-[220px]">
            <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-background/40 rounded-2xl">
              <FancyLoader />
            </div>
          </div>
        )}

        {/* Conversations Sections */}
        {!conversationsLoading && (
          <div className="space-y-8">
            {/* Create New Conversation Card - Always at top */}
            {showCreateButton && (
              <div className="mb-4">
                <button
                  onClick={onCreateConversation}
                  className="group relative bg-white dark:bg-zinc-900 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl p-6 hover:border-cyan-500 dark:hover:border-cyan-500 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-all duration-200 cursor-pointer min-h-[180px] flex flex-col items-center justify-center w-full max-w-sm"
                >
                  <div className="w-12 h-12 rounded-full bg-cyan-500/10 dark:bg-cyan-500/20 flex items-center justify-center mb-3 group-hover:bg-cyan-500/20 dark:group-hover:bg-cyan-500/30 transition-colors">
                    <Plus className="w-6 h-6 text-cyan-500" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    New Conversation
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                    Start a new chat
                  </p>
                </button>
              </div>
            )}

            {/* Grouped Conversations */}
            {groupedConversations.map(section => (
              <div key={section.title} className="mb-8">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  {section.title}
                </h2>

                {/* Conversations Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.items.map(conversation => (
                    <div
                      key={conversation.id}
                      className="group relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 hover:border-cyan-500/50 dark:hover:border-cyan-500/50 hover:shadow-lg dark:hover:shadow-cyan-500/10 transition-all duration-200 cursor-pointer min-h-[180px] flex flex-col text-left"
                    >
                      {/* Menu Button */}
                      <div className="absolute top-4 right-4">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setOpenMenuId(conversation.id)
                            setMenuAnchorEl(e.currentTarget)
                          }}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 dark:text-gray-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>

                      {/* Conversation Click Area */}
                      <div
                        className="flex-1 flex flex-col"
                        onClick={() => onOpenConversation && onOpenConversation(conversation)}
                      >
                        {/* Conversation Icon */}
                        <div className="w-12 h-12 rounded-full bg-linear-to-br from-cyan-400 to-blue-500 flex items-center justify-center mb-4 text-white">
                          <MessageSquare className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-cyan-500 transition-colors line-clamp-2 flex-1">
                          {conversation.title || 'Untitled Conversation'}
                        </h3>

                        {/* Conversation Meta Info */}
                        <div className="flex items-center justify-between mt-auto">
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Clock className="w-3 h-3" />
                            <span>
                              {conversation.created_at
                                ? new Date(conversation.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : 'Recently'}
                            </span>
                          </div>
                          {conversation.is_favorited && (
                            <Bookmark className="w-4 h-4 text-yellow-500 fill-current" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Empty State */}
            {conversations.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p className="text-sm">
                  No conversations yet. Start your first conversation to get started.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Dropdown Menu */}
      <DropdownMenu
        isOpen={!!openMenuId && !!menuAnchorEl}
        anchorEl={menuAnchorEl}
        onClose={() => {
          setOpenMenuId(null)
          setMenuAnchorEl(null)
        }}
        items={(() => {
          const conv = conversations.find(c => c.id === openMenuId)
          if (!conv) return []
          return [
            {
              label: conv.is_favorited ? 'Remove Bookmark' : 'Add Bookmark',
              icon: <Bookmark size={14} className={conv.is_favorited ? 'fill-current' : ''} />,
              onClick: () => handleToggleFavorite(conv),
              className: conv.is_favorited ? 'text-yellow-500' : '',
            },
            {
              label: 'Delete',
              icon: <Trash2 size={14} />,
              onClick: () => setConversationToDelete(conv),
              danger: true,
            },
          ]
        })()}
      />

      <ConfirmationModal
        isOpen={!!conversationToDelete}
        onClose={() => setConversationToDelete(null)}
        onConfirm={handleDeleteConversation}
        title="Delete"
        message={`Are you sure you want to delete "${conversationToDelete?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        isDangerous={true}
      />
    </div>
  )
}

export default ConversationsListView
