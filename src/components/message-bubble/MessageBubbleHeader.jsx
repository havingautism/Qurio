import React, { memo } from 'react'
import clsx from 'clsx'
import AgentAvatar from '../AgentAvatar'
import AgentBannerSurface from '../AgentBannerSurface'
import ExpertTabs from './ExpertTabs'
import { AGENT_AVATAR_SHAPE_CIRCLE } from '../../lib/agentAppearance'

const MessageBubbleHeader = memo(function MessageBubbleHeader({
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
  hasAgentBanner,
  agentBannerImage,
  displayAgent,
  agentEmoji,
  displayAgentName,
  providerMeta,
  resolvedModel,
  handleAgentClick,
  targetAgent,
  agentName,
  displayAgentShape,
  renderProviderIcon,
  getModelIcon,
  getModelIconClassName,
}) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <ExpertTabs
        isExpertMessage={isExpertMessage}
        isMobile={isMobile}
        expertAgentSelectorRef={expertAgentSelectorRef}
        isExpertAgentSelectorOpen={isExpertAgentSelectorOpen}
        setIsExpertAgentSelectorOpen={setIsExpertAgentSelectorOpen}
        activeExpertResponse={activeExpertResponse}
        expertAgent={expertAgent}
        expertResponses={expertResponses}
        agents={agents}
        setActiveExpertAgentId={setActiveExpertAgentId}
        t={t}
      />

      <div className="text-gray-900 dark:text-gray-100">
        {hasAgentBanner ? (
          <AgentBannerSurface
            imageSrc={agentBannerImage}
            imageAlt={displayAgentName || 'Agent banner'}
            agent={displayAgent || { emoji: agentEmoji, name: displayAgentName }}
            displayName={displayAgentName}
            providerId={providerMeta.id}
            providerLabel={providerMeta.label}
            providerFallback={providerMeta.fallback}
            model={resolvedModel}
            onAvatarClick={handleAgentClick}
            isAvatarClickable={Boolean(targetAgent)}
          />
        ) : (
          <div className="relative flex items-center gap-3">
            {agentName ? (
              <div
                className={clsx(
                  'inline-flex max-w-[min(88%,34rem)] items-center gap-3',
                  hasAgentBanner &&
                    'self-end rounded-[28px] border border-black/8 bg-white/32 px-3 py-2 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md dark:border-white/12 dark:bg-black/22 dark:shadow-[0_14px_30px_-18px_rgba(0,0,0,0.9)]',
                )}
              >
                <div
                  onClick={handleAgentClick}
                  className={clsx(targetAgent && 'cursor-pointer transition-opacity hover:opacity-80')}
                >
                  <AgentAvatar
                    agent={displayAgent || { emoji: agentEmoji, name: displayAgentName }}
                    emoji={agentEmoji}
                    size="2.5rem"
                    className={clsx(
                      'shadow-inner transition hover:scale-105',
                      hasAgentBanner
                        ? 'border-black/10 bg-white/24 dark:border-white/20 dark:bg-white/10'
                        : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-zinc-800',
                      displayAgentShape === AGENT_AVATAR_SHAPE_CIRCLE
                        ? 'rounded-full'
                        : 'rounded-[22%]',
                    )}
                  />
                </div>
                <div className="flex min-w-0 flex-col leading-tight">
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={clsx(
                          'text-sm font-semibold',
                          hasAgentBanner &&
                            'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
                        )}
                      >
                        {displayAgentName}
                      </span>
                    </div>
                  </div>
                  <div
                    className={clsx(
                      'flex w-fit max-w-full items-center gap-1.5 rounded-full text-xs',
                      hasAgentBanner
                        ? 'bg-black/18 px-2.5 py-1 text-white/96 ring-1 ring-white/22 dark:bg-black/30 dark:text-white/92 dark:ring-white/10'
                        : 'text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {renderProviderIcon(providerMeta.id, {
                      size: 12,
                      alt: providerMeta.label,
                      compact: true,
                      wrapperClassName: 'w-3 h-3',
                      imgClassName: 'w-full h-full object-contain',
                    }) || (
                      <span className="text-[10px] font-semibold">
                        {providerMeta.fallback?.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate">{providerMeta.label}</span>
                    {getModelIcon(resolvedModel) && (
                      <img
                        src={getModelIcon(resolvedModel)}
                        alt=""
                        width={12}
                        height={12}
                        className={clsx('h-3 w-3 object-contain', getModelIconClassName(resolvedModel))}
                        loading="lazy"
                      />
                    )}
                    <span className="truncate">{resolvedModel}</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  onClick={handleAgentClick}
                  className={clsx(
                    'flex items-center justify-center overflow-hidden rounded-full shadow-inner',
                    hasAgentBanner ? 'bg-white/14' : '',
                    targetAgent && 'cursor-pointer transition-opacity hover:opacity-80',
                  )}
                >
                  {renderProviderIcon(providerMeta.id, {
                    size: 30,
                    alt: providerMeta.label,
                    wrapperClassName: 'p-0 w-10 h-10',
                    imgClassName: 'w-full h-full object-contain',
                  }) || (
                    <span
                      className={clsx(
                        'text-sm font-semibold',
                        hasAgentBanner ? 'text-white' : 'text-gray-700 dark:text-gray-200',
                      )}
                    >
                      {providerMeta.fallback?.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex grow flex-col leading-tight">
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-semibold">{providerMeta.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {getModelIcon(resolvedModel) && (
                      <img
                        src={getModelIcon(resolvedModel)}
                        alt=""
                        width={14}
                        height={14}
                        className={clsx('h-3.5 w-3.5 object-contain', getModelIconClassName(resolvedModel))}
                        loading="lazy"
                      />
                    )}
                    <span
                      className={clsx(
                        'text-xs',
                        hasAgentBanner ? 'text-white/82' : 'text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {resolvedModel}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

MessageBubbleHeader.displayName = 'MessageBubbleHeader'

export default MessageBubbleHeader
