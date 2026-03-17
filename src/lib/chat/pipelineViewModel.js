const PIPELINE_SCHEMA_VERSION = 7
const MAX_SUMMARY_LENGTH = 92

const stripMarkdownLikeSyntax = value =>
  String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const summarizeText = (value, limit = MAX_SUMMARY_LENGTH) => {
  const normalized = stripMarkdownLikeSyntax(value)
  if (!normalized) return ''
  const firstSentence = normalized.split(/(?<=[.!?。！？])\s+/)[0]?.trim() || normalized
  const base = firstSentence.length >= 18 ? firstSentence : normalized
  if (base.length <= limit) return base
  return `${base.slice(0, limit).trimEnd()}...`
}

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
    if (parsed !== value) return JSON.stringify(parsed, null, 2)
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
  if (status === 'completed' || status === 'success' || status === 'idle') return 'done'
  return status
}

const normalizeDurationMs = value => {
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : null
}

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
  const text = toPrettyJson(value)
  if (!text) return null
  return {
    label,
    kind: 'json',
    value: text,
  }
}

const sourceSection = sources => {
  if (!Array.isArray(sources) || sources.length === 0) return null
  const items = sources
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const title = String(item.title || item.name || item.url || '').trim()
      const url = String(item.url || item.uri || '').trim()
      if (!title && !url) return null
      return title && url ? `${title} - ${url}` : title || url
    })
    .filter(Boolean)
  if (items.length === 0) return null
  return {
    label: 'Sources',
    kind: 'list',
    value: items,
  }
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
  summary: truncate(compactSummaryByType(type, summary, meta)),
  status: normalizeStatus(status),
  actor,
  durationMs: normalizeDurationMs(durationMs),
  detailSections: Array.isArray(detailSections) ? detailSections.filter(Boolean) : [],
  badge,
  meta: meta && typeof meta === 'object' ? meta : null,
})

const shouldKeepInlineSummary = (type, meta) => {
  if (type === 'tool_call' || type === 'tool_result') {
    return String(meta?.toolName || '') === 'delegate_task_to_member'
  }
  return false
}

const compactSummaryByType = (type, summary, meta) => {
  if (!summary) return ''
  if (shouldKeepInlineSummary(type, meta)) return summary
  return ''
}

const getBlockOrder = (block, fallback) => {
  if (Number.isFinite(block?.global_seq)) return Number(block.global_seq)
  if (Number.isFinite(block?.globalSeq)) return Number(block.globalSeq)
  if (Number.isFinite(block?.seq)) return Number(block.seq)
  return fallback
}

const getHistoryOrder = (item, fallback) => {
  if (Number.isFinite(item?.globalSeq)) return Number(item.globalSeq)
  if (Number.isFinite(item?.global_seq)) return Number(item.global_seq)
  if (Number.isFinite(item?.streamOrder)) return Number(item.streamOrder)
  if (Number.isFinite(item?.stream_order)) return Number(item.stream_order)
  return fallback
}

const toSortedBlocks = streamBlocks => {
  if (!Array.isArray(streamBlocks)) return []
  return streamBlocks
    .map((block, index) => ({
      ...block,
      seq: Number.isFinite(block?.seq) ? Number(block.seq) : index + 1,
      global_seq: Number.isFinite(block?.global_seq)
        ? Number(block.global_seq)
        : Number.isFinite(block?.globalSeq)
          ? Number(block.globalSeq)
          : null,
      _index: index,
      _type: String(block?.type || '').toLowerCase(),
    }))
    .filter(block => block._type)
    .sort((a, b) => {
      const aOrder = getBlockOrder(a, a._index + 1)
      const bOrder = getBlockOrder(b, b._index + 1)
      return aOrder === bOrder ? a._index - b._index : aOrder - bOrder
    })
}

const resolveExpertRole = response => {
  const role = String(response?.agentRole || response?.role || '').toLowerCase()
  return role === 'leader' ? 'leader' : 'member'
}

const roleBadgeLabel = role => (role === 'leader' ? 'Leader' : 'Member')

