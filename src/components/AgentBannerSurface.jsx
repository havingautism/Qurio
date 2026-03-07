import clsx from 'clsx'
import AgentAvatar from './AgentAvatar'
import { getModelIcon, getModelIconClassName, renderProviderIcon } from '../lib/modelIcons'

export const AGENT_BANNER_ASPECT_RATIO = 520 / 188

const AgentBannerSurface = ({
  imageSrc = '',
  imageAlt = 'Agent banner',
  backgroundNode = null,
  agent,
  displayName,
  providerId,
  providerLabel,
  providerFallback,
  model,
  onAvatarClick,
  isAvatarClickable = false,
  className = '',
  frameClassName = '',
  frameStyle = undefined,
  avatarClassName = '',
}) => {
  const bannerAvatar = (
    <AgentAvatar
      agent={agent}
      size="2.5rem"
      className={clsx(
        'border-black/10 bg-white/24 shadow-inner transition hover:scale-105 dark:border-white/20 dark:bg-white/10',
        avatarClassName,
      )}
    />
  )

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-[28px] border border-black/8 bg-white/60 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-zinc-900/50',
        frameClassName,
      )}
      style={{ aspectRatio: String(AGENT_BANNER_ASPECT_RATIO), ...frameStyle }}
    >
      {backgroundNode || (
        <img
          src={imageSrc}
          alt={imageAlt}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/48 via-black/18 to-black/6 dark:from-black/78 dark:via-black/52 dark:to-black/16" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/10 dark:from-black/36 dark:to-white/8" />
      <div className="absolute inset-x-0 bottom-0 flex items-end p-4 sm:p-5">
        <div
          className={clsx(
            'inline-flex max-w-[min(88%,34rem)] items-center gap-3 self-end rounded-[28px] border border-black/8 bg-white/32 px-3 py-3 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md dark:border-white/12 dark:bg-black/22 dark:shadow-[0_14px_30px_-18px_rgba(0,0,0,0.9)]',
            className,
          )}
        >
          {isAvatarClickable ? (
            <button
              type="button"
              onClick={onAvatarClick}
              className="cursor-pointer rounded-full transition-opacity hover:opacity-80"
            >
              {bannerAvatar}
            </button>
          ) : (
            bannerAvatar
          )}
          <div className="flex min-w-0 flex-col leading-tight">
            <div className="truncate text-sm font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              {displayName}
            </div>
            <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/18 px-2.5 py-1 text-xs text-white/96 ring-1 ring-white/5 dark:bg-black/30 dark:text-white/92 dark:ring-white/10">
              {renderProviderIcon(providerId, {
                size: 12,
                alt: providerLabel,
                compact: true,
                wrapperClassName: 'w-3 h-3',
                imgClassName: 'w-full h-full object-contain',
              }) || (
                <span className="text-[10px] font-semibold">
                  {providerFallback?.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="truncate">{providerLabel}</span>
              {getModelIcon(model) && (
                <img
                  src={getModelIcon(model)}
                  alt=""
                  width={12}
                  height={12}
                  className={clsx('h-3 w-3 object-contain', getModelIconClassName(model))}
                />
              )}
              <span className="truncate">{model}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentBannerSurface
