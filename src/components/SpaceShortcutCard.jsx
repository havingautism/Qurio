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
    <div className="w-full flex justify-center">
      <div className="relative group w-full">
        {/* Glass Card - py-4 for more vertical breathing room */}
        <div className="relative z-10 h-30 sm:h-30 rounded-3xl border border-gray-200 dark:border-zinc-700/30 backdrop-blur-md bg-white/60 dark:bg-zinc-900/60 py-3 px-3 shadow-md dark:shadow-2xl overflow-hidden transition-all duration-300">
          {/* Animated Particles */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
            {PARTICLES.map(p => (
              <div
                key={p.id}
                className="absolute w-1 h-1 dark:bg-white bg-primary-500 rounded-full animate-twinkle"
                style={{
                  top: p.top,
                  left: p.left,
                  '--duration': p.duration,
                  animationDelay: p.delay,
                }}
              />
            ))}
            <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-[-10%] left-[-10%] w-32 h-32 bg-primary-400/10 rounded-full blur-3xl animate-pulse" />
          </div>

          <div className="relative z-20 h-full flex flex-col justify-between">
            {/* Header - Minimal height */}
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <LayoutGrid size={14} className="text-primary-600 dark:text-primary-400" />
                <h3 className="text-xs font-black tracking-tight text-gray-900 dark:text-white uppercase opacity-100 leading-none">
                  {t('homeView.spacesShortcut')}
                </h3>
              </div>
              <button
                onClick={onManageClick}
                className="text-[10px] font-bold text-primary-500 hover:text-primary-600 transition-colors uppercase leading-none"
              >
                {t('sidebar.seeAll')}
              </button>
            </div>

            {/* Horizontal Scroller - Compact items */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-0.5 -mx-6 px-6 select-none touch-pan-x active:cursor-grabbing">
              {/* Spaces List */}
              {spaces.map(space => {
                return (
                  <button
                    key={space.id}
                    onClick={() => onSpaceSelect(space)}
                    className={`flex-none flex flex-col items-center gap-1 p-1.5 rounded-md transition-all duration-300 min-w-[60px] ${'bg-gray-200/30 dark:bg-zinc-800/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-zinc-800/60'}`}
                  >
                    <div className={`w-10 h-10 flex items-center justify-center rounded-xl  `}>
                      <EmojiDisplay emoji={space.emoji} size="1.5rem" />
                    </div>
                    <span className="text-[10px] font-bold truncate max-w-[52px]">
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
