export const AGENT_AVATAR_TYPE_EMOJI = 'emoji'
export const AGENT_AVATAR_TYPE_IMAGE = 'image'
export const AGENT_AVATAR_SHAPE_ROUNDED = 'rounded'
export const AGENT_AVATAR_SHAPE_CIRCLE = 'circle'
export const AGENT_BANNER_MODE_NONE = 'none'
export const AGENT_BANNER_MODE_MANUAL = 'manual'

export const getAgentAvatarType = agent =>
  agent?.avatarType === AGENT_AVATAR_TYPE_IMAGE && agent?.avatarImage
    ? AGENT_AVATAR_TYPE_IMAGE
    : AGENT_AVATAR_TYPE_EMOJI

export const getAgentAvatarImage = agent =>
  typeof agent?.avatarImage === 'string' ? agent.avatarImage : ''

export const getAgentAvatarShape = agent =>
  agent?.avatarShape === AGENT_AVATAR_SHAPE_CIRCLE
    ? AGENT_AVATAR_SHAPE_CIRCLE
    : agent?.avatarShape === AGENT_AVATAR_SHAPE_ROUNDED
      ? AGENT_AVATAR_SHAPE_ROUNDED
      : AGENT_AVATAR_SHAPE_CIRCLE

export const getAgentBannerMode = agent => {
  const mode = String(agent?.bannerMode || '').trim()
  if (mode === AGENT_BANNER_MODE_MANUAL) return AGENT_BANNER_MODE_MANUAL
  return AGENT_BANNER_MODE_NONE
}

export const getAgentBannerImage = agent =>
  typeof agent?.bannerImage === 'string' ? agent.bannerImage : ''

export const hasManualAgentBanner = agent =>
  getAgentBannerMode(agent) === AGENT_BANNER_MODE_MANUAL && Boolean(getAgentBannerImage(agent))
