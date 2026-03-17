import clsx from 'clsx'
import AgentAvatar from './AgentAvatar'
import { getAgentDisplayDescription, getAgentDisplayName } from '../lib/agentDisplay'

const ConversationBanner = ({ agent, t, className = '' }) => {
  if (!agent?.bannerImage) return null

  return (
    <section className={clsx('mx-auto w-full max-w-3xl px-3 sm:px-5', className)}>
      <div className="group relative overflow-hidden rounded-[28px] border border-black/6 bg-white/70 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/8 dark:bg-zinc-900/55">
        <div className="relative h-40 w-full overflow-hidden sm:h-48">
          <img
            src={agent.bannerImage}
            alt={getAgentDisplayName(agent, t) || 'Conversation banner'}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/10 via-black/5 to-black/45" />
        </div>
        <div className="absolute right-0 bottom-0 left-0 flex items-end gap-3 p-4 sm:p-5">
          <AgentAvatar
            agent={agent}
            size="3.25rem"
            className="border border-white/35 bg-white/90 shadow-lg dark:border-white/10 dark:bg-zinc-900/80"
          />
          <div className="min-w-0 text-white">
            <div className="truncate text-base font-semibold sm:text-lg">
              {getAgentDisplayName(agent, t)}
            </div>
            <div className="line-clamp-2 text-xs text-white/80 sm:text-sm">
              {getAgentDisplayDescription(agent, t)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ConversationBanner