const parseDelegateInfo = argumentsValue => {
  const parsed = safeParseJson(argumentsValue)
  const objectLike = parsed && typeof parsed === 'object' ? parsed : null
  if (objectLike) {
    return {
      memberId: String(objectLike.member_id || objectLike.memberId || '').trim(),
      memberName: String(objectLike.member_name || objectLike.memberName || '').trim(),
      task: String(objectLike.task || objectLike.description || '').trim(),
    }
  }

  const raw = String(argumentsValue || '')
  if (!raw.trim()) return null
  const memberIdMatch = raw.match(
    /<arg_key>\s*member_id\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/i,
  )
  const taskMatch = raw.match(
    /<arg_key>\s*task\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/i,
  )
  return {
    memberId: memberIdMatch?.[1]?.trim() || '',
    memberName: '',
    task: taskMatch?.[1]?.trim() || '',
  }
}

const resolveDelegateDisplay = (delegateInfo, actorNameById) => {
  if (!delegateInfo) return null
  const targetName =
    delegateInfo.memberName || actorNameById.get(delegateInfo.memberId) || delegateInfo.memberId
  return {
    targetName: String(targetName || '').trim(),
    task: String(delegateInfo.task || '').trim(),
  }
}

const buildToolCallNode = ({
  id,
  toolName,
  toolStatus,
  argumentsValue,
  durationMs,
  actor,
  actorNameById = new Map(),
}) => {
  const normalizedToolName = String(toolName || 'Tool')
  const toolId = String(id || '')
  const delegateInfo =
    normalizedToolName === 'delegate_task_to_member' ? parseDelegateInfo(argumentsValue) : null
  const delegateDisplay = resolveDelegateDisplay(delegateInfo, actorNameById)
  const delegateSummary =
    delegateDisplay?.targetName &&
    `${actor || 'Leader'} -> ${delegateDisplay.targetName}`

  return createNode({
    id: `tool-call-${toolId || normalizedToolName}`,
    type: 'tool_call',
    title:
      normalizedToolName === 'delegate_task_to_member' ? 'Delegate Task' : normalizedToolName,
    badge: normalizedToolName === 'delegate_task_to_member' ? 'Delegate' : 'Tool',
    summary:
      delegateSummary ||
      summarizeText(
        typeof argumentsValue === 'string'
          ? argumentsValue
          : argumentsValue && typeof argumentsValue === 'object'
            ? toPrettyJson(argumentsValue)
            : `${normalizedToolName} called`,
      ),
    status: toolStatus === 'error' ? 'error' : 'done',
    actor,
    durationMs,
    detailSections: [
      textSection('Tool', normalizedToolName),
      delegateDisplay?.targetName ? textSection('Agent', delegateDisplay.targetName) : null,
      delegateDisplay?.task ? textSection('Assigned Task', delegateDisplay.task) : null,
      jsonSection('Input', argumentsValue),
    ],
    meta: {
      toolId,
      toolName: normalizedToolName,
      delegateTargetName: delegateDisplay?.targetName || null,
      delegateTask: delegateDisplay?.task || null,
      delegateKey:
        normalizedToolName === 'delegate_task_to_member'
          ? `${delegateDisplay?.targetName || ''}::${delegateDisplay?.task || ''}`
          : null,
    },
  })
}

const buildToolResultNode = ({
  id,
  toolName,
  toolStatus,
  outputValue,
  durationMs,
  actor,
  delegateTargetName = null,
}) => {
  const normalizedToolName = String(toolName || 'Tool')
  const toolId = String(id || '')
  const summary =
    normalizedToolName === 'delegate_task_to_member'
      ? `${delegateTargetName || 'Delegated member'} -> ${actor || 'Leader'}`
      : summarizeText(
          typeof outputValue === 'string'
            ? outputValue
            : outputValue != null
              ? toPrettyJson(outputValue)
              : toolStatus === 'error'
                ? `${normalizedToolName} failed`
                : `${normalizedToolName} completed`,
        )

  return createNode({
    id: `tool-result-${toolId || normalizedToolName}`,
    type: 'tool_result',
    title:
      normalizedToolName === 'delegate_task_to_member'
        ? 'Delegate Result'
        : `${normalizedToolName} Result`,
    badge:
      normalizedToolName === 'delegate_task_to_member'
        ? 'Delegate'
        : toolStatus === 'error'
          ? 'Error'
          : 'Result',
    summary,
    status: toolStatus,
    actor,
    durationMs,
    detailSections: [textSection('Tool', normalizedToolName), jsonSection('Output', outputValue)],
    meta: {
      toolId,
      toolName: normalizedToolName,
      delegateTargetName,
    },
  })
}

