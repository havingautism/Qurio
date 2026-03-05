import clsx from 'clsx'
import EmojiDisplay from './EmojiDisplay'
import {
  AGENT_AVATAR_SHAPE_CIRCLE,
  getAgentAvatarImage,
  getAgentAvatarShape,
  getAgentAvatarType,
} from '../lib/agentAppearance'

const AgentAvatar = ({
  agent = null,
  emoji = '',
  size = '1.25rem',
  className = '',
  imageClassName = '',
  fallbackClassName = '',
}) => {
  const avatarType = getAgentAvatarType(agent)
  const avatarImage = getAgentAvatarImage(agent)
  const avatarShape = getAgentAvatarShape(agent)
  const shapeClassName =
    avatarShape === AGENT_AVATAR_SHAPE_CIRCLE ? 'rounded-full' : 'rounded-[22%]'
  const emojiSize =
    typeof size === 'number' ? `${size * 0.68}px` : size === '100%' ? '68%' : `calc(${size} * 0.68)`

  if (avatarType === 'image' && avatarImage) {
    return (
      <span
        className={clsx(
          'inline-flex shrink-0 items-center justify-center overflow-hidden bg-gray-200/60 dark:bg-white/10',
          shapeClassName,
          className,
        )}
        style={{ width: size, height: size }}
      >
        <img
          src={avatarImage}
          alt={agent?.name || 'Agent avatar'}
          className={clsx('h-full w-full object-cover', imageClassName)}
          loading="lazy"
        />
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white/35 dark:border-white/12 dark:bg-white/5',
        shapeClassName,
        fallbackClassName,
        className,
      )}
      style={{ width: size, height: size }}
    >
      <EmojiDisplay emoji={emoji || agent?.emoji} size={emojiSize} />
    </span>
  )
}

export default AgentAvatar
