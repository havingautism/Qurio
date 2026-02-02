import { ArrowRight, Microscope } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

const PARTICLES = [
  { id: 0, top: '10%', left: '20%', duration: '3s', delay: '0s' },
  { id: 1, top: '40%', left: '80%', duration: '4.5s', delay: '1.2s' },
  { id: 2, top: '70%', left: '15%', duration: '3.8s', delay: '2.5s' },
  { id: 3, top: '25%', left: '60%', duration: '5s', delay: '0.5s' },
  { id: 4, top: '85%', left: '50%', duration: '4s', delay: '3s' },
  { id: 5, top: '15%', left: '90%', duration: '3.2s', delay: '1.8s' },
  { id: 6, top: '55%', left: '30%', duration: '4.2s', delay: '2.2s' },
  { id: 7, top: '90%', left: '75%', duration: '3.5s', delay: '0.8s' },
  { id: 8, top: '35%', left: '40%', duration: '4.8s', delay: '4s' },
  { id: 9, top: '65%', left: '85%', duration: '3.6s', delay: '1.5s' },
]

const DeepResearchCard = memo(({ onClick }) => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full justify-center">
      <div className="group relative w-full cursor-pointer" onClick={onClick}>
        {/* Glass Card - Subtle/Refined Style */}
        <div className="relative z-10 h-30 overflow-hidden rounded-3xl border border-gray-200 bg-white/60 p-6 shadow-md transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-2xl group-active:scale-[0.98] sm:h-30 md:backdrop-blur-md dark:border-zinc-700/30 dark:bg-zinc-900/60 dark:shadow-2xl">
          {/* Magical Twinkle Particles */}
          <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
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
          </div>

          {/* Shine Sweep Effect */}
          <div className="group-hover:animate-diagonal-shine pointer-events-none absolute inset-x-0 h-48 -translate-y-full -rotate-45 bg-linear-to-b from-transparent via-white/30 to-transparent blur-[25px]" />

          <div className="relative z-20 flex h-full flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2 shadow-sm transition-transform duration-300 group-hover:rotate-12 md:backdrop-blur-sm dark:bg-zinc-800/40">
                <Microscope
                  size={20}
                  className="text-primary-600 dark:text-primary-400 animate-pulse"
                />
              </div>
              <div>
                <h3 className="text-xl leading-none font-black tracking-tight text-gray-900 md:text-2xl dark:text-white">
                  {t('homeView.deepResearchEntry')}
                </h3>
                <div className="bg-primary-500 mt-1 h-1 w-8 origin-left transform rounded-full transition-transform duration-500 group-hover:scale-x-150" />
              </div>
            </div>

            <div className="flex items-end justify-between">
              <p className="pr-6 text-xs leading-tight font-bold text-gray-700 drop-shadow-sm md:text-sm dark:text-gray-300">
                {t('homeView.deepResearchEntryHint')}
              </p>
              <div className="bg-primary-500 hover:bg-primary-600 transform rounded-2xl p-2.5 text-white shadow-lg transition-all duration-300 group-hover:translate-x-1.5">
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

DeepResearchCard.displayName = 'DeepResearchCard'

export default DeepResearchCard
