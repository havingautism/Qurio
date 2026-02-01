import { LayoutGrid } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import EmojiDisplay from './EmojiDisplay'

const PARTICLES = [
  { id: 0, top: '15%', left: '10%', duration: '4s', delay: '0.5s' },
  { id: 1, top: '45%', left: '90%', duration: '5.5s', delay: '1.5s' },
  { id: 2, top: '75%', left: '20%', duration: '4.2s', delay: '2.8s' },
  { id: 3, top: '30%', left: '70%', duration: '6s', delay: '0.8s' },
]

const SpaceShortcutCard = memo(({ spaces = [], selectedSpaceId, onSpaceSelect, onManageClick }) => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full justify-center">
      <div className="group relative w-full">
        {/* Glass Card - py-4 for more vertical breathing room */}
        <div className="relative z-10 h-30 overflow-hidden rounded-3xl border border-gray-200 bg-white/60 px-3 py-3 shadow-md backdrop-blur-md transition-all duration-300 sm:h-30 dark:border-zinc-700/30 dark:bg-zinc-900/60 dark:shadow-2xl">
          {/* Animated Particles */}
          <div className="pointer-events-none absolute inset-0 z-0 opacity-40">
            {PARTICLES.map(p => (
              <div
                key={p.id}
                className="bg-primary-500 animate-twinkle absolute h-1 w-1 rounded-full dark:bg-white"
                style={{
                  top: p.top,
                  left: p.left,
                  '--duration': p.duration,
                  animationDelay: p.delay,
                }}
              />
            ))}
            <div className="bg-primary-500/10 absolute top-[-20%] right-[-10%] h-40 w-40 animate-pulse rounded-full blur-3xl" />
            <div className="bg-primary-400/10 absolute bottom-[-10%] left-[-10%] h-32 w-32 animate-pulse rounded-full blur-3xl" />
          </div>

          <div className="relative z-20 flex h-full flex-col justify-between">
            {/* Header - Minimal height */}
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <LayoutGrid size={14} className="text-primary-600 dark:text-primary-400" />
                <h3 className="text-xs leading-none font-black tracking-tight text-gray-900 uppercase opacity-100 dark:text-white">
                  {t('homeView.spacesShortcut')}
                </h3>
              </div>
              <button
                onClick={onManageClick}
                className="text-primary-500 hover:text-primary-600 text-[10px] leading-none font-bold uppercase transition-colors"
              >
                {t('sidebar.seeAll')}
              </button>
            </div>

            {/* Horizontal Scroller - Compact items */}
            <div className="no-scrollbar -mx-6 flex touch-pan-x gap-3 overflow-x-auto px-6 pb-0.5 select-none active:cursor-grabbing">
              {/* Spaces List */}
              {spaces.map(space => {
                return (
                  <button
                    key={space.id}
                    onClick={() => onSpaceSelect(space)}
                    className={`group/icon flex min-w-[60px] flex-none flex-col items-center gap-1 rounded-md p-1.5 transition-all duration-300 ${'bg-gray-200/30 text-gray-600 hover:bg-gray-200/50 dark:bg-zinc-800/40 dark:text-gray-400 dark:hover:bg-zinc-800/60'}`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover/icon:scale-110`}
                    >
                      <EmojiDisplay emoji={space.emoji} size="1.5rem" />
                    </div>
                    <span className="max-w-[52px] truncate text-[10px] font-bold">
                      {getSpaceDisplayLabel(space, t)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

SpaceShortcutCard.displayName = 'SpaceShortcutCard'

export default SpaceShortcutCard
