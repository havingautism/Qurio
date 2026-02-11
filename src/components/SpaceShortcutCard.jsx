import { LayoutGrid, ArrowRight } from 'lucide-react'
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
        <div className="relative z-10 h-32 overflow-hidden rounded-3xl border border-gray-200 bg-white/40 p-3 shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-md sm:h-36 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:shadow-2xl">
          <div className="relative z-20 flex h-full flex-col justify-between gap-1">
            {/* Header */}
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl drop-shadow-sm">🗂️</span>
                <h3 className="text-sm font-bold tracking-tight text-gray-900 uppercase opacity-90 dark:text-white">
                  {t('homeView.spacesShortcut')}
                </h3>
              </div>
              <button
                onClick={onManageClick}
                className="text-primary-500 hover:text-primary-600 bg-primary-50 dark:bg-primary-900/20 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase transition-colors"
              >
                {t('sidebar.seeAll')} <ArrowRight size={10} />
              </button>
            </div>

            {/* Horizontal Scroller - App-like Grid */}
            <div className="no-scrollbar -mx-5 flex touch-pan-x gap-3 overflow-x-auto px-5 pb-1 select-none active:cursor-grabbing">
              {/* Spaces List */}
              {spaces.map(space => {
                return (
                  <button
                    key={space.id}
                    onClick={() => onSpaceSelect(space)}
                    className="group/icon flex min-w-[64px] flex-none flex-col items-center gap-1.5 transition-all duration-300"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white transition-all duration-300 group-hover/icon:-translate-x-0.5 dark:border-zinc-700 dark:bg-zinc-800`}
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
