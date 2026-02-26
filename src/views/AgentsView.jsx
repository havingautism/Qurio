import clsx from 'clsx'
import { Plus, Smile, Sparkles, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'
import { getAgentDisplayDescription, getAgentDisplayName } from '../lib/agentDisplay'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'

const AgentsView = () => {
  const { t } = useTranslation()
  const { onCreateAgent, onEditAgent, isSidebarPinned, agents, agentsLoading, toggleSidebar } =
    useAppContext()

  return (
    <div
      className={clsx(
        'bg-background text-foreground relative h-full flex-1 overflow-hidden transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-8">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <button
              onClick={() => toggleSidebar()}
              aria-label="Open sidebar"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md md:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
            >
              <Menu size={20} strokeWidth={2} />
            </button>
            <Smile size={32} className="text-primary-500" />
            <h1 className="text-2xl font-medium sm:text-3xl">{t('agentsView.title')}</h1>
          </div>

          {/* My Agents Section */}
          <div className="mb-12">
            <h2 className="mb-4 text-lg font-medium text-gray-700 dark:text-gray-300">
              {t('agentsView.myAgents')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Create Card */}
              <div
                onClick={onCreateAgent}
                className="group flex min-h-[160px] cursor-pointer flex-col justify-between rounded-xl border border-white/40 bg-white/60 p-6 shadow-sm backdrop-blur-xl transition-all hover:bg-white/80 dark:border-zinc-800/50 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80"
              >
                <div className="bg-primary-500 mb-4 flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform group-hover:scale-110">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-medium">{t('agentsView.createAgent')}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('agentsView.createAgentDescription')}
                  </p>
                </div>
              </div>

              {/* Agent Cards */}
              {agentsLoading && agents.length === 0 ? (
                <div className="col-span-full text-sm text-gray-500 dark:text-gray-400">
                  {t('agentsView.loading')}
                </div>
              ) : (
                [...agents]
                  .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)))
                  .map(agent => (
                    <div
                      key={agent.id}
                      onClick={() => onEditAgent(agent)}
                      className={clsx(
                        'group flex min-h-[160px] flex-col justify-between rounded-xl bg-gray-100 p-6 transition-colors dark:bg-zinc-900',
                        'cursor-pointer hover:bg-gray-200 dark:hover:bg-zinc-800',
                      )}
                    >
                      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-xl dark:bg-zinc-800">
                        <EmojiDisplay emoji={agent.emoji} />
                      </div>
                      <div>
                        <h3 className="mb-1 truncate text-lg font-medium">
                          {getAgentDisplayName(agent, t)}
                        </h3>
                        <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                          {getAgentDisplayDescription(agent, t)}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                          <Sparkles size={12} />
                          <span className="capitalize">
                            {agent.provider || t('agentsView.defaultProvider')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentsView
