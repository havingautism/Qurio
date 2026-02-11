import { ArrowRight } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

const PARTICLES = [
  { id: 0, top: '15%', left: '10%', duration: '4s', delay: '0s' },
  { id: 1, top: '45%', left: '85%', duration: '5s', delay: '1s' },
  { id: 2, top: '75%', left: '20%', duration: '3.5s', delay: '2s' },
  { id: 3, top: '30%', left: '60%', duration: '6s', delay: '0.5s' },
  { id: 4, top: '80%', left: '50%', duration: '4.5s', delay: '3s' },
]

const DeepResearchCard = memo(({ onClick }) => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full justify-center">
      <div className="group relative w-full cursor-pointer" onClick={onClick}>
        {/* Card Container: low-contrast light mode, original vivid dark mode */}
        <div className="relative z-10 h-32 overflow-hidden rounded-3xl bg-gradient-to-br from-[#e8ebf8] via-[#d7def4] to-[#c7d1ee] p-6 shadow-md transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-xl active:scale-[0.98] sm:h-36 dark:from-[#312e81] dark:via-[#1e1b4b] dark:to-black dark:shadow-lg dark:group-hover:shadow-2xl">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:20px_20px] opacity-18 dark:opacity-20" />

          <div className="pointer-events-none absolute inset-0 z-0">
            {PARTICLES.map(p => (
              <div
                key={p.id}
                className="absolute h-1 w-1 animate-pulse rounded-full bg-[#7f93cf]/70 opacity-45 dark:bg-white dark:opacity-40"
                style={{
                  top: p.top,
                  left: p.left,
                  animationDuration: p.duration,
                  animationDelay: p.delay,
                }}
              />
            ))}
          </div>

          <div className="relative z-20 flex h-full flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔬</span>
                  <h3 className="text-xl font-bold tracking-tight text-[#2d3a62] md:text-2xl dark:text-white dark:drop-shadow-md">
                    {t('homeView.deepResearchEntry')}
                  </h3>
                </div>
                <div className="h-1 w-12 rounded-full bg-[#7186c5]/45 transition-all duration-500 group-hover:w-20 group-hover:bg-[#6078bf]/70 dark:bg-indigo-400/50 dark:group-hover:bg-indigo-400" />
              </div>

              <div className="hidden rounded-full bg-white/35 p-2 backdrop-blur-sm transition-transform duration-500 group-hover:rotate-12 sm:block dark:bg-white/10">
                <span className="text-lg">🛰️</span>
              </div>
            </div>

            <div className="flex items-end justify-between">
              <p className="max-w-[70%] text-xs font-medium text-[#46557f] md:text-sm dark:text-indigo-100/80 dark:drop-shadow-sm">
                {t('homeView.deepResearchEntryHint')}
              </p>

              <div className="rounded-full bg-white/45 p-2 text-[#46557f] shadow-md backdrop-blur-md transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white/60 dark:bg-white/10 dark:text-white dark:shadow-lg dark:group-hover:bg-white/20">
                <ArrowRight size={20} />
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

