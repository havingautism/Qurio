export const normalizeExpertResponses = message => {
  const source = Array.isArray(message?.expertResponses) ? message.expertResponses : []
  return source
    .map(item => ({
      agentId: String(item?.agentId || ''),
      agentName: String(item?.agentName || ''),
      agentEmoji: String(item?.agentEmoji || ''),
      task: String(item?.task || ''),
      content: typeof item?.content === 'string' ? item.content : '',
      thought: typeof item?.thought === 'string' ? item.thought : '',
      thoughtHistory: Array.isArray(item?.thoughtHistory) ? item.thoughtHistory : [],
      toolCallHistory: Array.isArray(item?.toolCallHistory) ? item.toolCallHistory : [],
      streamBlocks: Array.isArray(item?.streamBlocks) ? item.streamBlocks : [],
      provider: item?.provider || null,
      model: item?.model || null,
      status: String(item?.status || 'pending'),
      searchBackend: typeof item?.searchBackend === 'string' ? item.searchBackend : null,
      searchBackends: Array.isArray(item?.searchBackends) ? item.searchBackends : [],
    }))
    .filter(item => item.agentId)
}

export const isExpertAiMessage = (message, responses) =>
  Boolean(message?.expertMode) &&
  message?.role === 'ai' &&
  Array.isArray(responses) &&
  responses.length > 0

export const resolvePreferredExpertAgentId = ({ message, responses, currentAgentId }) => {
  const list = Array.isArray(responses) ? responses : []
  if (list.length === 0) return ''
  if (currentAgentId && list.some(item => item.agentId === currentAgentId)) return currentAgentId
  const preferred = String(message?.expertActiveAgentId || '')
  if (preferred && list.some(item => item.agentId === preferred)) return preferred
  return String(list[0]?.agentId || '')
}

export const resolveActiveExpertResponse = (responses, activeAgentId) => {
  const list = Array.isArray(responses) ? responses : []
  if (list.length === 0) return null
  return list.find(item => item.agentId === activeAgentId) || list[0]
}

export const buildExpertSyntheticMessage = ({ message, activeResponse }) => {
  if (!message || !activeResponse) return message
  const isActiveStreaming = activeResponse?.status === 'running'
  return {
    ...message,
    expertMode: false,
    expertResponses: [],
    expertPlan: '',
    expertPlanLoading: false,
    expertActiveAgentId: null,
    agentId: activeResponse?.agentId || message?.agentId,
    agent_id: activeResponse?.agentId || message?.agent_id,
    agentName: activeResponse?.agentName || message?.agentName,
    agent_name: activeResponse?.agentName || message?.agent_name,
    agentEmoji: activeResponse?.agentEmoji || message?.agentEmoji,
    agent_emoji: activeResponse?.agentEmoji || message?.agent_emoji,
    provider: activeResponse?.provider || message?.provider,
    model: activeResponse?.model || message?.model,
    content: activeResponse?.content || '',
    thought: activeResponse?.thought || '',
    thoughtHistory: activeResponse?.thoughtHistory || [],
    toolCallHistory: activeResponse?.toolCallHistory || [],
    // Avoid replaying persisted per-token reasoning blocks after completion.
    streamBlocks: isActiveStreaming ? activeResponse?.streamBlocks || [] : [],
    searchBackend: activeResponse?.searchBackend || null,
    searchBackends: activeResponse?.searchBackends || [],
    isStreaming: isActiveStreaming,
  }
}

export const resolveExpertPlanText = message => {
  const direct = typeof message?.expertPlan === 'string' ? message.expertPlan.trim() : ''
  if (direct) return direct

  const parseFromJsonString = raw => {
    if (typeof raw !== 'string' || !raw.trim()) return ''
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && typeof parsed.expertPlan === 'string') {
        return parsed.expertPlan.trim()
      }
    } catch {
      return ''
    }
    return ''
  }

  const fromThinkingProcess = parseFromJsonString(message?.thinking_process)
  if (fromThinkingProcess) return fromThinkingProcess

  const fromThinkingProcessCamel = parseFromJsonString(message?.thinkingProcess)
  if (fromThinkingProcessCamel) return fromThinkingProcessCamel

  return ''
}
