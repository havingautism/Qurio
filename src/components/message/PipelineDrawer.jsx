import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  Brain,
  ArrowDown,
  ChevronDown,
  ChevronsRight,
  CircleDot,
  Copy,
  GitBranch,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react'

const NODE_META = {
  reasoning: {
    icon: Brain,
    tone: 'border-sky-200/80 bg-sky-50/90 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300',
  },
  tool_call: {
    icon: Wrench,
    tone: 'border-amber-200/80 bg-amber-50/90 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  },
  tool_result: {
    icon: CircleDot,
    tone: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  agent_switch: {
    icon: GitBranch,
    tone: 'border-fuchsia-200/80 bg-fuchsia-50/90 text-fuchsia-700 dark:border-fuchsia-500/25 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
  },
  workflow_step: {
    icon: Sparkles,
    tone: 'border-violet-200/80 bg-violet-50/90 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300',
  },
  final_response: {
    icon: ChevronsRight,
    tone: 'border-primary-200/80 bg-primary-50/90 text-primary-700 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-300',
  },
  model_output: {
    icon: ChevronsRight,
    tone: 'border-indigo-200/80 bg-indigo-50/90 text-indigo-700 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300',
  },
}

const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

const formatDuration = value => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  if (num < 1000) return `${Math.round(num)} ms`
  return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)} s`
}

const SectionBody = ({ section, isDark }) => {
  if (!section) return null
  if (section.kind === 'json') {
    const raw = String(section.value || '')
    let language = 'json'
    let codeText = raw
    try {
      const parsed = JSON.parse(raw)
      codeText = JSON.stringify(parsed, null, 2)
    } catch {
      language = 'text'
    }
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/10 dark:bg-[#111318]/72">
        <div className="flex items-center justify-between border-b border-slate-200/70 bg-slate-50/80 px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          <span>{language}</span>
        </div>
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={language}
          PreTag="div"
          className="code-scrollbar font-code! text-xs text-shadow-none!"
          customStyle={{
            margin: 0,
            padding: '0.75rem',
            background: 'transparent',
            borderRadius: 'inherit',
            whiteSpace: 'pre',
            wordBreak: 'normal',
          }}
          codeTagProps={{
            style: {
              backgroundColor: 'transparent',
              fontFamily: 'inherit',
              whiteSpace: 'inherit',
            },
          }}
        >
          {codeText}
        </SyntaxHighlighter>
      </div>
    )
  }
  if (section.kind === 'list') {
    return (
      <ul className="space-y-1.5 text-sm leading-6 text-slate-700 dark:text-zinc-200">
        {section.value.map((item, index) => (
          <li
            key={`${section.label}-${index}`}
            className="rounded-xl border border-white/40 bg-white/76 px-3 py-2 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/8 dark:bg-white/4 dark:text-zinc-200"
          >
            {item}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="text-sm leading-7 whitespace-pre-wrap text-slate-700 dark:text-zinc-200">
      {section.value}
    </div>
  )
}

const getSectionCopyText = section => {
  if (!section) return ''
  if (Array.isArray(section.value)) return section.value.join('\n')
  if (typeof section.value === 'string') return section.value
  if (section.value == null) return ''
  try {
    return JSON.stringify(section.value, null, 2)
  } catch {
    return String(section.value)
  }
}

const PipelineDrawer = ({ isOpen, onClose, pipeline, t }) => {
  const nodes = Array.isArray(pipeline?.nodes) ? pipeline.nodes : []
  const [expandedNodeIds, setExpandedNodeIds] = useState(() => new Set())
  const isDark = useIsDarkMode()

  const panelTitle = useMemo(() => t('pipeline.title', 'Pipeline'), [t])
  const translateNodeTitle = node => {
    if (!node) return ''
    if (node.type === 'reasoning' && node.title === 'Reasoning') {
      return t('pipeline.nodes.reasoning', 'Reasoning')
    }
    if (node.type === 'final_response' && node.title === 'Final Response') {
      return t('pipeline.nodes.finalResponse', 'Final Response')
    }
    if (node.type === 'final_response' && node.title === 'Final Report') {
      return t('pipeline.nodes.finalReport', 'Final Report')
    }
    if (node.type === 'final_response' && node.title === 'Model Response') {
      return t('pipeline.nodes.modelResponse', 'Model Response')
    }
    if (node.type === 'model_output' && node.title === 'Model Reply') {
      return t('pipeline.nodes.modelReply', 'Model Reply')
    }
    if (node.type === 'workflow_step' && node.title === 'Research Plan') {
      return t('pipeline.nodes.researchPlan', 'Research Plan')
    }
    return node.title
  }
  const translateSectionLabel = label => {
    const map = {
      Content: t('pipeline.sections.content', 'Content'),
      Sources: t('pipeline.sections.sources', 'Sources'),
      Tool: t('pipeline.sections.tool', 'Tool'),
      Input: t('pipeline.sections.input', 'Input'),
      Output: t('pipeline.sections.output', 'Output'),
      Agent: t('pipeline.sections.agent', 'Agent'),
      Role: t('pipeline.sections.role', 'Role'),
      'Assigned Task': t('pipeline.sections.assignedTask', 'Assigned Task'),
      Plan: t('pipeline.sections.plan', 'Plan'),
      Title: t('pipeline.sections.title', 'Title'),
      Goal: t('pipeline.sections.goal', 'Goal'),
      Metadata: t('pipeline.sections.metadata', 'Metadata'),
    }
    return map[label] || label
  }
  const copySectionValue = async (event, section) => {
    event.preventDefault()
    event.stopPropagation()
    const text = getSectionCopyText(section)
    if (!text) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      // fallback below
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(textarea)
    }
  }
  const isToolIoSection = label => ['Input', 'Output'].includes(String(label || ''))

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-10000 flex justify-end bg-slate-950/12 backdrop-blur-[12px] dark:bg-black/52">
      <button type="button" className="flex-1" onClick={onClose} aria-label={t('common.close')} />
      <div className="glass-elite-panel relative flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-white/50 bg-white/78 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-[#101114]/74">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/35 via-transparent to-white/10 dark:from-white/8 dark:via-transparent dark:to-transparent" />
        <div className="relative flex items-center justify-between border-b border-slate-200/80 bg-white/58 px-4 py-3 backdrop-blur-2xl dark:border-white/10 dark:bg-black/20">
          <div className="flex items-center gap-2.5">
            <div className="text-primary-600 dark:text-primary-300 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5">
              <GitBranch size={18} />
            </div>
            <div className="text-xl leading-none font-semibold text-slate-900 dark:text-white">
              {panelTitle}
            </div>
            <div className="glass-elite-chip rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase dark:text-zinc-400">
              {t('pipeline.header', '执行流程')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass-elite-chip inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-700 dark:text-zinc-300 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {nodes.length === 0 ? (
            <div className="glass-elite-soft rounded-[28px] px-5 py-6 text-sm text-slate-500 dark:text-zinc-400">
              {t('pipeline.empty', 'No pipeline data available for this message yet.')}
            </div>
          ) : (
            <div className="space-y-3">
              {nodes.map((node, index) => {
                const nodeMeta = NODE_META[node.type] || NODE_META.workflow_step
                const Icon = nodeMeta.icon
                const isExpanded = expandedNodeIds.has(node.id)
                const hasExpandableDetails =
                  Array.isArray(node.detailSections) && node.detailSections.length > 0
                const duration = formatDuration(node.durationMs)
                return (
                  <div key={node.id}>
                    <div
                      className={clsx(
                        'glass-elite-soft group mb-3 w-full rounded-[26px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-28px_rgba(15,23,42,0.24)] dark:hover:shadow-[0_18px_38px_-28px_rgba(0,0,0,0.55)]',
                        hasExpandableDetails && 'hover:border-white/30',
                      )}
                    >
                      {hasExpandableDetails ? (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedNodeIds(current => {
                              const next = new Set(current)
                              if (next.has(node.id)) next.delete(node.id)
                              else next.add(node.id)
                              return next
                            })
                          }}
                          className="flex w-full cursor-pointer items-center gap-3 text-left"
                        >
                          <div
                            className={clsx(
                              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                              nodeMeta.tone,
                            )}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-[15px] font-semibold text-slate-900 dark:text-white">
                                    {translateNodeTitle(node)}
                                  </div>
                                  {node.badge && (
                                    <span className="glass-elite-chip rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.14em] text-slate-500 uppercase dark:text-zinc-400">
                                      {node.badge}
                                    </span>
                                  )}
                                  {node.actor && (
                                    <span className="glass-elite-chip rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                                      {node.actor}
                                    </span>
                                  )}
                                </div>
                                {node.summary && (
                                  <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-zinc-300">
                                    {node.summary}
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {duration && (
                                  <span className="glass-elite-chip rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                                    {duration}
                                  </span>
                                )}
                                <ChevronDown
                                  size={16}
                                  className={clsx(
                                    'text-slate-400 transition-transform duration-200 dark:text-zinc-500',
                                    isExpanded && 'rotate-180',
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div
                            className={clsx(
                              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                              nodeMeta.tone,
                            )}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-[15px] font-semibold text-slate-900 dark:text-white">
                                    {translateNodeTitle(node)}
                                  </div>
                                  {node.badge && (
                                    <span className="glass-elite-chip rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.14em] text-slate-500 uppercase dark:text-zinc-400">
                                      {node.badge}
                                    </span>
                                  )}
                                  {node.actor && (
                                    <span className="glass-elite-chip rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                                      {node.actor}
                                    </span>
                                  )}
                                </div>
                                {node.summary && (
                                  <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-zinc-300">
                                    {node.summary}
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {duration && (
                                  <span className="glass-elite-chip rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                                    {duration}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {hasExpandableDetails && isExpanded && node.detailSections.length > 0 && (
                        <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-4 dark:border-white/10">
                          {node.detailSections.map(section => (
                            <div
                              key={`${node.id}-${section.label}`}
                              className="glass-elite-soft rounded-[24px] p-3.5"
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase dark:text-zinc-400">
                                  {translateSectionLabel(section.label)}
                                </div>
                                {isToolIoSection(section.label) && (
                                  <button
                                    type="button"
                                    onClick={event => copySectionValue(event, section)}
                                    className="glass-elite-chip inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-zinc-300 dark:hover:text-white"
                                    title={t('common.copy', 'Copy')}
                                    aria-label={t('common.copy', 'Copy')}
                                  >
                                    <Copy size={12} />
                                    {t('common.copy', 'Copy')}
                                  </button>
                                )}
                              </div>
                              <SectionBody section={section} isDark={isDark} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {index < nodes.length - 1 && (
                      <div className="flex items-center justify-center py-2">
                        <div className="flex w-full items-center gap-3 px-6 text-slate-300 dark:text-zinc-600">
                          <div className="h-px flex-1 bg-linear-to-r from-transparent via-slate-300/70 to-transparent dark:via-white/10" />
                          <ArrowDown size={15} className="shrink-0 opacity-80" />
                          <div className="h-px flex-1 bg-linear-to-l from-transparent via-slate-300/70 to-transparent dark:via-white/10" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default PipelineDrawer
