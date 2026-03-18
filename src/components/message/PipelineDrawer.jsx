import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  Brain,
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
    tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  },
  tool_call: {
    icon: Wrench,
    tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  },
  tool_result: {
    icon: CircleDot,
    tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  },
  agent_switch: {
    icon: GitBranch,
    tone: 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10',
  },
  workflow_step: {
    icon: Sparkles,
    tone: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
  },
  final_response: {
    icon: ChevronsRight,
    tone: 'text-primary-300 border-primary-500/30 bg-primary-500/10',
  },
  model_output: {
    icon: ChevronsRight,
    tone: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10',
  },
}

const formatDuration = value => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  if (num < 1000) return `${Math.round(num)} ms`
  return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)} s`
}

const SectionBody = ({ section }) => {
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
      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-zinc-400 uppercase">
          <span>{language}</span>
        </div>
        <SyntaxHighlighter
          style={oneDark}
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
      <ul className="space-y-1.5 text-sm leading-6 text-zinc-200">
        {section.value.map((item, index) => (
          <li key={`${section.label}-${index}`} className="rounded-lg bg-white/4 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    )
  }
  return <div className="text-sm leading-7 whitespace-pre-wrap text-zinc-200">{section.value}</div>
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
    <div className="fixed inset-0 z-10000 flex justify-end bg-black/45 backdrop-blur-sm">
      <button type="button" className="flex-1" onClick={onClose} aria-label={t('common.close')} />
      <div className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#131416] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="border-primary-500/25 bg-primary-500/10 text-primary-200 inline-flex h-10 w-10 items-center justify-center rounded-xl border">
              <GitBranch size={18} />
            </div>
            <div className="text-xl leading-none font-semibold text-white">{panelTitle}</div>
            <div className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-zinc-400 uppercase">
              {t('pipeline.header', '执行流程')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {nodes.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-white/3 px-5 py-6 text-sm text-zinc-400">
              {t('pipeline.empty', 'No pipeline data available for this message yet.')}
            </div>
          ) : (
            <div className="space-y-2.5">
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
                        'w-full rounded-2xl border border-white/8 bg-white/3 px-3.5 py-3 text-left',
                        hasExpandableDetails && 'transition-colors hover:bg-white/5',
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
                              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                              nodeMeta.tone,
                            )}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-[15px] font-semibold text-white">
                                    {translateNodeTitle(node)}
                                  </div>
                                  {node.badge && (
                                    <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[11px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
                                      {node.badge}
                                    </span>
                                  )}
                                  {node.actor && (
                                    <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                                      {node.actor}
                                    </span>
                                  )}
                                </div>
                                {node.summary && (
                                  <div className="mt-1 text-xs leading-5 text-zinc-300">
                                    {node.summary}
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {duration && (
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                    {duration}
                                  </span>
                                )}
                                <ChevronDown
                                  size={16}
                                  className={clsx(
                                    'text-zinc-500 transition-transform duration-200',
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
                              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                              nodeMeta.tone,
                            )}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-[15px] font-semibold text-white">
                                    {translateNodeTitle(node)}
                                  </div>
                                  {node.badge && (
                                    <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[11px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
                                      {node.badge}
                                    </span>
                                  )}
                                  {node.actor && (
                                    <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                                      {node.actor}
                                    </span>
                                  )}
                                </div>
                                {node.summary && (
                                  <div className="mt-1 text-xs leading-5 text-zinc-300">
                                    {node.summary}
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {duration && (
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                    {duration}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {hasExpandableDetails && isExpanded && node.detailSections.length > 0 && (
                        <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
                          {node.detailSections.map(section => (
                            <div
                              key={`${node.id}-${section.label}`}
                              className="rounded-lg border border-white/8 bg-black/10 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-[11px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">
                                  {translateSectionLabel(section.label)}
                                </div>
                                {isToolIoSection(section.label) && (
                                  <button
                                    type="button"
                                    onClick={event => copySectionValue(event, section)}
                                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                                    title={t('common.copy', 'Copy')}
                                    aria-label={t('common.copy', 'Copy')}
                                  >
                                    <Copy size={12} />
                                    {t('common.copy', 'Copy')}
                                  </button>
                                )}
                              </div>
                              <SectionBody section={section} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {index < nodes.length - 1 && (
                      <div className="flex justify-center py-1 text-zinc-600">
                        <ChevronDown size={16} />
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
