import React, { memo } from 'react'
import clsx from 'clsx'
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Link,
  ScanText,
  Search,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react'
import remarkGfm from 'remark-gfm'
import { Streamdown } from 'streamdown'
import { getSearchFilterFallbackPresentation } from '../../lib/chat/searchFilterPresentation'
import { hasNavigableSourceLink } from '../../lib/chat/message-bubble/messageBubbleSourcesViewModel'
import DesktopSourcesSection from '../DesktopSourcesSection'
import DotLoader from '../DotLoader'
import SearchSourcesList from './SearchSourcesList'

const WorkflowPanel = memo(function WorkflowPanel({
  workflowProcessSteps,
  isExpertMessage,
  isWorkflowExpanded,
  setIsWorkflowExpanded,
  isDeepResearch,
  deepResearchHeaderText,
  isStreaming,
  hasStartedAnswerTextStream,
  hasWorkflowFinalAnswerStep,
  activeStreamingStepKind,
  t,
  completedDurationSec,
  shouldShowWorkflowSourceSummary,
  allSources,
  isMobile,
  handleMobileSourceClick,
  setIsSourcesOpen,
  headerSourceLogos,
  workflowContainerRef,
  displayWorkflowThoughtDurationMs,
  formatThoughtContentForDisplay,
  mermaidOptions,
  markdownComponents,
  researchStepsCount,
  getToolCallsForStep,
  renderToolQueryPreview,
  getToolDisplayName,
  renderWorkflowToolCapsule,
  searchLiveElapsedSec,
  expandedToolsSteps,
  toggleToolsStep,
  shouldShowWorkflowFinalAnswer,
  finalAnswerDurationMsForDisplay,
}) {
  if (workflowProcessSteps.length === 0) return null

  return (
    <details
      className={clsx(
        'group workflow-process-summary',
        !isExpertMessage && 'mt-0 mb-4',
        isExpertMessage && 'mt-4 mb-4',
      )}
      open={isWorkflowExpanded}
      onToggle={event => setIsWorkflowExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1.5 text-gray-700 select-none hover:text-gray-900 dark:text-gray-200 dark:hover:text-white">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {isDeepResearch ? (
              <>
                <span className="truncate">{deepResearchHeaderText}</span>
                {isStreaming && <DotLoader size="sm" />}
              </>
            ) : isStreaming ? (
              <>
                <span>
                  {(() => {
                    if (
                      isStreaming &&
                      !hasStartedAnswerTextStream &&
                      hasWorkflowFinalAnswerStep &&
                      (activeStreamingStepKind === null ||
                        activeStreamingStepKind === 'final_answer')
                    ) {
                      return isDeepResearch
                        ? t('messageBubble.statusResearchGenerationWaiting', '研究生成等待中')
                        : t('messageBubble.statusGenerationWaiting', '生成等待中')
                    }
                    if (activeStreamingStepKind === 'final_answer')
                      return isDeepResearch
                        ? t('messageBubble.statusGeneratingResearch', '研究生成中')
                        : t('messageBubble.statusGeneratingAnswer', '正在生成正文')
                    if (activeStreamingStepKind === 'search_filter')
                      return t('messageBubble.statusFiltering', '正在筛选')
                    if (activeStreamingStepKind === 'search')
                      return t('messageBubble.statusSearching', '正在搜索')
                    if (activeStreamingStepKind === 'tools')
                      return t('messageBubble.statusCallingTools', '正在调用工具')
                    return t('messageBubble.statusThinking', '正在思考分析')
                  })()}
                </span>
                <DotLoader size="sm" />
              </>
            ) : (
              t('messageBubble.completedAnswer', { duration: completedDurationSec })
            )}
          </span>
          {isWorkflowExpanded ? (
            <ChevronDown size={16} className="opacity-60" />
          ) : (
            <ChevronRight size={16} className="opacity-60" />
          )}
        </div>
        {shouldShowWorkflowSourceSummary && allSources.length > 0 && (
          <button
            type="button"
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              if (isMobile) {
                handleMobileSourceClick(allSources, t('sources.allSources'))
                return
              }
              setIsSourcesOpen(prev => !prev)
            }}
            className="glass-elite-chip inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200"
          >
            <span className="flex -space-x-2">
              {headerSourceLogos.map((icon, idx) => (
                <img
                  key={`header-source-${idx}`}
                  src={icon}
                  alt=""
                  className="h-5 w-5 rounded-full border border-white/80 bg-white object-cover dark:border-zinc-800"
                />
              ))}
            </span>
            <span className="text-[10px]!">
              {t('sources.allSources')} {allSources.length}
            </span>
          </button>
        )}
      </summary>
      <div className="glass-elite-soft mt-3 rounded-2xl px-3 py-4">
        <div
          ref={workflowContainerRef}
          className="no-scrollbar max-h-[350px] overflow-y-auto pr-3 sm:max-h-[420px] sm:pr-4"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="relative pl-7">
            {(() => {
              const thoughtStepCount = workflowProcessSteps.filter(
                step => step.kind === 'thought',
              ).length
              return workflowProcessSteps.map((step, idx) => {
                const isNotLast =
                  idx < workflowProcessSteps.length - 1 ||
                  allSources.length > 0 ||
                  shouldShowWorkflowFinalAnswer

                if (step.kind === 'thought') {
                  if (!step.content) return null
                  const thoughtDurationMs =
                    typeof step.durationMs === 'number' && step.durationMs > 0
                      ? step.durationMs
                      : thoughtStepCount === 1
                        ? displayWorkflowThoughtDurationMs
                        : null
                  return (
                    <div key={`thought-${idx}`} className="relative mb-4">
                      {isNotLast && (
                        <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                      )}
                      <div className="absolute top-0.5 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                        <BrainCircuit size={16} />
                      </div>
                      <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
                        <span className="text-xs leading-5 font-medium text-gray-400 dark:text-zinc-500">
                          {t('messageBubble.reasoningLabel', '思考过程')}
                        </span>
                        {typeof thoughtDurationMs === 'number' && thoughtDurationMs > 0 && (
                          <span className="text-xs! leading-5 text-gray-500 dark:text-gray-400">
                            {t('messageBubble.toolDuration', {
                              duration: (thoughtDurationMs / 1000).toFixed(2),
                            })}
                          </span>
                        )}
                      </div>
                      <div className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                        <Streamdown
                          mermaid={mermaidOptions}
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {formatThoughtContentForDisplay(step.content)}
                        </Streamdown>
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'research_step') {
                  const isRunning = step.status === 'running'
                  const isPending = step.status === 'pending'
                  const isActive = isRunning || isPending
                  const isDone = step.status === 'done'
                  const isError = step.status === 'error'
                  const stepToolCalls = getToolCallsForStep(step.step)
                  const durationLabel =
                    typeof step.durationMs === 'number'
                      ? t('messageBubble.researchStepDuration', {
                          duration: (step.durationMs / 1000).toFixed(2),
                        })
                      : null
                  const statusLabel = isError
                    ? t('messageBubble.researchStepStatusError')
                    : isDone
                      ? t('messageBubble.researchStepStatusDone')
                      : isRunning
                        ? t('messageBubble.researchStepStatusRunning')
                        : t('messageBubble.researchStepStatusPending')

                  return (
                    <div
                      key={
                        step.stepKey ||
                        (Number.isFinite(Number(step.step))
                          ? `research-step-${Number(step.step)}`
                          : `research-step-${step.streamOrder ?? step.title ?? 'unknown'}`)
                      }
                      className="relative mb-4"
                    >
                      {isNotLast && (
                        <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                      )}
                      <div className="absolute top-0.75 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                        <ScanText size={16} />
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="rounded-full border border-gray-200/80 bg-white/85 px-2 py-0.5 font-semibold text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300">
                            {t('messageBubble.researchStepLabel', {
                              step: step.step,
                              total: step.total || researchStepsCount,
                            })}
                          </span>
                          <span
                            className={clsx(
                              'rounded-full px-2 py-0.5 text-[10px]',
                              isError
                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                : isDone
                                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-200/70 text-gray-600 dark:bg-zinc-700/70 dark:text-gray-400',
                            )}
                          >
                            {statusLabel}
                          </span>
                          {isActive && <DotLoader />}
                          {durationLabel && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">
                              {durationLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-200">
                          {step.title}
                          {isActive ? '...' : ''}
                        </div>
                        {step.error && (
                          <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-[10px] text-red-500 dark:text-red-400">
                            {step.error}
                          </div>
                        )}
                        {stepToolCalls.length > 0 && (
                          <div className="space-y-2">
                            {stepToolCalls.map(item => {
                              const hasDuration = typeof item.durationMs === 'number'
                              const queryPreview = renderToolQueryPreview(
                                item,
                                'max-w-[280px] truncate text-xs text-gray-600 dark:text-gray-300',
                              )
                              const isSearchLike = Boolean(queryPreview)

                              return (
                                <div
                                  key={item.id || `${item.name}-${item.arguments}`}
                                  className="flex items-center gap-3"
                                >
                                  <div className="min-w-0">
                                    {isSearchLike ? (
                                      <div
                                        className={clsx(
                                          'inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.02)]',
                                          item.status === 'error'
                                            ? 'border-red-200/70 bg-red-50/70 text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
                                            : 'border-primary-200/35 dark:border-primary-700/30 bg-white/70 text-gray-700 dark:bg-zinc-800/55 dark:text-gray-200',
                                        )}
                                      >
                                        <Search size={13} className="shrink-0 opacity-75" />
                                        <span className="truncate">
                                          {getToolDisplayName(item) ||
                                            t('messageBubble.searchToolLabel')}
                                        </span>
                                        <span className="min-w-0 truncate">{queryPreview}</span>
                                      </div>
                                    ) : (
                                      renderWorkflowToolCapsule(item, true)
                                    )}
                                  </div>
                                  {hasDuration && (
                                    <span className="ml-auto shrink-0 text-xs! whitespace-nowrap text-gray-500 dark:text-gray-400">
                                      {t('messageBubble.toolDuration', {
                                        duration: (item.durationMs / 1000).toFixed(2),
                                      })}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'search') {
                  const hasQueries = step.queries && step.queries.length > 0
                  if (!hasQueries) return null
                  const isActiveSearch =
                    isStreaming &&
                    (activeStreamingStepKind === 'search' ||
                      step?.status === 'running' ||
                      step.items?.some(
                        item => item?.status === 'calling' || item?.status === 'running',
                      ))
                  const displaySearchDurationMs =
                    isActiveSearch && searchLiveElapsedSec > 0
                      ? searchLiveElapsedSec * 1000
                      : typeof step.durationMs === 'number'
                        ? step.durationMs
                        : null
                  const originalSearchResults = Array.isArray(step.searchFilter?.originalResults)
                    ? step.searchFilter.originalResults
                    : []
                  const hasOriginalCandidates = originalSearchResults.length > 0
                  const originalResultCount =
                    Number(step.searchFilter?.originalCount || 0) || originalSearchResults.length
                  const searchFilterStatus = String(step.searchFilter?.status || '').toLowerCase()
                  const searchFilterFallbackReason = String(
                    step.searchFilter?.fallbackReason || '',
                  ).trim()
                  const shouldShowSearchFallbackNotice =
                    !Boolean(step.searchFilter?.applied) &&
                    (searchFilterStatus === 'fallback' ||
                      searchFilterStatus === 'unavailable' ||
                      Boolean(searchFilterFallbackReason))
                  const searchFallbackPresentation = shouldShowSearchFallbackNotice
                    ? getSearchFilterFallbackPresentation(searchFilterFallbackReason)
                    : null

                  return (
                    <div key={`search-${idx}`} className="relative mb-4">
                      {isNotLast && (
                        <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                      )}

                      <div className="absolute top-0.75 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                        <Search size={16} />
                      </div>

                      <div className="mb-2 flex items-center justify-between text-base font-semibold text-gray-700 dark:text-gray-200">
                        <div className="flex items-center gap-2">
                          {(() => {
                            if (isActiveSearch) {
                              return (
                                <>
                                  <span>{t('messageBubble.statusSearching', '正在搜索...')}</span>
                                  <DotLoader size="sm" />
                                </>
                              )
                            }
                            const count = originalResultCount || step.sources?.length || 0
                            return t('messageBubble.searchFound', { count })
                          })()}
                        </div>
                        {(() => {
                          if (typeof displaySearchDurationMs === 'number') {
                            return (
                              <span className="shrink-0 text-xs! font-normal text-gray-500 dark:text-gray-400">
                                {t('messageBubble.toolDuration', {
                                  duration: (displaySearchDurationMs / 1000).toFixed(1),
                                })}
                              </span>
                            )
                          }
                          return null
                        })()}
                      </div>

                      <div className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                        <div className="mb-0 flex flex-wrap gap-1.5">
                          {step.queries.map(query => (
                            <span
                              key={`query-${query}`}
                              className="inline-flex items-center rounded-lg border border-gray-200/80 bg-white px-2.5 py-1 text-[10px]! text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300"
                            >
                              <Search size={12} className="mr-1.5 opacity-70" />
                              {query}
                            </span>
                          ))}
                        </div>

                        {hasOriginalCandidates && (
                          <div>
                            <SearchSourcesList sources={originalSearchResults} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'search_filter') {
                  const originalCount = Number(
                    step.originalCount ||
                      step.meta?.originalCount ||
                      step.meta?.original_count ||
                      0,
                  )
                  const filteredCount = Number(
                    step.filteredCount ||
                      step.meta?.filteredCount ||
                      step.meta?.filtered_count ||
                      0,
                  )
                  const originalResults = Array.isArray(step.originalResults)
                    ? step.originalResults
                    : []
                  const filteredResults = Array.isArray(step.filteredResults)
                    ? step.filteredResults
                    : []
                  const hasResults =
                    filteredResults.length > 0 && filteredResults.some(hasNavigableSourceLink)
                  const isDone = String(step.status || '') === 'filtered'
                  const isFallback =
                    String(step.status || '') === 'fallback' ||
                    String(step.status || '') === 'unavailable'
                  const isRunning = !isDone && !isFallback
                  const summaryLabel = isRunning
                    ? t('messageBubble.searchFiltering', '正在筛选高相关结果...')
                    : t('messageBubble.searchFiltered', {
                        filtered: filteredCount,
                        original: originalCount,
                      })

                  return (
                    <div key={`search-filter-${idx}`} className="relative mb-4">
                      {isNotLast && (
                        <span className="border-primary-200/80 dark:border-primary-700/60 pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed" />
                      )}

                      <div className="text-primary-500 dark:text-primary-300 absolute top-0.75 -left-7 flex h-4 w-4 items-center justify-center">
                        <SlidersHorizontal size={16} />
                      </div>

                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-gray-700 dark:text-gray-200">
                            {t('messageBubble.searchFilterStep', '筛选结果')}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs! font-normal text-gray-500 dark:text-gray-400">
                          {summaryLabel}
                        </span>
                      </div>

                      <div>
                        {isRunning && (
                          <div className="border-primary-500/10 mb-3 flex items-center gap-3 rounded-2xl border bg-black/[0.02] p-3 dark:bg-white/[0.02]">
                            <span className="bg-primary-500/12 text-primary-500 dark:text-primary-300 relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                              <span className="bg-primary-500/10 absolute inset-0 animate-pulse rounded-xl" />
                              <SlidersHorizontal size={16} className="relative" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-100">
                                {t('messageBubble.searchFiltering', '正在筛选高相关结果...')}
                              </div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {t('messageBubble.searchFilterRunningHint', '等待筛选结果返回')}
                              </div>
                              <div className="bg-primary-500/10 mt-2 h-1.5 overflow-hidden rounded-full">
                                <div className="from-primary-400 via-primary-500 h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r to-fuchsia-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {!isRunning && (
                          <>
                            {hasResults ? (
                              <SearchSourcesList sources={filteredResults} />
                            ) : (
                              <div className="rounded-xl border border-dashed border-gray-200/70 bg-white/40 px-3 py-2 text-sm text-gray-500 dark:border-zinc-700/60 dark:bg-zinc-950/20 dark:text-gray-400">
                                {t(
                                  'messageBubble.searchRelevantResultsEmpty',
                                  '没有可展示的高相关结果',
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'tools') {
                  if (!step.items || step.items.length === 0) return null
                  const isExpanded = expandedToolsSteps.has(idx)
                  const displayItems = isExpanded ? step.items : step.items.slice(0, 2)
                  const hasMoreItems = step.items.length > 2

                  return (
                    <div key={`tools-${idx}`} className="relative mb-4">
                      {isNotLast && (
                        <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                      )}
                      <div className="absolute top-0 -left-7 flex h-8 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                        <Wrench size={16} />
                      </div>

                      <div className="flex w-full flex-col gap-3 md:flex-row md:items-start md:gap-4">
                        <span className="flex h-8 shrink-0 items-center text-xs! leading-none font-bold tracking-wider text-gray-400 uppercase select-none dark:text-zinc-500">
                          {t('messageBubble.workflowToolCalledPrefix', '已调用')}
                        </span>

                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="space-y-2">
                            {displayItems.map((item, itemIdx) => {
                              const hasDuration = typeof item.durationMs === 'number'
                              const isLastItem = itemIdx === displayItems.length - 1
                              return (
                                <div
                                  key={item.id || `${item.name}-${item.arguments}`}
                                  className="group/workflowitem space-y-1.5"
                                >
                                  <div className="flex items-center gap-3 overflow-x-hidden">
                                    <div className="min-w-0">
                                      {renderWorkflowToolCapsule(item, true)}
                                    </div>

                                    {isLastItem && hasMoreItems && (
                                      <div className="hidden items-center gap-2 md:flex">
                                        {!isExpanded && (
                                          <span className="ml-1 text-xs tracking-widest text-gray-300 dark:text-zinc-700">
                                            ...
                                          </span>
                                        )}
                                        <div
                                          onClick={() => toggleToolsStep(idx)}
                                          className="group/tooltoggle flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                                          title={
                                            isExpanded
                                              ? t('common.collapse', '收起')
                                              : t(
                                                  'common.expand',
                                                  `展开剩余 ${step.items.length - 2} 项`,
                                                )
                                          }
                                        >
                                          <div
                                            className={clsx(
                                              'transition-transform duration-300',
                                              isExpanded ? 'rotate-180' : 'rotate-0',
                                              'group-hover/tooltoggle:text-primary-600 dark:group-hover/tooltoggle:text-primary-400',
                                            )}
                                          >
                                            <ChevronDown size={14} />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {hasDuration && (
                                      <span className="ml-auto shrink-0 text-xs! whitespace-nowrap text-gray-500 dark:text-gray-400">
                                        {t('messageBubble.toolDuration', {
                                          duration: (item.durationMs / 1000).toFixed(2),
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="pl-1 text-sm text-gray-600 transition-colors group-hover/workflowitem:text-gray-900 dark:text-gray-300 dark:group-hover/workflowitem:text-zinc-200">
                                    {renderToolQueryPreview(item, 'truncate opacity-80')}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {hasMoreItems && (
                            <div className="flex items-center gap-2 pt-1 md:hidden">
                              {!isExpanded && (
                                <span className="text-xs tracking-widest text-gray-300 dark:text-zinc-700">
                                  ...
                                </span>
                              )}
                              <div
                                onClick={() => toggleToolsStep(idx)}
                                className="group/tooltoggle flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                              >
                                <div
                                  className={clsx(
                                    'transition-transform duration-300',
                                    isExpanded ? 'rotate-180' : 'rotate-0',
                                    'group-hover/tooltoggle:text-primary-600 dark:group-hover/tooltoggle:text-primary-400',
                                  )}
                                >
                                  <ChevronDown size={14} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }

                if (step.kind === 'final_answer') return null

                return null
              })
            })()}

            {shouldShowWorkflowSourceSummary && allSources.length > 0 && (
              <div className="relative mb-4 pt-2">
                {(shouldShowWorkflowFinalAnswer || hasWorkflowFinalAnswerStep) && (
                  <span className="pointer-events-none absolute top-6 bottom-[-16px] -left-5 border-l border-dashed border-gray-300/90 dark:border-zinc-700/90" />
                )}
                <div className="absolute top-2.5 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                  <Link size={16} />
                </div>
                <div className="mb-3 text-base font-semibold text-gray-700 dark:text-gray-200">
                  {isDeepResearch
                    ? t('messageBubble.organizeResearchSources', '整理研究来源')
                    : t('messageBubble.organizedSources', '整理参考资料')}
                </div>
                <DesktopSourcesSection sources={allSources} isOpen variant="legacy" />
              </div>
            )}
            {hasWorkflowFinalAnswerStep && (
              <div className="relative">
                <div className="absolute top-0.5 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                  {isStreaming ? <DotLoader size="6px" gap="3px" /> : <Check size={16} />}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-base font-medium text-gray-600 dark:text-gray-300">
                    <span>
                      {isStreaming
                        ? activeStreamingStepKind === 'final_answer'
                          ? isDeepResearch
                            ? t('messageBubble.statusGeneratingResearch', '研究生成中')
                            : t('messageBubble.statusGeneratingAnswer', '正文生成中')
                          : isDeepResearch
                            ? t('messageBubble.statusResearchGenerationWaiting', '研究生成等待中')
                            : t('messageBubble.statusGenerationWaiting', '生成等待中')
                        : isDeepResearch
                          ? t('messageBubble.finalResearchStep', '生成最终研究')
                          : t('messageBubble.finalAnswerStep', '生成最终回答')}
                    </span>
                  </div>
                  {typeof finalAnswerDurationMsForDisplay === 'number' && (
                    <span className="shrink-0 text-xs! text-gray-500 dark:text-gray-400">
                      {t('messageBubble.toolDuration', {
                        duration: (finalAnswerDurationMsForDisplay / 1000).toFixed(1),
                      })}
                    </span>
                  )}
                </div>
              </div>
            )}
            {shouldShowWorkflowFinalAnswer && !hasWorkflowFinalAnswerStep && (
              <div className="relative">
                <div className="absolute top-0.5 -left-7 flex h-4 w-4 items-center justify-center text-gray-400 dark:text-gray-500">
                  <DotLoader size="6px" gap="3px" />
                </div>
                <div className="text-base font-medium text-gray-600 dark:text-gray-300">
                  {isDeepResearch
                    ? t('messageBubble.finalResearchStep', '生成最终研究')
                    : t('messageBubble.finalAnswerStep')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  )
})

WorkflowPanel.displayName = 'WorkflowPanel'

export default WorkflowPanel
