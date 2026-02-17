const looksLikeMarkdownLine = line =>
  /^[-*#>`]/.test(line) || /^\d+\./.test(line) || line.includes('|') || line.includes('```')

export const normalizeExpertBrokenTokenLines = input => {
  if (typeof input !== 'string') return ''
  const text = input.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const nonEmpty = lines.map(line => line.trim()).filter(Boolean)

  if (nonEmpty.length < 10) return text
  if (nonEmpty.some(looksLikeMarkdownLine)) return text

  const shortLineRatio =
    nonEmpty.filter(line => line.length <= 20 && line.split(/\s+/).filter(Boolean).length <= 3)
      .length / nonEmpty.length
  if (shortLineRatio < 0.7) return text

  return text
    .replace(/\n{3,}/g, '\n\n')
    .split('\n\n')
    .map(paragraph =>
      paragraph
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join('\n\n')
}

export const isLikelyExpertPlanPayload = input => {
  const raw = String(input || '').trim()
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw)
    return Boolean(parsed && typeof parsed === 'object' && parsed.expertPlan)
  } catch {
    return raw.includes('"expertPlan"')
  }
}

// Thinking content is internal trace text; we can normalize more aggressively than final answer text.
export const normalizeExpertThinkingLines = input => {
  if (typeof input !== 'string') return ''
  const text = input.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const nonEmpty = lines.map(line => line.trim()).filter(Boolean)
  if (nonEmpty.length < 4) return text

  const looksMarkdown = nonEmpty.some(looksLikeMarkdownLine)
  if (looksMarkdown) return text

  const shortLineRatio =
    nonEmpty.filter(line => line.length <= 24 && line.split(/\s+/).filter(Boolean).length <= 3)
      .length / nonEmpty.length
  if (shortLineRatio < 0.55) return text

  return nonEmpty.join(' ')
}

// Final guard for expert thinking display: collapse all whitespace into a single space.
export const normalizeExpertThinkingForDisplay = input => {
  if (typeof input !== 'string') return ''
  return input.replace(/\r\n/g, '\n').split(/\s+/).filter(Boolean).join(' ').trim()
}
