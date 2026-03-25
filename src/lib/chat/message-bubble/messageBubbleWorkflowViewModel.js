export function buildWorkflowProcessSteps({
  processSteps,
  isDeepResearch,
  researchSteps,
  isStreaming,
  hasMainText,
  wallClockFinalSec,
  answerGenerationDurationMs,
}) {
  const base = Array.isArray(processSteps) ? [...processSteps] : []
  const shouldShowAnswerStep = Boolean(
    isStreaming || hasMainText || base.length > 0 || typeof wallClockFinalSec === 'number',
  )

  if (isDeepResearch) {
    const mappedSteps = (researchSteps || []).map(step => ({
      kind: 'research_step',
      ...step,
    }))
    if (!shouldShowAnswerStep) return mappedSteps

    const finalMs = answerGenerationDurationMs > 0 ? answerGenerationDurationMs : 0
    const stepMs = mappedSteps.reduce(
      (sum, step) => sum + (typeof step.durationMs === 'number' ? step.durationMs : 0),
      0,
    )

    mappedSteps.push({
      kind: 'final_answer',
      status: isStreaming ? 'running' : 'done',
      durationMs: stepMs + finalMs > 0 ? stepMs + finalMs : null,
    })

    return mappedSteps
  }

  if (!shouldShowAnswerStep) return base

  const finalMs = answerGenerationDurationMs > 0 ? answerGenerationDurationMs : 0
  const hasExplicitSearchFilterStep = base.some(step => step?.kind === 'search_filter')
  const expandedBase = hasExplicitSearchFilterStep
    ? base
    : base.flatMap((step, idx) => {
        if (step?.kind !== 'search') return [step]

        const searchFilterEntries = Array.isArray(step.searchFilter?.entries)
          ? step.searchFilter.entries.filter(entry => {
              const originalCount = Number(entry?.originalCount || 0)
              const filteredCount = Number(entry?.filteredCount || 0)
              return Boolean(entry?.applied) && originalCount > 0 && filteredCount > 0
            })
          : []

        if (searchFilterEntries.length > 0) {
          return [
            step,
            ...searchFilterEntries.map((entry, entryIdx) => ({
              kind: 'search_filter',
              sourceStepKey: `${step.stepKey || `search-${idx}`}-filter-${entryIdx}`,
              queries: entry?.query
                ? [String(entry.query)]
                : Array.isArray(step.queries)
                  ? [...step.queries]
                  : [],
              status: String(entry?.status || 'done'),
              applied: Boolean(entry?.applied),
              originalCount: Number(entry?.originalCount || 0),
              filteredCount: Number(entry?.filteredCount || 0),
              fallbackReason: entry?.fallbackReason || null,
              originalResults: Array.isArray(entry?.originalResults) ? [...entry.originalResults] : [],
              filteredResults: Array.isArray(entry?.filteredResults) ? [...entry.filteredResults] : [],
            })),
          ]
        }

        const originalCount = Number(step.searchFilter?.originalCount || 0)
        const filteredCount = Number(step.searchFilter?.filteredCount || 0)
        const applied = Boolean(step.searchFilter?.applied)
        const hasSearchFilterNode =
          applied && originalCount > 0 && filteredCount > 0 && filteredCount < originalCount

        if (!hasSearchFilterNode) return [step]

        return [
          step,
          {
            kind: 'search_filter',
            sourceStepKey: step.stepKey || `search-${idx}`,
            queries: Array.isArray(step.queries) ? [...step.queries] : [],
            status: String(step.searchFilter?.status || 'done'),
            applied,
            originalCount,
            filteredCount,
            fallbackReason: step.searchFilter?.fallbackReason || null,
            originalResults: Array.isArray(step.searchFilter?.originalResults)
              ? [...step.searchFilter.originalResults]
              : [],
            filteredResults: Array.isArray(step.searchFilter?.filteredResults)
              ? [...step.searchFilter.filteredResults]
              : [],
          },
        ]
      })

  const sumOfBaseMs = expandedBase.reduce((sum, step) => {
    if (typeof step.durationMs === 'number') return sum + step.durationMs
    if (step.kind === 'tools' && Array.isArray(step.items)) {
      return (
        sum +
        step.items.reduce((innerSum, item) => innerSum + (typeof item.durationMs === 'number' ? item.durationMs : 0), 0)
      )
    }
    return sum
  }, 0)

  const cumulativeMs = sumOfBaseMs + finalMs
  expandedBase.push({
    kind: 'final_answer',
    status: isStreaming ? 'running' : 'done',
    durationMs: cumulativeMs > 0 ? cumulativeMs : null,
  })

  return expandedBase
}

