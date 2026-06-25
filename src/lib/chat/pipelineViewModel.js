const PIPELINE_SCHEMA_VERSION = 9
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
  if (type === 'memory_tool') {
    return true
  }
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

const SEARCH_FILTER_SOURCE_TOOLS = new Set(['web_search', 'search_news'])
const MEMORY_SKILL_SCRIPT_NAMES = new Set([
  'memory_store.py',
  'scripts/memory_store.py',
  'list_memories.py',
  'scripts/list_memories.py',
  'list_categories.py',
  'scripts/list_categories.py',
  'search_memories.py',
  'scripts/search_memories.py',
  'save_memory.py',
  'scripts/save_memory.py',
  'delete_memory.py',
  'scripts/delete_memory.py',
])
const MEMORY_TOOL_NAMES = new Set(['memory_check'])

const formatMemoryPriority = value => {
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num
    .toFixed(num >= 1 ? 0 : 2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1')
}

const parseToolArguments = argumentsValue => {
  if (argumentsValue && typeof argumentsValue === 'object') return argumentsValue
  if (typeof argumentsValue !== 'string') return null
  const parsed = safeParseJson(argumentsValue)
  return parsed && typeof parsed === 'object' ? parsed : null
}

const normalizeToolCallsToHistory = toolCalls => {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return []
  return toolCalls
    .map((tool, index) => {
      if (!tool || typeof tool !== 'object') return null
      const fn = tool?.function && typeof tool.function === 'object' ? tool.function : {}
      return {
        id: tool?.id || tool?.tool_call_id || tool?.toolCallId || `tool-${index + 1}`,
        name: tool?.name || fn.name || tool?.tool_name || tool?.toolName || 'tool',
        arguments: tool?.arguments ?? fn.arguments ?? tool?.input ?? null,
        output: tool?.output ?? tool?.result ?? null,
        durationMs: Number.isFinite(tool?.durationMs)
          ? Number(tool.durationMs)
          : Number.isFinite(tool?.duration_ms)
            ? Number(tool.duration_ms)
            : null,
        streamOrder: Number.isFinite(tool?.streamOrder)
          ? Number(tool.streamOrder)
          : Number.isFinite(tool?.stream_order)
            ? Number(tool.stream_order)
            : index + 1,
      }
    })
    .filter(Boolean)
}

const extractMemoryToolMeta = (toolName, argumentsValue) => {
  const normalizedToolName = String(toolName || '').trim()
  const parsed = parseToolArguments(argumentsValue)

  if (MEMORY_TOOL_NAMES.has(normalizedToolName)) {
    return {
      kind: 'memory_check',
      label: 'Memory Check',
      badge: 'Memory',
      skillId: '',
      scriptPath: '',
      scriptName: '',
      category: '',
      keyword: '',
      slug: '',
      priority: null,
      applicableWhen: '',
      notApplicableWhen: '',
    }
  }

  if (normalizedToolName !== 'execute_skill_script') return null
  const skillId = String(parsed?.skill_id || parsed?.skillId || '').trim()
  const scriptPath = String(parsed?.script_path || parsed?.scriptPath || '').trim()
  if (skillId !== 'agent-memory' || !MEMORY_SKILL_SCRIPT_NAMES.has(scriptPath)) return null
  const scriptName = scriptPath.split('/').pop() || scriptPath
  const labelByScript = {
    'list_categories.py': 'Memory Categories',
    'memory_store.py': 'Memory Store',
    'list_memories.py': 'Memory List',
    'search_memories.py': 'Memory Search',
    'save_memory.py': 'Memory Save',
    'delete_memory.py': 'Memory Delete',
  }
  return {
    kind: 'agent_memory',
    label: labelByScript[scriptName] || 'Memory Tool',
    badge: 'Memory',
    skillId,
    scriptPath,
    scriptName,
    category: String(parsed?.category || '').trim(),
    keyword: String(parsed?.keyword || parsed?.query || '').trim(),
    slug: String(parsed?.slug || '').trim(),
    priority: parsed?.priority,
    applicableWhen: String(parsed?.applicable_when || parsed?.applicableWhen || '').trim(),
    notApplicableWhen: String(
      parsed?.not_applicable_when || parsed?.notApplicableWhen || '',
    ).trim(),
  }
}

const formatMemoryEntryText = (item, index = 0) => {
  if (!item || typeof item !== 'object') return ''
  const title = String(item.title || item.slug || `Memory ${index + 1}`).trim()
  const summary = String(item.summary || '').trim()
  const priority = formatMemoryPriority(item.priority)
  const applicableWhen = String(item.applicable_when || '').trim()
  const notApplicableWhen = String(item.not_applicable_when || '').trim()
  const tags = Array.isArray(item.tags)
    ? item.tags.map(tag => String(tag || '').trim()).filter(Boolean)
    : []
  const category = String(item.category || '').trim()
  const path = String(item.path || '').trim()
  const lines = [title]
  if (summary) lines.push(`Summary: ${summary}`)
  if (priority) lines.push(`Priority: ${priority}`)
  if (applicableWhen) lines.push(`Applicable When: ${applicableWhen}`)
  if (notApplicableWhen) lines.push(`Not Applicable When: ${notApplicableWhen}`)
  if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`)
  if (category) lines.push(`Category: ${category}`)
  if (path) lines.push(`Path: ${path}`)
  return lines.join('\n')
}

const buildMemoryEntrySections = items => {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.slice(0, 5).map((item, index) =>
    textSection(
      `Memory ${index + 1}`,
      formatMemoryEntryText(item, index) || `Summary: ${String(item?.summary || item?.title || '').trim()}`,
    ),
  )
}

const buildMemoryResultSections = outputValue => {
  const parsed = safeParseJson(outputValue)
  const objectLike = parsed && typeof parsed === 'object' ? parsed : null
  if (!objectLike) return []

  const items = Array.isArray(objectLike.items) ? objectLike.items : []
  const sections = []
  if (objectLike.action) sections.push(textSection('Action', String(objectLike.action)))
  if (objectLike.keyword) sections.push(textSection('Keyword', String(objectLike.keyword)))
  if (objectLike.category) sections.push(textSection('Category', String(objectLike.category)))
  if (objectLike.scope) sections.push(textSection('Scope', String(objectLike.scope)))
  if (items.length > 0) {
    sections.push(textSection('Matches', `${items.length} memory item(s)`))
    sections.push(...buildMemoryEntrySections(items))
  } else if (objectLike.path) {
    sections.push(textSection('Path', String(objectLike.path)))
  }
  return sections.filter(Boolean)
}

const extractSearchFilterMeta = outputValue => {
  const parsed = safeParseJson(outputValue)
  if (!parsed || typeof parsed !== 'object') return null
  const meta =
    parsed.search_filter && typeof parsed.search_filter === 'object'
      ? parsed.search_filter
      : parsed.searchFilter && typeof parsed.searchFilter === 'object'
        ? parsed.searchFilter
        : null
  if (!meta) return null

  const originalResults = Array.isArray(meta.original_results)
    ? meta.original_results
    : Array.isArray(meta.originalResults)
      ? meta.originalResults
      : []
  const filteredResults = Array.isArray(meta.filtered_results)
    ? meta.filtered_results
    : Array.isArray(meta.filteredResults)
      ? meta.filteredResults
      : []

  return {
    query: typeof meta.query === 'string' ? meta.query : '',
    status: String(meta.status || 'done'),
    applied: Boolean(meta.applied),
    originalCount: Number(meta.original_count || meta.originalCount || originalResults.length || 0),
    filteredCount: Number(meta.filtered_count || meta.filteredCount || filteredResults.length || 0),
    fallbackReason:
      typeof meta.fallback_reason === 'string'
        ? meta.fallback_reason
        : typeof meta.fallbackReason === 'string'
          ? meta.fallbackReason
          : null,
    originalResults,
    filteredResults,
  }
}

const normalizeSearchFilterMeta = meta => {
  if (!meta || typeof meta !== 'object') return null
  const originalResults = Array.isArray(meta.originalResults)
    ? meta.originalResults
    : Array.isArray(meta.original_results)
      ? meta.original_results
      : []
  const filteredResults = Array.isArray(meta.filteredResults)
    ? meta.filteredResults
    : Array.isArray(meta.filtered_results)
      ? meta.filtered_results
      : []
  return {
    query: typeof meta.query === 'string' ? meta.query : '',
    status: String(meta.status || 'done'),
    applied: Boolean(meta.applied),
    originalCount: Number(meta.originalCount || meta.original_count || originalResults.length || 0),
    filteredCount: Number(meta.filteredCount || meta.filtered_count || filteredResults.length || 0),
    fallbackReason:
      typeof meta.fallbackReason === 'string'
        ? meta.fallbackReason
        : typeof meta.fallback_reason === 'string'
          ? meta.fallback_reason
          : null,
    originalResults,
    filteredResults,
  }
}

const buildSearchFilterNode = ({
  id,
  toolName,
  outputValue,
  durationMs,
  actor,
  searchFilterMeta = null,
}) => {
  if (!SEARCH_FILTER_SOURCE_TOOLS.has(String(toolName || ''))) return null
  const meta = normalizeSearchFilterMeta(searchFilterMeta) || extractSearchFilterMeta(outputValue)
  if (!meta) return null
  const normalizedStatus = String(meta.status || 'done').toLowerCase()

  const node = createNode({
    id: `search-filter-${id}`,
    type: 'search_filter',
    title: 'Filter Results',
    badge: 'Filter',
    summary:
      normalizedStatus === 'running'
        ? ''
        : meta.originalCount > 0
          ? `${meta.filteredCount || 0} / ${meta.originalCount} relevant results`
          : '',
    status:
      normalizedStatus === 'running'
        ? 'running'
        : normalizedStatus === 'filtered' ||
            normalizedStatus === 'fallback' ||
            normalizedStatus === 'unavailable'
          ? 'done'
          : normalizedStatus,
    actor,
    durationMs,
    detailSections: [
      textSection('Tool', String(toolName || '')),
      meta.query ? textSection('Query', meta.query) : null,
      normalizedStatus === 'running'
        ? textSection('Summary', 'Filtering in progress')
        : textSection(
            'Summary',
            `${meta.filteredCount || 0} / ${meta.originalCount || 0} relevant results`,
          ),
      meta.fallbackReason ? textSection('Fallback', meta.fallbackReason) : null,
      sourceSection(meta.filteredResults),
    ],
    meta: {
      toolName,
      originalCount: meta.originalCount,
      filteredCount: meta.filteredCount,
      fallbackReason: meta.fallbackReason,
    },
  })
  return {
    ...node,
    query: meta.query,
    applied: meta.applied,
    originalCount: meta.originalCount,
    filteredCount: meta.filteredCount,
    fallbackReason: meta.fallbackReason,
    originalResults: meta.originalResults,
    filteredResults: meta.filteredResults,
    sourceToolId: id,
  }
}

const getSearchToolBlockId = block => {
  const toolName = String(block?.name || '').trim()
  if (!SEARCH_FILTER_SOURCE_TOOLS.has(toolName)) return ''
  return String(block?.tool_call_id || block?.id || '').trim()
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
  const memoryMeta = extractMemoryToolMeta(normalizedToolName, argumentsValue)
  const delegateInfo =
    normalizedToolName === 'delegate_task_to_member' ? parseDelegateInfo(argumentsValue) : null
  const delegateDisplay = resolveDelegateDisplay(delegateInfo, actorNameById)
  const delegateSummary =
    delegateDisplay?.targetName && `${actor || 'Leader'} -> ${delegateDisplay.targetName}`
  const memorySummary = memoryMeta
    ? memoryMeta.kind === 'memory_check'
      ? 'Checking memory relevance'
      : [
          memoryMeta.label,
          memoryMeta.keyword ? `Query: ${memoryMeta.keyword}` : '',
          memoryMeta.category ? `Category: ${memoryMeta.category}` : '',
        ]
          .filter(Boolean)
          .join(' • ')
    : ''

  return createNode({
    id: `tool-call-${toolId || normalizedToolName}`,
    type: memoryMeta ? 'memory_tool' : 'tool_call',
    title:
      normalizedToolName === 'delegate_task_to_member'
        ? 'Delegate Task'
        : memoryMeta?.label || normalizedToolName,
    badge:
      normalizedToolName === 'delegate_task_to_member'
        ? 'Delegate'
        : memoryMeta?.badge || 'Tool',
    summary:
      memorySummary ||
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
      memoryMeta?.skillId ? textSection('Skill', memoryMeta.skillId) : textSection('Tool', normalizedToolName),
      memoryMeta?.scriptPath ? textSection('Script', memoryMeta.scriptPath) : null,
      memoryMeta?.keyword ? textSection('Keyword', memoryMeta.keyword) : null,
      memoryMeta?.category ? textSection('Category', memoryMeta.category) : null,
      memoryMeta?.priority != null ? textSection('Priority', formatMemoryPriority(memoryMeta.priority)) : null,
      memoryMeta?.applicableWhen ? textSection('Applicable When', memoryMeta.applicableWhen) : null,
      memoryMeta?.notApplicableWhen
        ? textSection('Not Applicable When', memoryMeta.notApplicableWhen)
        : null,
      delegateDisplay?.targetName ? textSection('Agent', delegateDisplay.targetName) : null,
      delegateDisplay?.task ? textSection('Assigned Task', delegateDisplay.task) : null,
      jsonSection('Input', argumentsValue),
    ],
    meta: {
      toolId,
      toolName: normalizedToolName,
      memoryMeta,
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
  argumentsValue = null,
}) => {
  const normalizedToolName = String(toolName || 'Tool')
  const toolId = String(id || '')
  const memoryMeta = extractMemoryToolMeta(normalizedToolName, argumentsValue)
  const summary =
    memoryMeta
      ? summarizeText(
          buildMemoryResultSections(outputValue)
            .map(section => String(section?.value || '').trim())
            .join('\n\n'),
        ) || memoryMeta.label
      : normalizedToolName === 'delegate_task_to_member'
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
    type: memoryMeta ? 'memory_tool' : 'tool_result',
    title:
      memoryMeta?.label ||
      (normalizedToolName === 'delegate_task_to_member'
        ? 'Delegate Result'
        : `${normalizedToolName} Result`),
    badge:
      memoryMeta?.badge ||
      (normalizedToolName === 'delegate_task_to_member'
        ? 'Delegate'
        : toolStatus === 'error'
          ? 'Error'
          : 'Result'),
    summary,
    status: toolStatus,
    actor,
    durationMs,
    detailSections:
      memoryMeta
        ? [
            memoryMeta.skillId ? textSection('Skill', memoryMeta.skillId) : null,
            memoryMeta.scriptPath ? textSection('Script', memoryMeta.scriptPath) : null,
            memoryMeta.keyword ? textSection('Keyword', memoryMeta.keyword) : null,
            memoryMeta.category ? textSection('Category', memoryMeta.category) : null,
            memoryMeta.priority != null
              ? textSection('Priority', formatMemoryPriority(memoryMeta.priority))
              : null,
            memoryMeta.applicableWhen
              ? textSection('Applicable When', memoryMeta.applicableWhen)
              : null,
            memoryMeta.notApplicableWhen
              ? textSection('Not Applicable When', memoryMeta.notApplicableWhen)
              : null,
            ...buildMemoryResultSections(outputValue),
            jsonSection('Output', outputValue),
          ].filter(Boolean)
        : [textSection('Tool', normalizedToolName), jsonSection('Output', outputValue)],
    meta: {
      toolId,
      toolName: normalizedToolName,
      memoryMeta,
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
  const explicitSearchFilterByToolId = new Map()
  const searchToolBlockIds = new Set()
  const searchToolResultIds = new Set()

  blocks.forEach(block => {
    if (block._type === 'search_filter') {
      const toolId = String(block?.id || block?.tool_call_id || '').trim()
      if (toolId) explicitSearchFilterByToolId.set(toolId, block)
      return
    }
    const toolId = getSearchToolBlockId(block)
    if (!toolId) return
    searchToolBlockIds.add(toolId)
    const normalizedStatus = normalizeStatus(block?.status || 'done')
    if (
      block._type === 'tool_result' ||
      block?.output != null ||
      normalizedStatus === 'done' ||
      normalizedStatus === 'error'
    ) {
      searchToolResultIds.add(toolId)
    }
  })

  const emitExplicitSearchFilterNode = ({ toolId, toolName, durationMs, actor, afterResult }) => {
    const filterBlock = explicitSearchFilterByToolId.get(String(toolId || '').trim())
    if (!filterBlock) return
    const normalizedStatus = String(filterBlock?.status || 'running').toLowerCase()
    if (afterResult) {
      if (!(normalizedStatus === 'filtered' || normalizedStatus === 'fallback' || normalizedStatus === 'unavailable')) {
        return
      }
    } else if (searchToolResultIds.has(String(toolId || '').trim())) {
      return
    }

    const searchFilterNode = buildSearchFilterNode({
      id: toolId,
      toolName,
      outputValue: null,
      durationMs: filterBlock?.duration_ms ?? durationMs,
      actor,
      searchFilterMeta: {
        query: filterBlock?.query || '',
        status: String(filterBlock?.status || 'running'),
        applied: filterBlock?.applied,
        originalCount:
          filterBlock?.originalCount != null ? filterBlock.originalCount : filterBlock?.original_count,
        filteredCount:
          filterBlock?.filteredCount != null ? filterBlock.filteredCount : filterBlock?.filtered_count,
        fallbackReason: filterBlock?.fallbackReason || filterBlock?.fallback_reason || null,
        originalResults: Array.isArray(filterBlock?.originalResults)
          ? filterBlock.originalResults
          : Array.isArray(filterBlock?.original_results)
            ? filterBlock.original_results
            : [],
        filteredResults: Array.isArray(filterBlock?.filteredResults)
          ? filterBlock.filteredResults
          : Array.isArray(filterBlock?.filtered_results)
            ? filterBlock.filtered_results
            : [],
      },
    })
    if (searchFilterNode) nodes.push(searchFilterNode)
  }

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

    if (type === 'search_filter') {
      const toolId = String(block?.id || block?.tool_call_id || '').trim()
      if (!toolId || !searchToolBlockIds.has(toolId)) {
        const searchFilterNode = buildSearchFilterNode({
          id: block?.id || block?.tool_call_id || `${idPrefix}-${index}`,
          toolName: block?.name || 'web_search',
          outputValue: null,
          durationMs: block?.duration_ms,
          actor,
          searchFilterMeta: {
            query: block?.query || '',
            status: String(block?.status || 'running'),
            applied: block?.applied,
            originalCount:
              block?.originalCount != null ? block.originalCount : block?.original_count,
            filteredCount:
              block?.filteredCount != null ? block.filteredCount : block?.filtered_count,
            fallbackReason: block?.fallbackReason || block?.fallback_reason || null,
            originalResults: Array.isArray(block?.originalResults)
              ? block.originalResults
              : Array.isArray(block?.original_results)
                ? block.original_results
                : [],
            filteredResults: Array.isArray(block?.filteredResults)
              ? block.filteredResults
              : Array.isArray(block?.filtered_results)
                ? block.filtered_results
                : [],
          },
        })
        if (searchFilterNode) nodes.push(searchFilterNode)
      }
      index += 1
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
    if (toolName === 'search_result_filter') {
      index += 1
      continue
    }
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
      if (SEARCH_FILTER_SOURCE_TOOLS.has(toolName)) {
        emitExplicitSearchFilterNode({
          toolId,
          toolName,
          durationMs: block?.duration_ms,
          actor,
          afterResult: false,
        })
      }
      if (
        type === 'tool' &&
        (block?.output != null || toolStatus === 'done' || toolStatus === 'error')
      ) {
        const resultNode = buildToolResultNode({
          id: toolId,
          toolName,
          toolStatus,
          outputValue: outputValue ?? block?.output,
          durationMs: block?.duration_ms,
          actor,
          argumentsValue: argumentsValue ?? block?.arguments,
        })
        nodes.push(resultNode)
        if (SEARCH_FILTER_SOURCE_TOOLS.has(toolName)) {
          emitExplicitSearchFilterNode({
            toolId,
            toolName,
            durationMs: block?.duration_ms,
            actor,
            afterResult: true,
          })
        } else {
          const searchFilterNode = buildSearchFilterNode({
            id: toolId,
            toolName,
            outputValue: outputValue ?? block?.output,
            durationMs: block?.duration_ms,
            actor,
          })
          if (searchFilterNode) nodes.push(searchFilterNode)
        }
      }
      index += 1
      continue
    }

    if (type === 'tool_result') {
      const toolName = String(block?.name || 'Tool')
      if (toolName === 'search_result_filter') {
        index += 1
        continue
      }
      const toolStatus = normalizeStatus(block?.status || 'done')
      const toolId = block?.tool_call_id || `${idPrefix}-${index}`
      const outputValue = safeParseJson(block?.output)
      const resultNode = buildToolResultNode({
        id: toolId,
        toolName,
        toolStatus,
        outputValue: outputValue ?? block?.output,
        durationMs: block?.duration_ms,
        actor,
        argumentsValue: safeParseJson(block?.arguments) ?? block?.arguments,
      })
      nodes.push(resultNode)
      if (SEARCH_FILTER_SOURCE_TOOLS.has(toolName)) {
        emitExplicitSearchFilterNode({
          toolId,
          toolName,
          durationMs: block?.duration_ms,
          actor,
          afterResult: true,
        })
      } else {
        const searchFilterNode = buildSearchFilterNode({
          id: toolId,
          toolName,
          outputValue: outputValue ?? block?.output,
          durationMs: block?.duration_ms,
          actor,
        })
        if (searchFilterNode) nodes.push(searchFilterNode)
      }
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
    if (toolName === 'search_result_filter') continue
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
      const resultNode = buildToolResultNode({
        id: `${prefix}-${toolId}`,
        toolName,
        toolStatus,
        outputValue: outputValue ?? item?.output,
        durationMs: item?.durationMs,
        actor,
        argumentsValue: argumentsValue ?? item?.arguments,
      })
      nodes.push(resultNode)
      const searchFilterNode = buildSearchFilterNode({
        id: `${prefix}-${toolId}`,
        toolName,
        outputValue: outputValue ?? item?.output,
        durationMs: item?.durationMs,
        actor,
      })
      if (searchFilterNode) nodes.push(searchFilterNode)
    }
  }
  return nodes
}

const buildStandardPipeline = message => {
  const blocks = toSortedBlocks(message?.streamBlocks)
  const nodes = extractOrderedNodesFromBlocks({ blocks, idPrefix: 'chat' })
  const toolCallHistory =
    Array.isArray(message?.toolCallHistory) && message.toolCallHistory.length > 0
      ? message.toolCallHistory
      : normalizeToolCallsToHistory(message?.tool_calls)
  if (nodes.filter(node => node.type === 'tool_call' || node.type === 'memory_tool').length === 0) {
    nodes.push(
      ...buildToolNodesFromHistory({
        toolCallHistory,
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
    toolCallHistory:
      Array.isArray(response?.toolCallHistory) && response.toolCallHistory.length > 0
        ? response.toolCallHistory
        : normalizeToolCallsToHistory(response?.tool_calls),
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
          argumentsValue: argumentsValue ?? item.block?.arguments,
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
        argumentsValue: safeParseJson(item.block?.arguments) ?? item.block?.arguments,
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
    const title = String(step?.title || step?.goal || step?.task || '').trim() || `Step ${stepNo}`
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
