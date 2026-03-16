const MAX_SUMMARY_LENGTH = 140

const truncate = (value, limit = MAX_SUMMARY_LENGTH) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ''
  if (text.length <= limit) return text
  return `${text.slice(0, limit).trimEnd()}...`
}

const safeParseJson = value => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

const toPrettyJson = value => {
  if (value == null) return ''
  if (typeof value === 'string') {
    const parsed = safeParseJson(value)
    if (parsed !== value) {
      return JSON.stringify(parsed, null, 2)
    }
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const normalizeStatus = value => {
  const status = String(value || '').toLowerCase()
  if (!status) return 'done'
  if (status === 'completed') return 'done'
  if (status === 'success') return 'done'
  if (status === 'idle') return 'done'
  return status
}

const normalizeDurationMs = value => {
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : null
}

const createNode = ({
  id,
  type,
  title,
  summary = '',
  status = 'done',
  actor = null,
  durationMs = null,
  detailSections = [],
  badge = null,
  meta = null,
}) => ({
  id,
  type,
  title,
  summary: truncate(summary),
  status: normalizeStatus(status),
  actor,
  durationMs: normalizeDurationMs(durationMs),
  detailSections: Array.isArray(detailSections) ? detailSections.filter(Boolean) : [],
  badge,
  meta: meta && typeof meta === 'object' ? meta : null,
})

const textSection = (label, value, options = {}) => {
  if (value == null) return null
  const text = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!text) return null
  return {
    label,
    kind: options.kind || 'text',
    value: text,
  }
}

const jsonSection = (label, value) => {
  const formatted = toPrettyJson(value)
  if (!formatted) return null
  return {
    label,
    kind: 'json',
    value: formatted,
  }
}

const sourceSection = sources => {
  if (!Array.isArray(sources) || sources.length === 0) return null
  const items = sources
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const title = String(item.title || item.name || item.url || '').trim()
      const url = String(item.url || item.uri || '').trim()
      return title || url ? `${title}${title && url ? ' - ' : ''}${url}` : null
    })
    .filter(Boolean)
  if (items.length === 0) return null
  return {
    label: 'Sources',
    kind: 'list',
    value: items,
  }
}

const extractStreamOrderedToolNodes = streamBlocks => {
  if (!Array.isArray(streamBlocks)) return []
  const nodes = []

  streamBlocks.forEach((block, index) => {
    const type = String(block?.type || '').toLowerCase()
    if (type === 'reasoning' || type === 'thought') {
      const content = String(block?.content || '').trim()
      if (!content) return
      nodes.push(
        createNode({
          id: `reasoning-${index}`,
          type: 'reasoning',
          title: 'Reasoning',
          summary: content,
          durationMs: block?.duration_ms,
          detailSections: [textSection('Content', content)],
        }),
      )
      return
    }

    if (type !== 'tool') return

    const toolName = String(block?.name || 'Tool')
    const toolStatus = normalizeStatus(block?.status || 'done')
    const argumentsValue = safeParseJson(block?.arguments)
    const outputValue = safeParseJson(block?.output)
    const inputSummary =
      typeof block?.arguments === 'string'
        ? block.arguments
        : argumentsValue && typeof argumentsValue === 'object'
          ? toPrettyJson(argumentsValue)
          : ''

    nodes.push(
      createNode({
        id: `tool-call-${block?.tool_call_id || index}`,
        type: 'tool_call',
        title: toolName,
        badge: 'Tool',
        summary: inputSummary || `${toolName} called`,
        status: toolStatus === 'error' ? 'error' : 'done',
        durationMs: block?.duration_ms,
        detailSections: [
          textSection('Tool', toolName),
          jsonSection('Input', argumentsValue ?? block?.arguments),
        ],
      }),
    )

    if (block?.output != null || toolStatus === 'done' || toolStatus === 'error') {
      nodes.push(
        createNode({
          id: `tool-result-${block?.tool_call_id || index}`,
          type: 'tool_result',
          title: `${toolName} Result`,
          badge: toolStatus === 'error' ? 'Error' : 'Result',
          summary:
            typeof block?.output === 'string'
              ? block.output
              : outputValue != null
                ? toPrettyJson(outputValue)
                : toolStatus === 'error'
                  ? `${toolName} failed`
                  : `${toolName} completed`,
          status: toolStatus,
          durationMs: block?.duration_ms,
          detailSections: [
            textSection('Tool', toolName),
            jsonSection('Output', outputValue ?? block?.output),
          ],
        }),
      )
    }
  })

  return nodes
}