export function deriveWorkflowState({
  workflowProcessSteps,
  answerGenerationDurationMs,
  hasMainText,
  isStreaming,
}) {
  const hasWorkflowFinalAnswerStep = workflowProcessSteps.some(step => step?.kind === 'final_answer')

  let finalAnswerWorkflowStep = null
  for (let i = workflowProcessSteps.length - 1; i >= 0; i -= 1) {
    if (workflowProcessSteps[i]?.kind === 'final_answer') {
      finalAnswerWorkflowStep = workflowProcessSteps[i]
      break
    }
  }

  const workflowSearchStep = workflowProcessSteps.find(step => step.kind === 'search') || null
  const thoughtParts = workflowProcessSteps.filter(step => step.kind === 'thought')
  const workflowThoughtStep =
    thoughtParts.length > 0
      ? {
          content: thoughtParts.map(step => String(step.content || '')).join(''),
          durationMs: thoughtParts.reduce(
            (sum, step) => sum + (typeof step.durationMs === 'number' ? step.durationMs : 0),
            0,
          ),
        }
      : null

  const workflowToolItems = workflowProcessSteps
    .filter(step => step.kind === 'tools' && Array.isArray(step.items))
    .flatMap(step => step.items || [])

  const workflowSearchDurationMs = workflowProcessSteps
    .filter(step => step.kind === 'search')
    .reduce((sum, step) => sum + (typeof step.durationMs === 'number' ? step.durationMs : 0), 0)

  const thoughtMs = workflowThoughtStep?.durationMs || 0
  const searchMs = workflowSearchDurationMs || 0
  const toolMs = workflowToolItems.reduce(
    (sum, item) => sum + (typeof item.durationMs === 'number' ? item.durationMs : 0),
    0,
  )
  const processDurationMs = thoughtMs + searchMs + toolMs
  const processDurationSec = Math.max(0, Math.round(processDurationMs / 1000))
  const totalMs = processDurationMs + (answerGenerationDurationMs > 0 ? answerGenerationDurationMs : 0)
  const completedDurationSec = totalMs > 0 ? Math.max(0, Math.round(totalMs / 1000)) : null
  const finalAnswerDurationMsForDisplay = answerGenerationDurationMs > 0 ? answerGenerationDurationMs : null
  const shouldShowWorkflowFinalAnswer = hasMainText && !isStreaming

  return {
    hasWorkflowFinalAnswerStep,
    finalAnswerWorkflowStep,
    workflowSearchStep,
    workflowThoughtStep,
    workflowToolItems,
    workflowSearchDurationMs,
    processDurationMs,
    processDurationSec,
    completedDurationSec,
    finalAnswerDurationMsForDisplay,
    shouldShowWorkflowFinalAnswer,
  }
}

export function getActiveStreamingStepKind({
  isStreaming,
  normalizedStreamBlocks,
  hasStartedAnswerTextStream,
  processSteps,
}) {
  if (!isStreaming) return null

  const lastStreamBlock = normalizedStreamBlocks[normalizedStreamBlocks.length - 1]
  const lastStreamType = String(lastStreamBlock?.type || '')
  if (lastStreamType === 'text' && hasStartedAnswerTextStream) {
    return 'final_answer'
  }

  const lastProcessStep = processSteps[processSteps.length - 1]
  if (lastProcessStep?.kind === 'search_filter') return 'search_filter'
  if (lastProcessStep?.kind === 'search') return 'search'
  if (lastProcessStep?.kind === 'tools') return 'tools'
  if (lastProcessStep?.kind === 'thought') return 'thought'

  if (hasStartedAnswerTextStream) return 'final_answer'
  return null
}
