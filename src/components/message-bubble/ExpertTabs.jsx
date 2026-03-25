import React, { memo } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, Clock } from 'lucide-react'
import { getExpertTabIndicators } from '../../lib/chat/expertUiUtils'
import AgentAvatar from '../AgentAvatar'

const ExpertTabs = memo(function ExpertTabs({
  isExpertMessage,
  isMobile,
  expertAgentSelectorRef,
  isExpertAgentSelectorOpen,
  setIsExpertAgentSelectorOpen,
  activeExpertResponse,
  expertAgent,
  expertResponses,
  agents,
  setActiveExpertAgentId,
  t,
}) {
  if (!isExpertMessage) return null

  if (isMobile) {
    return (
      <div className="relative mb-4 w-full" ref={expertAgentSelectorRef}>
        <button
          type="button"
          onMouseDown={e => {
            e.preventDefault()
            e.stopPropagation()
            setIsExpertAgentSelectorOpen(prev => !prev)
          }}
          className="flex h-12 w-full items-center justify-between gap-2 rounded-full bg-white/90 py-2 pr-3 pl-3 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-xl transition-all dark:bg-zinc-900/90 dark:text-gray-200"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <AgentAvatar
              agent={expertAgent || { emoji: activeExpertResponse?.agentEmoji }}
              emoji={activeExpertResponse?.agentEmoji}
              size="1.15rem"
            />
            <span className="truncate text-left text-sm font-semibold">
              {activeExpertResponse?.agentName || activeExpertResponse?.agentId}
            </span>
          </span>
          <ChevronDown
            size={15}
            className={clsx(
              'shrink-0 text-gray-400 transition-transform duration-200',
              isExpertAgentSelectorOpen && 'rotate-180',
            )}
          />
        </button>

        {isExpertAgentSelectorOpen && (
          <div
            className="absolute top-full left-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200/60 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/95"
            onMouseDown={e => e.stopPropagation()}
          >
            {expertResponses.map(item => {
              const isActive = item.agentId === activeExpertResponse?.agentId
              const { showAssignedMarker } = getExpertTabIndicators({
                response: item,
                isActive,
              })
              return (
                <button
                  type="button"
                  key={item.agentId}
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    setActiveExpertAgentId(item.agentId)
                    setIsExpertAgentSelectorOpen(false)
                  }}
                  className={clsx(
                    'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors',
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-gray-900 dark:text-gray-100'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-zinc-800/80',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <AgentAvatar
                      agent={
                        agents.find(a => String(a.id) === String(item.agentId)) || {
                          emoji: item.agentEmoji,
                        }
                      }
                      emoji={item.agentEmoji}
                      size="1.3rem"
                    />
                    <span className="text-base font-semibold">{item.agentName || item.agentId}</span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    <span
                      className={clsx(
                        'rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wider uppercase',
                        item.agentRole === 'leader'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
                      )}
                    >
                      {item.agentRole === 'leader'
                        ? t('agents.role.leader')
                        : t('agents.role.member')}
                    </span>
                    {item.status === 'error' && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    {item.status === 'active' && (
                      <span className="bg-primary-500 h-2 w-2 animate-pulse rounded-full" />
                    )}
                    {item.status === 'waiting' && (
                      <Clock size={12} className="animate-spin-slow text-amber-500" />
                    )}
                    {showAssignedMarker && (
                      <span className="bg-primary-500 shadow-primary-500/40 inline-flex h-1.5 w-1.5 rounded-full shadow-sm" />
                    )}
                    {isActive && <Check size={14} className="text-primary-500" />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="md:code-scrollbar mb-4 flex w-full flex-wrap gap-1 rounded-xl border border-gray-200/70 bg-gray-100/85 p-1 md:w-fit md:max-w-full md:flex-nowrap md:gap-1.5 md:overflow-x-auto md:p-1.5 dark:border-zinc-700/60 dark:bg-zinc-800/55">
      {expertResponses.map(item => {
        const isActive = item.agentId === activeExpertResponse?.agentId
        const { showAssignedMarker } = getExpertTabIndicators({
          response: item,
          isActive,
        })
        return (
          <button
            type="button"
            key={item.agentId}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              setActiveExpertAgentId(item.agentId)
            }}
            className={clsx(
              'relative flex min-w-0 flex-1 basis-[calc(50%-0.125rem)] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 sm:basis-auto sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:text-[15px] md:min-h-11 md:flex-none md:px-5 md:py-2 md:text-base',
              isActive
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5 dark:bg-zinc-700 dark:text-gray-100 dark:ring-white/10'
                : 'text-gray-500 hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-zinc-700/60 dark:hover:text-gray-300',
              item.status === 'active' && 'ring-primary-500/50 ring-2',
            )}
          >
            <AgentAvatar
              agent={
                agents.find(a => String(a.id) === String(item.agentId)) || {
                  emoji: item.agentEmoji,
                }
              }
              emoji={item.agentEmoji}
              size="1.35em"
            />
            <span className="min-w-0 truncate">{item.agentName || item.agentId}</span>
            <span
              className={clsx(
                'ml-1.5 shrink-0 rounded-[4px] px-1.5 py-[3px] text-[9px] font-bold tracking-wide uppercase sm:text-[10px] md:text-[11px]',
                item.agentRole === 'leader'
                  ? 'bg-amber-100/80 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                  : 'bg-gray-200/50 text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-500',
              )}
            >
              {item.agentRole === 'leader' ? t('agents.role.leader') : t('agents.role.member')}
            </span>

            {item.status === 'active' && (
              <div className="animate-status-halo ring-primary-500/50 pointer-events-none absolute -inset-px z-10 rounded-lg ring-1" />
            )}
            {item.status === 'error' && (
              <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
              </span>
            )}
            {item.status === 'waiting' && item.agentRole === 'leader' && (
              <Clock size={12} className="animate-spin-slow ml-1 text-amber-500" />
            )}
            {showAssignedMarker && (
              <span className="bg-primary-500 shadow-primary-500/40 absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full shadow-sm" />
            )}
          </button>
        )
      })}
    </div>
  )
})

ExpertTabs.displayName = 'ExpertTabs'

export default ExpertTabs