const extractMergedContentNode = ({
  blocks,
  fromIndex,
  idPrefix,
  actor = null,
  acceptedTypes,
  nodeType,
  title,
}) => {
  const chunks = []
  let totalDuration = 0
  let index = fromIndex
  while (index < blocks.length) {
    const block = blocks[index]
    if (!acceptedTypes.has(block._type)) break
    const content = String(block?.content || '')
    if (content) chunks.push(content)
    const durationMs = normalizeDurationMs(block?.duration_ms)
    if (durationMs != null) totalDuration += durationMs
    index += 1
  }
  const content = chunks.join('').trim()
  if (!content) return { node: null, nextIndex: index }
  return {
    node: createNode({
      id: `${idPrefix}-${nodeType}-${blocks[fromIndex]?.seq || fromIndex}-${index}`,
      type: nodeType,
      title,
      summary: summarizeText(content),
      actor,
      durationMs: totalDuration > 0 ? totalDuration : null,
      detailSections: [textSection('Content', content)],
    }),
    nextIndex: index,
  }
}

const extractOrderedNodesFromBlocks = ({
  blocks,
  idPrefix,
  actor = null,
  includeText = false,
  actorNameById = new Map(),
}) => {
  const nodes = []
  let index = 0
  while (index < blocks.length) {
    const block = blocks[index]
    const type = block._type

    if (type === 'reasoning' || type === 'thought') {
      const { node, nextIndex } = extractMergedContentNode({
        blocks,
        fromIndex: index,
        idPrefix,
        actor,
        acceptedTypes: new Set(['reasoning', 'thought']),
        nodeType: 'reasoning',
        title: 'Reasoning',
      })
      if (node) nodes.push(node)
      index = nextIndex
      continue
    }

    if (includeText && type === 'text') {
      const { node, nextIndex } = extractMergedContentNode({
        blocks,
        fromIndex: index,
        idPrefix,
        actor,
        acceptedTypes: new Set(['text']),
        nodeType: 'model_output',
        title: 'Model Reply',
      })
      if (node) nodes.push(node)
      index = nextIndex
      continue
    }

    if (type === 'tool' || type === 'tool_call') {
      const toolName = String(block?.name || 'Tool')
      const toolStatus = normalizeStatus(
        block?.status || (type === 'tool_call' ? 'calling' : 'done'),
      )
      const toolId = block?.tool_call_id || `${idPrefix}-${index}`
      const argumentsValue = safeParseJson(block?.arguments)
      const outputValue = safeParseJson(block?.output)
      nodes.push(
        buildToolCallNode({
          id: toolId,
          toolName,
          toolStatus,
          argumentsValue: argumentsValue ?? block?.arguments,
          durationMs: block?.duration_ms,
          actor,
          actorNameById,
        }),
      )
      if (type === 'tool' && (block?.output != null || toolStatus === 'done' || toolStatus === 'error')) {
        nodes.push(
          buildToolResultNode({
            id: toolId,
            toolName,
            toolStatus,
            outputValue: outputValue ?? block?.output,
            durationMs: block?.duration_ms,
            actor,
          }),
        )
      }
      index += 1
      continue
    }

    if (type === 'tool_result') {
      const toolName = String(block?.name || 'Tool')
      const toolStatus = normalizeStatus(block?.status || 'done')
      const toolId = block?.tool_call_id || `${idPrefix}-${index}`
      const outputValue = safeParseJson(block?.output)
      nodes.push(
        buildToolResultNode({
          id: toolId,
          toolName,
          toolStatus,
          outputValue: outputValue ?? block?.output,
          durationMs: block?.duration_ms,
          actor,
        }),
      )
      index += 1
      continue
    }

    index += 1
  }
  return nodes
}

