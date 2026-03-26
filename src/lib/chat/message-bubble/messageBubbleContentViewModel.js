export function buildInterleavedContent({
  mainContent,
  normalizedStreamBlocks,
  isDeepResearch,
  toolCallHistory,
}) {
  const rawContent = mainContent || ''
  const parts = []

  if (!Array.isArray(normalizedStreamBlocks) || normalizedStreamBlocks.length === 0) {
    return [{ type: 'text', content: rawContent }]
  }

  for (const block of normalizedStreamBlocks) {
    if (block.type === 'text') {
      if (block.content) parts.push({ type: 'text', content: block.content })
      continue
    }

    if (block.type === 'reasoning' || block.type === 'thought') {
      if (!isDeepResearch && block.content) {
        const lastPart = parts[parts.length - 1]
        if (lastPart?.type === 'thought') {
          lastPart.content = `${lastPart.content || ''}${block.content || ''}`
          const prevDuration = Number.isFinite(lastPart.durationMs) ? Number(lastPart.durationMs) : 0
          const nextDuration = Number.isFinite(block.durationMs) ? Number(block.durationMs) : 0
          lastPart.durationMs = prevDuration + nextDuration
        } else {
          parts.push({
            type: 'thought',
            key: `stream-thought-${block.seq}`,
            content: block.content,
            durationMs: block.durationMs,
          })
        }
      }
      continue
    }

    if (block.type === 'workflow_text') {
      if (!isDeepResearch && block.content) {
        parts.push({
          type: 'workflow_text',
          key: `stream-workflow-text-${block.seq}`,
          content: block.content,
        })
      }
      continue
    }

    if (block.type === 'search_filter') {
      if (!isDeepResearch) {
        parts.push({
          type: 'search_filter',
          key: `stream-search-filter-${block.id || block.toolCallId || block.seq}`,
          id: block.id || block.toolCallId || null,
          name: block.name || 'search_filter',
          status: block.status || 'running',
          query: block.query || '',
          applied: typeof block.applied === 'boolean' ? block.applied : null,
          originalCount: Number.isFinite(block.originalCount) ? Number(block.originalCount) : null,
          filteredCount: Number.isFinite(block.filteredCount) ? Number(block.filteredCount) : null,
          fallbackReason: block.fallbackReason || null,
          originalResults: Array.isArray(block.originalResults) ? block.originalResults : [],
          filteredResults: Array.isArray(block.filteredResults) ? block.filteredResults : [],
          durationMs: Number.isFinite(block.durationMs) ? Number(block.durationMs) : null,
        })
      }
      continue
    }

    if (block.type === 'tool' || block.type === 'tool_call' || block.type === 'tool_result') {
      const matchedTool =
        toolCallHistory.find(item => item?.id && item.id === block.toolCallId) || null
      const toolItem =
        matchedTool ||
        (block.toolCallId
          ? {
              id: block.toolCallId,
              name: block.name || 'tool',
              status: block.status || 'done',
              arguments: block.arguments,
              output: block.output,
              durationMs: block.durationMs,
            }
          : null)

      if (toolItem) {
        parts.push({
          type: 'tools',
          key: `stream-tool-${block.type || 'tool'}-${block.toolCallId || 'na'}-${block.seq}`,
          items: [toolItem],
        })
      }
    }
  }

  if (!isDeepResearch && parts.length > 1) {
    const firstNonThoughtIndex = parts.findIndex(part => part.type !== 'thought')
    if (firstNonThoughtIndex > 0 && parts[firstNonThoughtIndex]?.type === 'text') {
      const thoughtPrefix = parts
        .slice(0, firstNonThoughtIndex)
        .filter(part => part.type === 'thought')
        .map(part => String(part.content || ''))
        .join('')
      const textPart = String(parts[firstNonThoughtIndex].content || '')
      const compactThought = thoughtPrefix.replace(/\s+/g, '')
      const compactText = textPart.replace(/\s+/g, '')
      if (compactThought && compactText) {
        const minLen = Math.min(compactThought.length, compactText.length)
        if (minLen >= 24) {
          let common = 0
          while (common < minLen && compactThought[common] === compactText[common]) common += 1
          const overlapRatio = common / minLen
          if (overlapRatio >= 0.92) {
            const trimmedText = textPart.trimStart()
            if (trimmedText.startsWith(thoughtPrefix)) {
              const deduped = trimmedText.slice(thoughtPrefix.length).trimStart()
              if (deduped) {
                parts[firstNonThoughtIndex] = { ...parts[firstNonThoughtIndex], content: deduped }
              } else {
                parts.splice(firstNonThoughtIndex, 1)
              }
            } else if (compactText.startsWith(compactThought)) {
              parts.splice(firstNonThoughtIndex, 1)
            }
          }
        }
      }
    }
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: rawContent }]
}

