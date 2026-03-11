export const resolveDefaultAgentStartupAction = existingAgent =>
  existingAgent ? 'reuse' : 'create'

export const resolveDeepResearchAgentStartupAction = existingAgent =>
  existingAgent ? 'reuse' : 'create'