const buildStandardPipeline = message => {
  const nodes = extractStreamOrderedToolNodes(message?.streamBlocks)
  const finalContent = String(message?.content || '').trim()
  if (finalContent) {
    nodes.push(
      createNode({
        id: 'final-response',
        type: 'final_response',
        title: 'Final Response',
        badge: 'Answer',
        summary: finalContent,
        durationMs: message?.finalAnswerDurationMs,
        detailSections: [
          textSection('Content', finalContent),
          sourceSection(message?.sources),
          sourceSection(message?.documentSources),
        ],
      }),
    )
  }

  return nodes
}

const buildExpertPipeline = message => {
  const responses = Array.isArray(message?.expertResponses) ? message.expertResponses : []
  const nodes = []

  responses.forEach((response, index) => {
    const agentName = String(response?.agentName || `Agent ${index + 1}`)
    const role = String(response?.role || '').toLowerCase() === 'leader' ? 'Leader' : 'Member'
    nodes.push(
      createNode({
        id: `expert-agent-${response?.agentId || index}`,
        type: 'agent_switch',
        title: agentName,
        badge: role,
        actor: agentName,
        summary: response?.task || `${role} activated`,
        status: response?.status || 'done',
        detailSections: [
          textSection('Agent', agentName),
          textSection('Role', role),
          textSection('Assigned Task', response?.task),
        ],
      }),
    )

    extractStreamOrderedToolNodes(response?.streamBlocks).forEach(node => {
      nodes.push({
        ...node,
        id: `${response?.agentId || index}-${node.id}`,
        actor: agentName,
      })
    })
  })

  const finalContent = String(message?.content || '').trim()
  if (finalContent) {
    nodes.push(
      createNode({
        id: 'expert-final-response',
        type: 'final_response',
        title: 'Final Response',
        badge: 'Answer',
        summary: finalContent,
        detailSections: [textSection('Content', finalContent)],
      }),
    )
  }

  return nodes
}

const buildResearchPipeline = message => {
  const nodes = []
  const plan = String(message?.researchPlan || '').trim()
  if (plan) {
    nodes.push(
      createNode({
        id: 'research-plan',
        type: 'workflow_step',
        title: 'Research Plan',
        badge: 'Plan',
        summary: plan,
        detailSections: [textSection('Plan', plan)],
      }),
    )
  }

  const steps = Array.isArray(message?.researchSteps) ? message.researchSteps : []
  steps.forEach((step, index) => {
    const title =
      String(step?.title || step?.goal || step?.task || '').trim() ||
      `Step ${step?.step || index + 1}`
    nodes.push(
      createNode({
        id: `research-step-${step?.step || index + 1}`,
        type: 'workflow_step',
        title,
        badge: `Step ${step?.step || index + 1}`,
        summary: step?.summary || step?.finding || step?.content || title,
        status: step?.status || 'done',
        durationMs: step?.durationMs,
        detailSections: [
          textSection('Title', title),
          textSection('Goal', step?.goal),
          textSection('Output', step?.finding || step?.content || step?.summary),
          jsonSection('Metadata', step),
        ],
      }),
    )
  })

  extractStreamOrderedToolNodes(message?.streamBlocks).forEach(node => nodes.push(node))

  const finalContent = String(message?.content || '').trim()
  if (finalContent) {
    nodes.push(
      createNode({
        id: 'research-final-response',
        type: 'final_response',
        title: 'Final Report',
        badge: 'Answer',
        summary: finalContent,
        durationMs: message?.finalAnswerDurationMs,
        detailSections: [
          textSection('Content', finalContent),
          sourceSection(message?.sources),
          sourceSection(message?.documentSources),
        ],
      }),
    )
  }

  return nodes
}

export const buildMessagePipeline = message => {
  if (!message || (message.role !== 'ai' && message.role !== 'assistant')) return null

  let nodes = []
  let mode = 'chat'

  if (message?.expertMode) {
    mode = 'expert'
    nodes = buildExpertPipeline(message)
  } else if (
    message?.deepResearch ||
    (Array.isArray(message?.researchSteps) && message.researchSteps.length > 0)
  ) {
    mode = 'research'
    nodes = buildResearchPipeline(message)
  } else {
    nodes = buildStandardPipeline(message)
  }

  if (!Array.isArray(nodes) || nodes.length === 0) return null

  return {
    version: 1,
    mode,
    nodeCount: nodes.length,
    nodes,
  }
}

export const ensureMessagePipeline = message => {
  const existing = message?.pipelineTrace
  if (existing && typeof existing === 'object' && Array.isArray(existing.nodes)) return existing
  return buildMessagePipeline(message)
}
