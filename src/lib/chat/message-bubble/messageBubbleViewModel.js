const SEARCH_STEP_TOOLS = new Set([
  'Tavily_web_search',
  'Tavily_academic_search',
  'web_search_using_tavily',
  'web_search_with_tavily',
  'extract_url_content',
  'web_search',
  'search_news',
  'search_arxiv_and_return_articles',
  'search_wikipedia',
])

export function normalizeMessageStreamBlocks({ streamSource }) {
  if (!Array.isArray(streamSource)) return []

  return streamSource
    .map((item, index) => ({
      seq: Number.isFinite(item?.seq) ? Number(item.seq) : index + 1,
      type: String(item?.type || '').toLowerCase(),
      content: typeof item?.content === 'string' ? item.content : '',
      toolCallId: item?.tool_call_id || item?.toolCallId || null,
      name: item?.name || null,
      status: item?.status || null,
      arguments: item?.arguments ?? null,
      output: item?.output ?? null,
      query: item?.query || null,
      applied: typeof item?.applied === 'boolean' ? item.applied : null,
      originalCount: Number.isFinite(item?.original_count)
        ? Number(item.original_count)
        : Number.isFinite(item?.originalCount)
          ? Number(item.originalCount)
          : null,
      filteredCount: Number.isFinite(item?.filtered_count)
        ? Number(item.filtered_count)
        : Number.isFinite(item?.filteredCount)
          ? Number(item.filteredCount)
          : null,
      fallbackReason: item?.fallback_reason || item?.fallbackReason || null,
      originalResults: Array.isArray(item?.original_results)
        ? item.original_results
        : Array.isArray(item?.originalResults)
          ? item.originalResults
          : null,
      filteredResults: Array.isArray(item?.filtered_results)
        ? item.filtered_results
        : Array.isArray(item?.filteredResults)
          ? item.filteredResults
          : null,
      durationMs: Number.isFinite(item?.duration_ms) ? Number(item.duration_ms) : null,
    }))
    .filter(item => item.type)
    .sort((a, b) => a.seq - b.seq)
}

const dedupeSearchResults = results => {
  if (!Array.isArray(results) || results.length === 0) return []

  const seen = new Set()
  const deduped = []

  results.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const key = String(
      item.url || item.link || item.href || item.id || item.title || `search-result-${index}`,
    ).trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    deduped.push(item)
  })

  return deduped
}

const parseToolQuery = tool => {
  if (!tool) return ''
  const args = tool.arguments
  if (args && typeof args === 'object' && typeof args.query === 'string') return args.query
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      if (parsed && typeof parsed === 'object' && typeof parsed.query === 'string') {
        return parsed.query
      }
    } catch {
      return ''
    }
  }
  return ''
}

const addToolToStep = (targetStep, tool) => {
  const key = tool?.id
    ? String(tool.id)
    : `${tool?.name || 'tool'}:${String(tool?.arguments || '')}:${String(tool?.output || '')}`

  if (!targetStep._toolKeys.has(key)) {
    targetStep._toolKeys.add(key)
    targetStep.items.push(tool)
    if (typeof tool.durationMs === 'number') {
      targetStep.durationMs = (targetStep.durationMs || 0) + tool.durationMs
    }
    const query = parseToolQuery(tool)
    if (query && !targetStep._querySet.has(query)) {
      targetStep._querySet.add(query)
      targetStep.queries.push(query)
    }
  }
}

const getToolStepKey = tool =>
  tool?.id
    ? String(tool.id)
    : `${tool?.name || 'tool'}:${String(tool?.arguments || '')}:${String(tool?.output || '')}`

