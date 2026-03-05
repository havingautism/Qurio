import clsx from 'clsx'
import { Plus, Sparkles, Menu } from 'lucide-react'
import { Robot as RobotIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import AgentAvatar from '../components/AgentAvatar'
import { getAgentDisplayDescription, getAgentDisplayName } from '../lib/agentDisplay'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'

const AgentsView = () => {
  const { t } = useTranslation()
  const { onCreateAgent, onEditAgent, isSidebarPinned, agents, agentsLoading, toggleSidebar } =
    useAppContext()

  return (
    <div
      className={clsx(
        'bg-background text-foreground relative flex h-full flex-1 flex-col overflow-hidden transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* Fixed Header */}
        <div className="mx-auto w-full max-w-5xl shrink-0 px-3 pt-5 pb-2 sm:px-6 sm:pt-8 sm:pb-4">
          <div className="mb-6 flex items-center justify-between sm:mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleSidebar()}
                aria-label="Open sidebar"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md md:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-3">
                <RobotIcon size={32} weight="duotone" className="text-primary-500" />
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {t('agentsView.title')}
                </h1>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="scrollbar-default no-scrollbar relative flex-1 overflow-y-auto sm:pb-20">
          <div className="mx-auto w-full max-w-5xl px-3 sm:px-6">
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
                          'group flex min-h-[160px] flex-col justify-between rounded-xl border border-white/40 bg-white/60 p-6 shadow-sm backdrop-blur-xl transition-all hover:bg-white/80 dark:border-zinc-800/50 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/80',
                          'cursor-pointer',
                        )}
                      >
                        <AgentAvatar
                          agent={agent}
                          size="2.5rem"
                          className="mb-4 bg-gray-200/50 text-xl dark:bg-white/10"
                        />
                        <div>
                          <h3 className="mb-1 truncate text-lg font-semibold">
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
    </div>
  )
}

export default AgentsView