export function getWorkflowThoughtParts(interleavedContent) {
  return (interleavedContent || []).filter(part => part.type === 'thought')
}

export function getWorkflowTextParts(interleavedContent) {
  return (interleavedContent || []).filter(part => part.type === 'workflow_text')
}

export function buildContentPartsOutsideWorkflow({
  interleavedContent,
  isExpertMessage,
  compactStreamingTextBlocks,
  parsePptxPayload,
  parseExcelPayload,
}) {
  const rawParts = []

  for (let i = 0; i < (interleavedContent || []).length; i++) {
    const part = interleavedContent[i]

    if (part.type === 'text') {
      rawParts.push({ type: 'text', key: `text-${i}`, content: part.content })
      continue
    }

    if (part.type === 'tools' && Array.isArray(part.items)) {
      const formItems = part.items.filter(item => item?.name === 'interactive_form')
      const htmlWidgetItems = part.items.filter(item => item?.name === 'render_html_widget')
      const excelItems = part.items.filter(item => item?.name === 'excel_generator')
      const pptxItems = part.items.filter(
        item => item?.name === 'ppt_generator' || item?.name === 'html_to_pptx',
      )
      const regularTools = part.items.filter(
        item =>
          item?.name !== 'interactive_form' &&
          item?.name !== 'form_submission_status' &&
          item?.name !== 'excel_generator' &&
          item?.name !== 'ppt_generator' &&
          item?.name !== 'html_to_pptx',
      )

      if (regularTools.length > 0) {
        let prevToolPart = null
        for (let j = rawParts.length - 1; j >= 0; j--) {
          const rawPart = rawParts[j]
          if (rawPart.type === 'text' && (!rawPart.content || !rawPart.content.trim())) continue
          if (rawPart.type === 'tools') prevToolPart = rawPart
          break
        }

        if (prevToolPart) {
          prevToolPart.items = [...prevToolPart.items, ...regularTools]
        } else {
          rawParts.push({
            type: 'tools',
            key: part.key || `tools-${i}`,
            items: [...regularTools],
          })
        }
      }

      if (formItems.length > 0) {
        rawParts.push({
          type: 'interactive_form',
          key: `${part.key || `interactive-form-${i}`}-form`,
          items: formItems,
        })
      }

      if (htmlWidgetItems.length > 0) {
        rawParts.push({
          type: 'html_widget',
          key: `${part.key || `html-widget-${i}`}-widget`,
          items: htmlWidgetItems,
        })
      }

      if (excelItems.length > 0) {
        rawParts.push({
          type: 'excel_file',
          key: `${part.key || `excel-file-${i}`}-file`,
          items: excelItems,
        })
      }

      if (pptxItems.length > 0) {
        rawParts.push({
          type: 'pptx_file',
          key: `${part.key || `pptx-file-${i}`}-file`,
          items: pptxItems,
        })
      }
    }
  }

  const shouldMergeAdjacentText = isExpertMessage || compactStreamingTextBlocks
  const mergedTextParts = []
  const sourceParts = shouldMergeAdjacentText ? rawParts : rawParts
  for (const part of sourceParts) {
    const prev = mergedTextParts[mergedTextParts.length - 1]
    if (part.type === 'text' && prev?.type === 'text') {
      prev.content = `${prev.content || ''}${part.content || ''}`
      continue
    }
    mergedTextParts.push({ ...part })
  }

  const collapseFileToolParts = (parts, type, parsePayload) => {
    const indexes = parts.map((part, index) => (part.type === type ? index : -1)).filter(index => index >= 0)
    if (indexes.length <= 1) return parts

    let winnerIndex = indexes[indexes.length - 1]
    for (let i = indexes.length - 1; i >= 0; i--) {
      const index = indexes[i]
      const part = parts[index]
      const hasSuccessfulPayload = Array.isArray(part?.items)
        ? part.items.some(item => Boolean(parsePayload(item?.output) || parsePayload(item?.result)))
        : false
      if (hasSuccessfulPayload) {
        winnerIndex = index
        break
      }
    }

    const collapsed = []
    const hiddenRetryCount = indexes.length - 1
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part.type !== type) {
        collapsed.push(part)
        continue
      }
      if (i !== winnerIndex) continue
      collapsed.push({
        ...part,
        retryCountHidden: hiddenRetryCount,
      })
    }
    return collapsed
  }

  const collapsedExcelParts = collapseFileToolParts(mergedTextParts, 'excel_file', parseExcelPayload)

  return collapseFileToolParts(collapsedExcelParts, 'pptx_file', parsePptxPayload)
}
