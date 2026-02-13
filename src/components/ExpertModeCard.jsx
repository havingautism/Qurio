import { ArrowRight } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import EmojiDisplay from './EmojiDisplay'

const EXPERT_PARTICLES = [
  { id: 0, top: '20%', left: '80%', duration: '5s', delay: '0s' },
  { id: 1, top: '60%', left: '10%', duration: '6s', delay: '1.5s' },
  { id: 2, top: '40%', left: '50%', duration: '4s', delay: '0.5s' },
  { id: 3, top: '80%', left: '70%', duration: '5.5s', delay: '2s' },
]

const ExpertModeCard = memo(({ onClick }) => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full justify-center">
      <div className="group relative w-full cursor-pointer" onClick={onClick}>
        {/* Card Container: low-contrast light mode, vivid dark mode */}
        <div className="relative z-10 h-32 overflow-hidden rounded-3xl bg-gradient-to-br from-[#ece8f8] via-[#ddd8f4] to-[#cfd0ef] p-6 shadow-md transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-xl active:scale-[0.98] sm:h-36 dark:from-[#2b1f57] dark:via-[#373f7a] dark:to-[#2b4f7a] dark:shadow-lg dark:group-hover:shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:24px_24px] opacity-25 dark:opacity-30" />

          <div className="pointer-events-none absolute inset-0 z-0">
            {EXPERT_PARTICLES.map(p => (
              <div
                key={p.id}
                className="animate-float absolute h-1.5 w-1.5 rounded-sm bg-violet-300/70 opacity-45 dark:bg-violet-300/80 dark:opacity-45"
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
                  <EmojiDisplay emoji="🧠" size="1.6rem" className="drop-shadow-md" />
                  <h3 className="text-xl font-bold tracking-tight text-[#2f315f] md:text-2xl dark:text-[#eef1ff] dark:drop-shadow-md">
                    {t('homeView.expertEntry')}
                  </h3>
                </div>
                <div className="h-1 w-12 rounded-full bg-[#8f84d8]/45 transition-all duration-500 group-hover:w-20 group-hover:bg-[#8478d4]/70 dark:bg-[#a59cf0]/55 dark:group-hover:bg-[#b2a8ff]" />
              </div>

              <div className="hidden rounded-full bg-white/35 p-2 backdrop-blur-sm transition-transform duration-500 group-hover:-rotate-12 sm:block dark:bg-white/10">
                <EmojiDisplay emoji="💡" size="1.2rem" className="drop-shadow-md" />
              </div>
            </div>

            <div className="flex items-end justify-between">
              <p className="max-w-[70%] text-xs font-medium text-[#4a4e78] md:text-sm dark:text-[#d7dcff] dark:drop-shadow-sm">
                {t('homeView.expertEntryHint')}
              </p>

              <div className="rounded-full bg-white/45 p-2 text-[#4a4e78] shadow-md backdrop-blur-md transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white/60 dark:bg-white/10 dark:text-white dark:shadow-lg dark:group-hover:bg-white/20">
                <ArrowRight size={20} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

ExpertModeCard.displayName = 'ExpertModeCard'

export default ExpertModeCard
