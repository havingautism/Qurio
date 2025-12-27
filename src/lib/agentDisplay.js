export const getAgentDisplayName = (agent, t) => {
  if (!agent) return ''
  if (agent.isDefault && typeof t === 'function') {
    return t('agents.defaults.name') || agent.name || ''
  }
  return agent.name || ''
}

export const getAgentDisplayDescription = (agent, t) => {
  if (!agent) return ''
  if (agent.isDefault && typeof t === 'function') {
    return t('agents.defaults.description') || agent.description || ''
  }
  return agent.description || ''
}
