import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { Brain, Clock, DollarSign, Laptop, LayoutGrid, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'

const SpacesView = () => {
  const { spaces, deepResearchSpace, onCreateSpace, isSidebarPinned } = useAppContext()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  // Helper to format date
  const formatDate = dateString => {
    if (!dateString) return t('views.spacesView.justNow')
    const date = new Date(dateString)
    // Use current language for date formatting
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    return date.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Static examples data
  const exampleSpaces = [
    {
      id: 'ex-1',
      emoji: '🧠',
      label: 'Perplexity Support',
      icon: Brain,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
    },
    {
      id: 'ex-2',
      emoji: '💵',
      label: 'What would Buffet say?',
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      id: 'ex-3',
      emoji: '💻',
      label: 'LLM Research',
      icon: Laptop,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
  ]

  const deepResearchSpaceIds = new Set()
  if (deepResearchSpace?.id) deepResearchSpaceIds.add(String(deepResearchSpace.id))
  ;(spaces || []).forEach(space => {
    if (space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research) {
      deepResearchSpaceIds.add(String(space.id))
    }
  })
  const displaySpaces = (spaces || []).filter(space => !deepResearchSpaceIds.has(String(space.id)))

  return (
    <div
      className={clsx(
        'bg-background text-foreground h-full flex-1 overflow-y-auto transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <LayoutGrid size={32} className="text-primary-500" />
          <h1 className="text-3xl font-medium">{t('views.spacesView.title')}</h1>
        </div>

        {/* My Spaces Section */}
        <div className="mb-12">
          <h2 className="mb-4 text-lg font-medium text-gray-700 dark:text-gray-300">
            {t('views.spacesView.mySpaces')}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Create Card */}
            <div
              onClick={onCreateSpace}
              className="group flex min-h-[160px] cursor-pointer flex-col justify-between rounded-xl bg-gray-100 p-6 transition-colors hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <div className="bg-primary-500 mb-4 flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform group-hover:scale-110">
                <Plus size={24} />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-medium">{t('views.spacesView.createSpace')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('views.spacesView.createSpaceDescription')}
                </p>
              </div>
            </div>

            {/* User Spaces */}
            {displaySpaces.map(space => (
              <div
                key={space.id}
                onClick={() =>
                  navigate({
                    to: '/space/$spaceId',
                    params: { spaceId: space.id },
                  })
                }
                className="group flex min-h-[160px] cursor-pointer flex-col justify-between rounded-xl bg-gray-100 p-6 transition-colors hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-xl dark:bg-zinc-800">
                  <EmojiDisplay emoji={space.emoji} />
                </div>
                <div>
                  <h3 className="mb-1 truncate text-lg font-medium">{space.label}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Clock size={12} />
                    <span>{formatDate(space.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpacesView
