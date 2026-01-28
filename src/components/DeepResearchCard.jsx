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
    <div className="w-full flex justify-center">
      <div className="relative group cursor-pointer w-full" onClick={onClick}>
        {/* Glass Card - Subtle/Refined Style */}
        <div className="relative z-10 h-30 sm:h-30 rounded-3xl border border-gray-200 dark:border-zinc-700/30 backdrop-blur-md bg-white/60 dark:bg-zinc-900/60 p-6 shadow-md dark:shadow-2xl overflow-hidden transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-2xl group-active:scale-[0.98]">
          {/* Magical Twinkle Particles */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
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
          </div>

          {/* Shine Sweep Effect */}
          <div className="absolute inset-x-0 h-48 bg-linear-to-b from-transparent via-white/30 to-transparent blur-[25px] -rotate-45 -translate-y-full group-hover:animate-diagonal-shine pointer-events-none" />

          <div className="relative z-20 h-full flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 dark:bg-zinc-800/40 rounded-xl backdrop-blur-sm shadow-sm group-hover:rotate-12 transition-transform duration-300">
                <Microscope
                  size={20}
                  className="text-primary-600 dark:text-primary-400 animate-pulse"
                />
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black tracking-tight text-gray-900 dark:text-white leading-none">
                  {t('homeView.deepResearchEntry')}
                </h3>
                <div className="h-1 w-8 bg-primary-500 mt-1 rounded-full transform origin-left group-hover:scale-x-150 transition-transform duration-500" />
              </div>
            </div>

            <div className="flex items-end justify-between">
              <p className="text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 leading-tight pr-6 drop-shadow-sm">
                {t('homeView.deepResearchEntryHint')}
              </p>
              <div className="p-2.5 bg-primary-500 hover:bg-primary-600 rounded-2xl text-white shadow-lg transform group-hover:translate-x-1.5 transition-all duration-300">
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
