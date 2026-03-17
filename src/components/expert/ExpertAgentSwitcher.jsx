import { Check } from 'lucide-react'
import clsx from 'clsx'
import React, { useMemo, useState } from 'react'
import useIsMobile from '../../hooks/useIsMobile'
import EmojiDisplay from '../EmojiDisplay'

const ExpertAgentSwitcher = ({ responses = [], activeAgentId = '', onSelectAgent }) => {
  if (!Array.isArray(responses) || responses.length === 0) return null
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const active = useMemo(
    () => responses.find(item => item.agentId === activeAgentId) || responses[0],
    [activeAgentId, responses],
  )

  return (
    <>
      {/* <div className="mb-4 ml-5 flex items-center gap-2 text-gray-600 sm:ml-0 dark:text-gray-300">
        <BrainCircuit size={18} className="text-primary-500/80 dark:text-primary-300/75" />
        <span className="text-3xl font-semibold tracking-tight">Expert Plan</span>
        <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-xl text-gray-600 dark:bg-zinc-800/80 dark:text-gray-300">
          {responses.length}
        </span>
      </div> */}

      {isMobile ? (
        <div className="mx-5 mb-4 sm:mx-0">
          <button
            type="button"
            onClick={() => setIsOpen(prev => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200/70 bg-gray-100/85 px-3 py-2 text-sm font-semibold text-gray-700 dark:border-zinc-700/60 dark:bg-zinc-800/55 dark:text-gray-200"
          >
            <span className="flex min-w-0 items-center gap-2">
              <EmojiDisplay emoji={active?.agentEmoji} size="1.05em" />
              <span className="truncate">{active?.agentName || active?.agentId}</span>
            </span>
            <span className="text-xs opacity-70">{isOpen ? '▲' : '▼'}</span>
          </button>
          {isOpen && (
            <div className="mt-2 flex flex-col gap-1 rounded-xl border border-gray-200/70 bg-gray-100/85 p-1 dark:border-zinc-700/60 dark:bg-zinc-800/55">
              {responses.map(item => {
                const isActive = item.agentId === activeAgentId
                return (
                  <button
                    type="button"
                    key={item.agentId}
                    onClick={() => {
                      onSelectAgent && onSelectAgent(item.agentId)
                      setIsOpen(false)
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-all duration-200',
                      isActive
                        ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                        : 'text-gray-500 hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-zinc-700/60 dark:hover:text-gray-300',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <EmojiDisplay emoji={item.agentEmoji} size="1.05em" />
                      <span className="truncate">{item.agentName || item.agentId}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {item.status !== 'done' && (
                        <span
                          className={clsx(
                            'h-2 w-2 rounded-full',
                            item.status === 'error' ? 'bg-red-500' : 'animate-pulse bg-amber-500',
                          )}
                        />
                      )}
                      {isActive && <Check size={14} className="text-primary-500" />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 ml-5 flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-gray-200/70 bg-gray-100/85 p-1 sm:ml-0 dark:border-zinc-700/60 dark:bg-zinc-800/55">
          {responses.map(item => {
            const isActive = item.agentId === activeAgentId
            return (
              <button
                type="button"
                key={item.agentId}
                onClick={() => onSelectAgent && onSelectAgent(item.agentId)}
                className={clsx(
                  'flex min-w-0 flex-none items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-black/5 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-gray-100'
                    : 'text-gray-500 hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-zinc-700/60 dark:hover:text-gray-300',
                )}
              >
                <EmojiDisplay emoji={item.agentEmoji} size="1.05em" />
                <span className="truncate">{item.agentName || item.agentId}</span>
                {item.status !== 'done' && (
                  <span
                    className={clsx(
                      'h-2 w-2 rounded-full',
                      item.status === 'error' ? 'bg-red-500' : 'animate-pulse bg-amber-500',
                    )}
                  />
                )}
                {isActive && <Check size={14} className="text-primary-500" />}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

export default React.memo(ExpertAgentSwitcher)
