export const getAgentDisplayName = (agent, t) => {
  if (!agent) return ''
  if (agent.isDefault && typeof t === 'function') {
    return t('agents.defaults.name') || agent.name || ''
  }
  if (agent.isDeepResearchSystem && typeof t === 'function') {
    return t('deepResearch.agentName') || agent.name || ''
  }
  return agent.name || ''
}

export const getAgentDisplayDescription = (agent, t) => {
  if (!agent) return ''
  if (agent.isDefault && typeof t === 'function') {
    return t('agents.defaults.description') || agent.description || ''
  }
  if (agent.isDeepResearchSystem && typeof t === 'function') {
    return t('deepResearch.agentDescription') || agent.description || ''
  }
  return agent.description || ''
}