const parseToolOutput = output => {
  if (!output) return null
  if (typeof output === 'object') return output
  if (typeof output !== 'string') return null

  try {
    return JSON.parse(output)
  } catch {
    const match = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

export function buildMessageProcessSteps({
  isDeepResearch,
  normalizedStreamBlocks,
  toolCallHistory,
  mergedSources,
}) {
  if (isDeepResearch) return []

  const toolById = new Map()
  for (const tool of toolCallHistory || []) {
    if (tool?.id) toolById.set(String(tool.id), tool)
  }

  const steps = []

  for (const block of normalizedStreamBlocks || []) {
    if ((block.type === 'reasoning' || block.type === 'thought') && block.content) {
      const lastStep = steps[steps.length - 1]
      if (lastStep?.kind === 'thought') {
        lastStep.content = `${lastStep.content || ''}${block.content || ''}`
        const prevDuration = Number.isFinite(lastStep.durationMs) ? Number(lastStep.durationMs) : 0
        const nextDuration = Number.isFinite(block.durationMs) ? Number(block.durationMs) : 0
        lastStep.durationMs = prevDuration + nextDuration
      } else {
        steps.push({
          kind: 'thought',
          content: block.content,
          durationMs: Number.isFinite(block.durationMs) ? Number(block.durationMs) : 0,
        })
      }
      continue
    }

    if (block.type === 'search_filter') {
      steps.push({
        kind: 'search_filter',
        stepKey: `search-filter-${block.id || block.toolCallId || block.seq}`,
        sourceStepKey: block.id || block.toolCallId || null,
        queries: block.query ? [String(block.query)] : [],
        status: String(block.status || 'running'),
        applied: typeof block.applied === 'boolean' ? block.applied : false,
        originalCount: Number.isFinite(block.originalCount) ? Number(block.originalCount) : 0,
        filteredCount: Number.isFinite(block.filteredCount) ? Number(block.filteredCount) : 0,
        fallbackReason: block.fallbackReason || null,
        originalResults: Array.isArray(block.originalResults) ? block.originalResults : [],
        filteredResults: Array.isArray(block.filteredResults) ? block.filteredResults : [],
        durationMs: Number.isFinite(block.durationMs) ? Number(block.durationMs) : 0,
        items: [],
        _toolKeys: new Set(),
        _querySet: new Set(),
      })
      continue
    }

    if (block.type === 'tool_call' || block.type === 'tool_result' || block.type === 'tool') {
      const fallbackTool = {
        id: block.toolCallId || null,
        name: block.name || 'tool',
        status: block.status || 'done',
        arguments: block.arguments ?? null,
        output: block.output ?? null,
        durationMs: Number.isFinite(block.durationMs) ? Number(block.durationMs) : null,
      }
      const tool = (block.toolCallId && toolById.get(String(block.toolCallId))) || fallbackTool
      if (
        !tool?.name ||
        tool.name === 'interactive_form' ||
        tool.name === 'form_submission_status' ||
        tool.name === 'search_result_filter'
      ) {
        continue
      }

      const isSearchTool = SEARCH_STEP_TOOLS.has(String(tool.name))
      if (isSearchTool) {
        const searchToolKey = getToolStepKey(tool)
        const lastStep = steps[steps.length - 1]
        if (lastStep?.kind === 'search' && lastStep.stepKey === searchToolKey) {
          addToolToStep(lastStep, tool)
        } else {
          const newSearchStep = {
            kind: 'search',
            stepKey: searchToolKey,
            items: [],
            queries: [],
            sources: [],
            durationMs: 0,
            _toolKeys: new Set(),
            _querySet: new Set(),
          }
          steps.push(newSearchStep)
          addToolToStep(newSearchStep, tool)
        }
        continue
      }

      const lastStep = steps[steps.length - 1]
      if (lastStep?.kind === 'tools') {
        if (!lastStep._toolKeys.has(String(tool.id || `${tool.name}:${lastStep.items.length}`))) {
          lastStep._toolKeys.add(String(tool.id || `${tool.name}:${lastStep.items.length}`))
          lastStep.items.push(tool)
        }
      } else {
        steps.push({
          kind: 'tools',
          items: [tool],
          _toolKeys: new Set([String(tool.id || `${tool.name}:0`)]),
        })
      }
    }
  }

  const allSourcesList = Array.isArray(mergedSources) ? [...mergedSources] : []
  const unallocatedSources = new Set(allSourcesList)

  steps.forEach(step => {
    if (step.kind !== 'search') return

    const matchedSources = []
    let originalResultCount = 0
    let filteredResultCount = 0
    let searchFilterApplied = false
    let searchFilterStatus = 'done'
    let searchFilterFallbackReason = null
    let searchFilterOriginalResults = []
    let searchFilterFilteredResults = []
    const searchFilterEntries = []

    step.items.forEach(tool => {
      const parsed = parseToolOutput(tool.output)
      if (!parsed) return

      const results =
        parsed.results || parsed.data || parsed.items || (Array.isArray(parsed) ? parsed : [])
      if (!Array.isArray(results)) return

      const filterMeta =
        parsed.search_filter && typeof parsed.search_filter === 'object'
          ? parsed.search_filter
          : parsed.searchFilter && typeof parsed.searchFilter === 'object'
            ? parsed.searchFilter
            : null

      if (filterMeta) {
        const currentOriginalCount = Number(filterMeta.original_count || filterMeta.originalCount || 0)
        const currentFilteredCount = Number(filterMeta.filtered_count || filterMeta.filteredCount || 0)
        originalResultCount += currentOriginalCount
        filteredResultCount += currentFilteredCount
        searchFilterApplied = searchFilterApplied || Boolean(filterMeta.applied)
        if (filterMeta.status) searchFilterStatus = String(filterMeta.status)
        if (filterMeta.fallback_reason) {
          searchFilterFallbackReason = String(filterMeta.fallback_reason)
        }
        const metaOriginalResults = Array.isArray(filterMeta.original_results)
          ? filterMeta.original_results
          : Array.isArray(filterMeta.originalResults)
            ? filterMeta.originalResults
            : []
        const metaFilteredResults = Array.isArray(filterMeta.filtered_results)
          ? filterMeta.filtered_results
          : Array.isArray(filterMeta.filteredResults)
            ? filterMeta.filteredResults
            : []
        searchFilterOriginalResults = dedupeSearchResults([
          ...searchFilterOriginalResults,
          ...metaOriginalResults,
        ])
        searchFilterFilteredResults = dedupeSearchResults([
          ...searchFilterFilteredResults,
          ...metaFilteredResults,
        ])
        searchFilterEntries.push({
          query:
            String(
              filterMeta.query || parsed.query || parsed.search_query || parsed.searchQuery || '',
            ).trim() || '',
          status: String(filterMeta.status || 'done'),
          applied: Boolean(filterMeta.applied),
          originalCount: currentOriginalCount || metaOriginalResults.length,
          filteredCount: currentFilteredCount || metaFilteredResults.length,
          fallbackReason: filterMeta.fallback_reason || filterMeta.fallbackReason || null,
          originalResults: dedupeSearchResults(metaOriginalResults),
          filteredResults: dedupeSearchResults(metaFilteredResults),
        })
      } else {
        originalResultCount += results.length
        filteredResultCount += results.length
        searchFilterOriginalResults = dedupeSearchResults([...searchFilterOriginalResults, ...results])
        searchFilterFilteredResults = dedupeSearchResults([...searchFilterFilteredResults, ...results])
      }

      results.forEach(result => {
        const url = result?.url || result?.link || result?.href
        if (!url) return
        matchedSources.push({
          url,
          title: result.title || url,
          snippet: result.snippet || result.description || '',
          media: result.media || '',
          icon: result.icon || '',
        })
      })
    })

    if (matchedSources.length === 0) {
      const stepOutputs = step.items
        .map(tool => {
          let text = String(tool.output || '')
          if (typeof tool.output === 'object') {
            try {
              text = JSON.stringify(tool.output)
            } catch {}
          }
          return text
        })
        .join('\n')

      for (const src of unallocatedSources) {
        if (
          (src.url && stepOutputs.includes(src.url)) ||
          (src.title && stepOutputs.includes(src.title)) ||
          (src.id && stepOutputs.includes(`"${src.id}"`))
        ) {
          matchedSources.push(src)
          unallocatedSources.delete(src)
        }
      }
    }

    const seenUrls = new Set()
    step.sources = matchedSources.filter(src => {
      if (!src.url) return false
      if (seenUrls.has(src.url)) return false
      seenUrls.add(src.url)
      return true
    })

    if (originalResultCount === 0 && step.sources.length > 0) {
      originalResultCount = step.sources.length
    }
    if (filteredResultCount === 0 && step.sources.length > 0) {
      filteredResultCount = step.sources.length
    }
    if (searchFilterOriginalResults.length === 0 && step.sources.length > 0) {
      searchFilterOriginalResults = [...step.sources]
    }
    if (searchFilterFilteredResults.length === 0 && step.sources.length > 0) {
      searchFilterFilteredResults = [...step.sources]
    }

    step.searchFilter = {
      originalCount: originalResultCount,
      filteredCount: filteredResultCount || step.sources.length,
      applied: searchFilterApplied,
      status: searchFilterStatus,
      fallbackReason: searchFilterFallbackReason,
      originalResults: searchFilterOriginalResults,
      filteredResults:
        searchFilterFilteredResults.length > 0 ? searchFilterFilteredResults : step.sources,
      entries: searchFilterEntries,
    }
  })

  return steps.map(step => {
    const nextStep = { ...step }
    delete nextStep._toolKeys
    delete nextStep._querySet
    return nextStep
  })
}
