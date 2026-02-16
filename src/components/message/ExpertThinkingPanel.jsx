import { useMemo } from 'react'
import { BrainCircuit, ChevronDown } from 'lucide-react'
import {
  normalizeExpertThinkingForDisplay,
  normalizeExpertThinkingLines,
} from '../../lib/chat/expertTextUtils'

const ExpertThinkingPanel = ({
  t,
  parts = [],
  isStreaming = false,
  hasMainText = false,
  formatRoundLabel = null,
}) => {
  if (!Array.isArray(parts) || parts.length === 0) return null

  const headerLabel =
    !isStreaming || parts.length === 0 || hasMainText
      ? t('messageBubble.deepThinking')
      : t('messageBubble.thinking')
  const totalDurationMs = useMemo(
    () =>
      parts.reduce(
        (acc, part) =>
          acc + (typeof part?.durationMs === 'number' && part.durationMs > 0 ? part.durationMs : 0),
        0,
      ),
    [parts],
  )
  const hasMultipleRounds = parts.length > 1

  return (
    <details className="group mb-4" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-gray-600 select-none hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100">
        <div className="flex items-center gap-2">
          <BrainCircuit size={15} className="text-primary-500/80 dark:text-primary-300/75" />
          <span className="text-sm font-medium tracking-tight">{headerLabel}</span>
          {totalDurationMs > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('messageBubble.thinkingDuration', {
                duration: (totalDurationMs / 1000).toFixed(0),
              })}
            </span>
          )}
          <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-zinc-800/80 dark:text-gray-300">
            {parts.length}
          </span>
        </div>
        <ChevronDown size={15} className="opacity-60 transition-transform group-open:rotate-180" />
      </summary>
      <div className="always-visible-scrollbar mt-1 max-h-[220px] overflow-y-auto border-l border-gray-300/80 pr-2 pl-4 !whitespace-normal dark:border-zinc-700/80">
        {parts.map((part, idx) => {
          const text = normalizeExpertThinkingForDisplay(
            normalizeExpertThinkingLines(String(part?.content || '')),
          )
          return (
            <div key={part?.key || `expert-thought-${idx}`} className="mb-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {hasMultipleRounds && (
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    {typeof formatRoundLabel === 'function'
                      ? formatRoundLabel(idx + 1)
                      : `Round ${idx + 1}`}
                  </span>
                )}
                {typeof part?.durationMs === 'number' && part.durationMs >= 0 && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {t('messageBubble.thinkingDuration', {
                      duration: (part.durationMs / 1000).toFixed(2),
                    })}
                  </span>
                )}
              </div>
              <div className="text-sm leading-relaxed !whitespace-normal text-gray-500 dark:text-gray-400">
                {text}
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}

export default ExpertThinkingPanel
