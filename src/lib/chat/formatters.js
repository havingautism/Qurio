import { MEMORY_DOMAIN_PROMPT_LIMIT } from './constants'

/**
 * Builds a user message object with proper content structure
 * @param {string} text - The message text
 * @param {Array} attachments - Array of file attachments
 * @returns {Object} User message object with role, content, and timestamp
 */
export const buildUserMessage = (text, attachments, quoteContext, documentContextAppend = '') => {
  const now = new Date().toISOString()
  const quoteText = quoteContext?.text?.trim()

  const buildContentArray = (textValue, includeQuote = false) => {
    const textPart = { type: 'text', text: textValue }
    const parts =
      includeQuote && quoteText ? [{ type: 'quote', text: quoteText }, textPart] : [textPart]
    return attachments.length > 0 ? [...parts, ...attachments] : parts
  }

  // Content used for UI + persistence (keeps quote separate for rendering)
  const displayContent =
    quoteText || attachments.length > 0 ? buildContentArray(text, !!quoteText) : text

  // Content sent to the model (include quote text + original source content if provided)
  const quoteSource = quoteContext?.sourceContent?.trim()
  // const composedQuote = [quoteText, quoteSource].filter(Boolean).join('\n\n')
  const textWithPrefix =
    quoteText && quoteSource && text
      ? `###User quoted these sentences from context:\n${quoteText}\n\n###User question:\n${text}\n\n ###User original context:\n${quoteSource}`
      : text
  const textWithDocumentContext = documentContextAppend
    ? `${textWithPrefix}\n\n${documentContextAppend}`
    : textWithPrefix
  const payloadContent =
    attachments.length > 0
      ? buildContentArray(textWithDocumentContext, false)
      : textWithDocumentContext

  const userMessage = { role: 'user', content: displayContent, created_at: now }

  return { userMessage, payloadContent }
}

export const formatMemoryDomainIndex = domains => {
  if (!Array.isArray(domains) || domains.length === 0) return ''
  // Deduplicate and aggregate aliases for clearer prompt presentation
  const lines = domains.slice(0, MEMORY_DOMAIN_PROMPT_LIMIT).map(domain => {
    const key = String(domain?.domain_key || '').trim()
    if (!key) return null
    const aliases = Array.isArray(domain?.aliases) ? domain.aliases.filter(Boolean) : []
    // Ensure key is treated as an alias too for matching purposes
    const allTags = [...new Set([key, ...aliases])].join(', ')
    const scope = typeof domain?.scope === 'string' ? domain.scope.trim() : ''
    return `ID: ${key} | Tags: [${allTags}] | Scope: ${scope}`
  })
  return lines.filter(Boolean).join('\n')
}

/**
 * Normalizes message content to be safe for provider payloads (strips custom types like quote)
 * while preserving attachments and text.
 */
export const normalizeMessageForSend = message => {
  if (!message) return message
  const content = message.content
  const sanitizedMessage = { ...message }
  if (Array.isArray(content)) {
    const attachments = content.filter(part => part?.type === 'image_url')
    const textValue = content
      .filter(part => part?.type !== 'image_url')
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n\n')

    const normalizedContent =
      attachments.length > 0 ? [{ type: 'text', text: textValue }, ...attachments] : textValue

    sanitizedMessage.content = normalizedContent
  } else {
    sanitizedMessage.content = content
  }

  // Avoid sending tool call history to providers that require paired tool responses.
  if (sanitizedMessage.role === 'ai' || sanitizedMessage.role === 'assistant') {
    delete sanitizedMessage.tool_calls
    delete sanitizedMessage.tool_call_id
  }

  return sanitizedMessage
}
