import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Bookmark, Clock, Trash2, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import EmojiDisplay from './EmojiDisplay'

const ConversationCard = ({
  conversation,
  space,
  onToggleFavorite,
  onDelete,
  isDeleting: isDeletingProp = false,
  isDeepResearch: isDeepResearchProp,
  isExpert: isExpertProp,
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const isDeepResearch =
    isDeepResearchProp ??
    (space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research)
  const isExpert = isExpertProp ?? false

  const normalizeTitleEmojis = value => {
    if (Array.isArray(value)) {
      return value
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 1)
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 1)
        }
      } catch {
        return []
      }
    }
    return []
  }

  const resolveConversationEmoji = (conv, fallbackEmoji) => {
    const emojiList = normalizeTitleEmojis(conv?.title_emojis ?? conv?.titleEmojis)
    const resolvedList = emojiList.length > 0 ? emojiList : fallbackEmoji ? [fallbackEmoji] : []
    if (resolvedList.length === 0) {
      if (isDeepResearch) return '🔬'
      if (isExpert) return '🧠'
      return '💬'
    }
    return resolvedList[0]
  }

  const emoji = resolveConversationEmoji(conversation, space?.emoji)

  // Resolve target route
  const getTargetRoute = () => {
    if (isDeepResearch) return '/deepresearch/$conversationId'
    if (isExpert) return '/expert/$conversationId'
    return '/conversation/$conversationId'
  }

  const formatDate = dateString => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handleCardClick = () => {
    navigate({
      to: getTargetRoute(),
      params: { conversationId: conversation.id },
    })
  }

  const handleFavoriteClick = e => {
    e.stopPropagation()
    if (onToggleFavorite) onToggleFavorite(conversation)
  }

  const handleDeleteClick = e => {
    e.stopPropagation()
    if (onDelete) onDelete(conversation)
  }

  return (
    <div
      onClick={handleCardClick}
      className="glass-elite-panel group relative flex min-h-[140px] cursor-pointer flex-col rounded-[32px] border-none p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-xl transition-all duration-300 hover:translate-y-[-4px] hover:scale-[1.01] hover:bg-black/5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] active:scale-[0.98]"
    >
      {/* Action Buttons */}
      <div className="absolute top-5 right-5 z-30 flex gap-1.5 opacity-100 transition-all duration-200 md:opacity-0 md:group-hover:opacity-100">
        <button
          onClick={handleFavoriteClick}
          className={clsx(
            'hover:text-primary-500 dark:hover:bg-primary-900/20 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 shadow-sm backdrop-blur-md transition-all hover:bg-black/10 dark:bg-white/10',
            conversation.is_favorited ? 'text-primary-500 font-bold' : 'text-gray-400',
          )}
          title={conversation.is_favorited ? t('views.removeBookmark') : t('views.addBookmark')}
        >
          <Bookmark size={14} className={clsx(conversation.is_favorited && 'fill-current')} />
        </button>
        <button
          onClick={handleDeleteClick}
          disabled={isDeletingProp}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-gray-400 shadow-sm backdrop-blur-md transition-all hover:bg-red-50 hover:text-red-500 dark:bg-white/10 dark:hover:bg-red-900/30"
          title={t('confirmation.delete')}
        >
          {isDeletingProp ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100/50 transition-transform duration-300 group-hover:scale-110 dark:bg-zinc-800/50">
          <EmojiDisplay emoji={emoji} size="1.8rem" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2 pr-8 text-base leading-tight font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {conversation.title || t('views.untitledThread')}
          </h3>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 text-[10px] font-bold tracking-wider text-gray-400 uppercase sm:text-[11px]">
        <div className="flex items-center gap-2 overflow-hidden">
          {space && (
            <div className="flex max-w-[120px] items-center gap-1.5 truncate" title={space.label}>
              {space.emoji && <EmojiDisplay emoji={space.emoji} size="0.9rem" />}
              <span className="truncate text-gray-600 dark:text-gray-300">{space.label}</span>
            </div>
          )}
          {space && <span className="text-gray-200 dark:text-zinc-800">|</span>}
          <div className="flex shrink-0 items-center gap-1">
            <Clock size={11} className="opacity-70" />
            <span>{formatDate(conversation.updated_at || conversation.created_at)}</span>
          </div>
        </div>

        {conversation.is_favorited && !space && (
          <Bookmark size={12} className="text-primary-500 ml-auto fill-current" />
        )}
      </div>
    </div>
  )
}

export default ConversationCard