const buildToolNodesFromHistory = ({
  toolCallHistory,
  prefix,
  actor = null,
  actorNameById = new Map(),
}) => {
  if (!Array.isArray(toolCallHistory) || toolCallHistory.length === 0) return []
  const nodes = []
  const sortedHistory = [...toolCallHistory].sort(
    (a, b) => getHistoryOrder(a, 0) - getHistoryOrder(b, 0),
  )
  for (let index = 0; index < sortedHistory.length; index += 1) {
    const item = sortedHistory[index]
    const toolName = String(item?.name || 'Tool')
    const toolStatus = normalizeStatus(item?.status || 'done')
    const toolId = item?.id || `${prefix}-${index}`
    const argumentsValue = safeParseJson(item?.arguments)
    const outputValue = safeParseJson(item?.output)
    nodes.push(
      buildToolCallNode({
        id: `${prefix}-${toolId}`,
        toolName,
        toolStatus,
        argumentsValue: argumentsValue ?? item?.arguments,
        durationMs: item?.durationMs,
        actor,
        actorNameById,
      }),
    )
    if (outputValue != null || toolStatus === 'done' || toolStatus === 'error') {
      nodes.push(
        buildToolResultNode({
          id: `${prefix}-${toolId}`,
          toolName,
          toolStatus,
          outputValue: outputValue ?? item?.output,
          durationMs: item?.durationMs,
          actor,
        }),
      )
    }
  }
  return nodes
}

