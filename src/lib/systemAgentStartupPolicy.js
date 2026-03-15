export const resolveDefaultAgentStartupAction = existingAgent =>
  existingAgent ? 'reuse' : 'create'

export const resolveDeepResearchAgentStartupAction = () =>
  // Deep research agent creation is managed by migrations/bootstrap,
  // so startup should never attempt an insert with the fixed system ID.
  'reuse'
