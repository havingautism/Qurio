import clsx from 'clsx'
import { Plus, Smile, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'
import { getAgentDisplayDescription, getAgentDisplayName } from '../lib/agentDisplay'

const AgentsView = () => {
  const { t } = useTranslation()
  const { onCreateAgent, onEditAgent, isSidebarPinned, agents, agentsLoading } = useAppContext()

  return (
    <div
      className={clsx(
        'flex-1 h-full overflow-y-auto bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="w-full max-w-5xl mx-auto sm:px-6 sm:py-8 px-3 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Smile size={32} className="text-primary-500" />
          <h1 className="text-3xl font-medium">{t('agentsView.title')}</h1>
        </div>

        {/* My Agents Section */}
        <div className="mb-12">
          <h2 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">
            {t('agentsView.myAgents')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Create Card */}
            <div
              onClick={onCreateAgent}
              className="group p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors flex flex-col justify-between min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <div>
                <h3 className="font-medium text-lg mb-1">{t('agentsView.createAgent')}</h3>
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
                      'group p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 transition-colors flex flex-col justify-between min-h-[160px]',
                      'cursor-pointer hover:bg-gray-200 dark:hover:bg-zinc-800',
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-xl mb-4">
                      <EmojiDisplay emoji={agent.emoji} />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg mb-1 truncate">
                        {getAgentDisplayName(agent, t)}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
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
  )
}

export default AgentsView