const buildStandardPipeline = message => {
  const blocks = toSortedBlocks(message?.streamBlocks)
  const nodes = extractOrderedNodesFromBlocks({ blocks, idPrefix: 'chat' })
  if (nodes.filter(node => node.type === 'tool_call').length === 0) {
    nodes.push(
      ...buildToolNodesFromHistory({
        toolCallHistory: message?.toolCallHistory,
        prefix: 'chat-history',
      }),
    )
  }

  const finalContent = String(message?.content || '').trim()
  if (finalContent) {
    nodes.push(
      createNode({
        id: 'chat-model-response',
        type: 'final_response',
        title: 'Model Response',
        badge: 'Answer',
        summary: summarizeText(finalContent),
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
  if (responses.length === 0) return []

  const actors = responses.map((response, index) => ({
    key: String(response?.agentId || `expert-${index}`),
    name: String(response?.agentName || `Agent ${index + 1}`),
    role: resolveExpertRole(response),
    task: String(response?.task || '').trim(),
    status: response?.status || 'done',
    streamBlocks: toSortedBlocks(response?.streamBlocks),
    toolCallHistory: Array.isArray(response?.toolCallHistory) ? response.toolCallHistory : [],
  }))
  const actorNameById = new Map(actors.map(actor => [actor.key, actor.name]))

  const timeline = []
  actors.forEach(actor => {
    actor.streamBlocks.forEach((block, index) => {
      timeline.push({
        order: getBlockOrder(block, index + 1),
        actor,
        block,
        index,
      })
    })
  })
  timeline.sort((a, b) => (a.order === b.order ? a.index - b.index : a.order - b.order))

  const nodes = []
  const seenToolKeys = new Set()
  const delegateTargetByToolKey = new Map()
  const lastDelegateTargetByActor = new Map()
  let currentActor = null
  let pointer = 0
  while (pointer < timeline.length) {
    const item = timeline[pointer]
    const actor = item.actor

    const incomingType = item.block._type
    const shouldInsertSwitch =
      !currentActor ||
      (currentActor.key !== actor.key &&
        !(
          incomingType === 'tool_result' &&
          String(item.block?.name || '') === 'delegate_task_to_member'
        ))

    if (shouldInsertSwitch) {
      nodes.push(
        createNode({
          id: `expert-switch-${actor.key}-${item.order}-${pointer}`,
          type: 'agent_switch',
          title: actor.name,
          badge: roleBadgeLabel(actor.role),
          actor: actor.name,
          summary: summarizeText(actor.task || `${roleBadgeLabel(actor.role)} activated`),
          status: actor.status,
          detailSections: [
            textSection('Agent', actor.name),
            textSection('Role', roleBadgeLabel(actor.role)),
            textSection('Assigned Task', actor.task),
          ],
          meta: {
            actorKey: actor.key,
            role: actor.role,
          },
        }),
      )
      currentActor = actor
    }

    const type = incomingType

    if (type === 'reasoning' || type === 'thought') {
      const mergedBlocks = []
      let totalDuration = 0
      let cursor = pointer
      while (cursor < timeline.length) {
        const next = timeline[cursor]
        if (next.actor.key !== actor.key) break
        if (next.block._type !== 'reasoning' && next.block._type !== 'thought') break
        const content = String(next.block?.content || '')
        if (content) mergedBlocks.push(content)
        const durationMs = normalizeDurationMs(next.block?.duration_ms)
        if (durationMs != null) totalDuration += durationMs
        cursor += 1
      }
      const content = mergedBlocks.join('').trim()
      if (content) {
        nodes.push(
          createNode({
            id: `expert-reasoning-${actor.key}-${item.order}-${cursor}`,
            type: 'reasoning',
            title: 'Reasoning',
            actor: actor.name,
            summary: summarizeText(content),
            durationMs: totalDuration > 0 ? totalDuration : null,
            detailSections: [textSection('Content', content)],
          }),
        )
      }
      pointer = cursor
      continue
    }

    if (type === 'text') {
      const mergedBlocks = []
      let totalDuration = 0
      let cursor = pointer
      while (cursor < timeline.length) {
        const next = timeline[cursor]
        if (next.actor.key !== actor.key) break
        if (next.block._type !== 'text') break
        const content = String(next.block?.content || '')
        if (content) mergedBlocks.push(content)
        const durationMs = normalizeDurationMs(next.block?.duration_ms)
        if (durationMs != null) totalDuration += durationMs
        cursor += 1
      }
      const content = mergedBlocks.join('').trim()
      if (content) {
        nodes.push(
          createNode({
            id: `expert-reply-${actor.key}-${item.order}-${cursor}`,
            type: 'model_output',
            title: 'Model Reply',
            actor: actor.name,
            summary: summarizeText(content),
            durationMs: totalDuration > 0 ? totalDuration : null,
            detailSections: [textSection('Content', content)],
          }),
        )
      }
      pointer = cursor
      continue
    }

    if (type === 'tool' || type === 'tool_call') {
      const toolName = String(item.block?.name || 'Tool')
      const toolStatus = normalizeStatus(
        item.block?.status || (type === 'tool_call' ? 'calling' : 'done'),
      )
      const toolId = item.block?.tool_call_id || `${actor.key}-${item.order}-${pointer}`
      const argumentsValue = safeParseJson(item.block?.arguments)
      const outputValue = safeParseJson(item.block?.output)
      const callNode = buildToolCallNode({
        id: `expert-${toolId}`,
        toolName,
        toolStatus,
        argumentsValue: argumentsValue ?? item.block?.arguments,
        durationMs: item.block?.duration_ms,
        actor: actor.name,
        actorNameById,
      })
      const callKey = `call:${actor.key}:${callNode.meta?.toolName || ''}:${callNode.meta?.toolId || ''}:${callNode.meta?.delegateKey || ''}`
      if (!seenToolKeys.has(callKey)) {
        seenToolKeys.add(callKey)
        nodes.push(callNode)
      }
      if (callNode.meta?.delegateTargetName) {
        const rawToolId = String(toolId || '')
        const key = `${actor.key}:${rawToolId}`
        delegateTargetByToolKey.set(key, callNode.meta.delegateTargetName)
        lastDelegateTargetByActor.set(actor.key, callNode.meta.delegateTargetName)
      }

      if (
        type === 'tool' &&
        (item.block?.output != null || toolStatus === 'done' || toolStatus === 'error')
      ) {
        const resultNode = buildToolResultNode({
          id: `expert-${toolId}`,
          toolName,
          toolStatus,
          outputValue: outputValue ?? item.block?.output,
          durationMs: item.block?.duration_ms,
          actor: actor.name,
          delegateTargetName: callNode.meta?.delegateTargetName || null,
        })
        const resultKey = `result:${actor.key}:${resultNode.meta?.toolName || ''}:${resultNode.meta?.toolId || ''}:${resultNode.meta?.delegateTargetName || ''}`
        if (!seenToolKeys.has(resultKey)) {
          seenToolKeys.add(resultKey)
          nodes.push(resultNode)
        }
      }
      pointer += 1
      continue
    }

    if (type === 'tool_result') {
      const toolName = String(item.block?.name || 'Tool')
      const toolStatus = normalizeStatus(item.block?.status || 'done')
      const toolId = item.block?.tool_call_id || `${actor.key}-${item.order}-${pointer}`
      const outputValue = safeParseJson(item.block?.output)
      const rawToolId = String(toolId || '')
      const delegateTargetName =
        delegateTargetByToolKey.get(`${actor.key}:${rawToolId}`) ||
        lastDelegateTargetByActor.get(actor.key) ||
        null
      const resultNode = buildToolResultNode({
        id: `expert-${toolId}`,
        toolName,
        toolStatus,
        outputValue: outputValue ?? item.block?.output,
        durationMs: item.block?.duration_ms,
        actor: actor.name,
        delegateTargetName,
      })
      const resultKey = `result:${actor.key}:${resultNode.meta?.toolName || ''}:${resultNode.meta?.toolId || ''}:${resultNode.meta?.delegateTargetName || ''}`
      if (!seenToolKeys.has(resultKey)) {
        seenToolKeys.add(resultKey)
        nodes.push(resultNode)
      }
      pointer += 1
      continue
    }

    pointer += 1
  }

  const hasAnyToolEventsInTimeline = timeline.some(item =>
    ['tool', 'tool_call', 'tool_result'].includes(String(item?.block?._type || '')),
  )

  if (!hasAnyToolEventsInTimeline && actors.every(actor => actor.streamBlocks.length === 0)) {
    actors.forEach(actor => {
      const historyNodes = buildToolNodesFromHistory({
        toolCallHistory: actor.toolCallHistory,
        prefix: `${actor.key}-history`,
        actor: actor.name,
        actorNameById,
      })
      historyNodes.forEach(node => {
        const key = `${node.type}:${actor.key}:${node.meta?.toolName || ''}:${node.meta?.toolId || ''}:${node.meta?.delegateKey || ''}:${node.meta?.delegateTargetName || ''}`
        if (seenToolKeys.has(key)) return
        seenToolKeys.add(key)
        nodes.push(node)
      })
    })
  }

  const finalContent = String(message?.content || '').trim()
  if (finalContent) {
    nodes.push(
      createNode({
        id: 'expert-model-response',
        type: 'final_response',
        title: 'Model Response',
        badge: 'Answer',
        summary: summarizeText(finalContent),
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
        summary: summarizeText(plan),
        detailSections: [textSection('Plan', plan)],
      }),
    )
  }

  const steps = Array.isArray(message?.researchSteps) ? message.researchSteps : []
  steps.forEach((step, index) => {
    const stepNo = step?.step || index + 1
    const title =
      String(step?.title || step?.goal || step?.task || '').trim() || `Step ${stepNo}`
    nodes.push(
      createNode({
        id: `research-step-${stepNo}`,
        type: 'workflow_step',
        title,
        badge: `Step ${stepNo}`,
        summary: summarizeText(step?.summary || step?.finding || step?.content || title),
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

  const blocks = toSortedBlocks(message?.streamBlocks)
  nodes.push(...extractOrderedNodesFromBlocks({ blocks, idPrefix: 'research' }))
  if (nodes.filter(node => node.type === 'tool_call').length === 0) {
    nodes.push(
      ...buildToolNodesFromHistory({
        toolCallHistory: message?.toolCallHistory,
        prefix: 'research-history',
      }),
    )
  }

  const finalContent = String(message?.content || '').trim()
  if (finalContent) {
    nodes.push(
      createNode({
        id: 'research-model-response',
        type: 'final_response',
        title: 'Model Response',
        badge: 'Answer',
        summary: summarizeText(finalContent),
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

  let mode = 'chat'
  let nodes = []

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
    version: PIPELINE_SCHEMA_VERSION,
    mode,
    nodeCount: nodes.length,
    nodes,
  }
}

export const ensureMessagePipeline = message => {
  if (!message) return null

  if (message?.expertMode) {
    return buildMessagePipeline(message)
  }

  const existing = message?.pipelineTrace
  if (existing && typeof existing === 'object' && Array.isArray(existing.nodes)) {
    const existingVersion = Number(existing.version || 0)
    if (existingVersion >= PIPELINE_SCHEMA_VERSION) return existing
  }
  return buildMessagePipeline(message)
}
