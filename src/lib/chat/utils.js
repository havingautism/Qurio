/**
 * Validates user input before sending a message
 * @param {string} text - The message text
 * @param {Array} attachments - Array of file attachments
 * @param {boolean} isLoading - Whether another operation is in progress
 * @returns {Object} Validation result with isValid flag and optional reason
 */
export const validateInput = (text, attachments, isLoading) => {
  // Check if input is valid (text is required)
  if (!text.trim()) {
    return { isValid: false, reason: 'empty_input' }
  }

  // Check if another operation is already in progress
  if (isLoading) {
    return { isValid: false, reason: 'already_loading' }
  }

  return { isValid: true }
}

export const extractJsonObject = content => {
  const str = String(content || '').trim()
  const start = str.indexOf('{')
  const end = str.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return str.substring(start, end + 1)
  }
  return ''
}

export const safeJsonParse = str => {
  let cleaned = String(str || '').trim()
  if (!cleaned) return null

  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // If it fails, it might be using single quotes (common in some Lite models)
    try {
      // Heuristic: swap single quotes with double quotes
      // and handle common issues like trailing commas
      // Note: This is a simple heuristic and might fail on nested content with single quotes
      const normalized = cleaned
        .replace(/'/g, '"')
        .replace(/,\s*([\]}])/g, '$1') // remove trailing commas
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/None/g, 'null')
      return JSON.parse(normalized)
    } catch (e2) {
      console.warn('[Chat] Final JSON parse attempt failed:', e2)
      return null
    }
  }
}

export const extractPlainText = content => {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && part.text) return part.text
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content?.text) return String(content.text)
  return String(content)
}

export const normalizeDomainKey = value =>
  String(value || '')
    .trim()
    .toLowerCase()

export const sanitizeJson = value => {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    if (typeof value === 'string') return value
    try {
      return String(value)
    } catch (stringError) {
      return null
    }
  }
}

export const mapInterfaceLanguageToAnswerLanguage = language => {
  const normalized = String(language || '').toLowerCase()
  if (!normalized) return ''
  if (normalized.startsWith('zh')) return 'Chinese (Simplified)'
  if (normalized.startsWith('en')) return 'English'
  if (normalized.startsWith('ja')) return 'Japanese'
  if (normalized.startsWith('ko')) return 'Korean'
  if (normalized.startsWith('es')) return 'Spanish'
  if (normalized.startsWith('fr')) return 'French'
  if (normalized.startsWith('de')) return 'German'
  if (normalized.startsWith('pt')) return 'Portuguese'
  if (normalized.startsWith('it')) return 'Italian'
  return ''
}
