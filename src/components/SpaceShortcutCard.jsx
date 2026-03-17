import { ArrowRight } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import EmojiDisplay from './EmojiDisplay'

const SpaceShortcutCard = memo(({ spaces = [], selectedSpaceId, onSpaceSelect, onManageClick }) => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full justify-center">
      <div className="group relative w-full">
        {/* Glass Card Container */}
        <div className="relative z-10 h-32 overflow-hidden rounded-3xl border border-white/75 bg-white/58 p-3 shadow-[0_8px_26px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_30px_rgba(15,23,42,0.14)] sm:h-36 dark:border-white/10 dark:bg-[#0f172a]/40">
          <div className="relative z-20 flex h-full flex-col justify-between gap-1">
            {/* Header */}
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <EmojiDisplay emoji="🗂️" size="1rem" className="mb-1 drop-shadow-sm" />
                <h3 className="text-sm font-bold tracking-tight text-gray-900 uppercase opacity-90 dark:text-white">
                  {t('homeView.spacesShortcut')}
                </h3>
              </div>
              <button
                onClick={onManageClick}
                className="text-primary-500 flex items-center gap-1 rounded-full border border-white/75 bg-white/78 px-2 py-1 text-[10px] font-bold uppercase backdrop-blur-md transition-colors hover:bg-white dark:border-white/12 dark:bg-white/10 dark:hover:bg-white/16"
              >
                {t('sidebar.seeAll')} <ArrowRight size={10} />
              </button>
            </div>

            {/* Horizontal Scroller - App-like Grid */}
            <div className="no-scrollbar -mx-5 flex touch-auto gap-3 overflow-x-auto px-5 pb-1 select-none active:cursor-grabbing">
              {/* Spaces List */}
              {spaces.map(space => {
                return (
                  <button
                    key={space.id}
                    onClick={() => onSpaceSelect(space)}
                    className="group/icon flex min-w-[64px] flex-none flex-col items-center gap-1.5 transition-all duration-300"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/75 bg-white/78 backdrop-blur-md transition-all duration-300 group-hover/icon:-translate-x-0.5 dark:border-white/12 dark:bg-white/10`}
                    >
                      <EmojiDisplay emoji={space.emoji} size="1.75rem" />
                    </div>
                    <span className="max-w-[64px] truncate text-[10px] font-medium text-gray-600 dark:text-gray-400">
                      {getSpaceDisplayLabel(space, t)}
                    </span>
                  </button>
                )
              })}
              {/* Add New Space Placeholder if list is short, or just visual end spacer */}
              <div className="w-2 shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

SpaceShortcutCard.displayName = 'SpaceShortcutCard'

export default SpaceShortcutCard
