import { ArrowRight, BrainCircuit } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

const ExpertModeCard = memo(({ onClick }) => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full justify-center">
      <div className="group relative w-full cursor-pointer" onClick={onClick}>
        <div className="relative z-10 h-30 overflow-hidden rounded-3xl border border-gray-200 bg-white/60 p-6 shadow-md backdrop-blur-md transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-2xl group-active:scale-[0.98] sm:h-30 dark:border-zinc-700/30 dark:bg-zinc-900/60 dark:shadow-2xl">
          <div className="relative z-20 flex h-full flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2 shadow-sm backdrop-blur-sm transition-transform duration-300 group-hover:rotate-6 dark:bg-zinc-800/40">
                <BrainCircuit size={20} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="text-xl leading-none font-black tracking-tight text-gray-900 md:text-2xl dark:text-white">
                  {t('homeView.expertEntry')}
                </h3>
                <div className="bg-primary-500 mt-1 h-1 w-8 origin-left transform rounded-full transition-transform duration-500 group-hover:scale-x-150" />
              </div>
            </div>

            <div className="flex items-end justify-between">
              <p className="pr-6 text-xs leading-tight font-bold text-gray-700 drop-shadow-sm md:text-sm dark:text-gray-300">
                {t('homeView.expertEntryHint')}
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

ExpertModeCard.displayName = 'ExpertModeCard'

export default ExpertModeCard
