/**
 * Utility functions for message processing and formatting
 */

import { TOOL_BOUNDARY_CHARS, TOOL_PUNCTUATION_CHARS, MAX_FORWARD_SEARCH_DISTANCE } from './messageConstants.js'

/**
 * Check if a character is an ASCII word character (letter or digit)
 * @param {string} char - Character to check
 * @returns {boolean} True if character is alphanumeric
 */
export function isAsciiWordChar(char) {
  return /[A-Za-z0-9]/.test(char)
}

/**
 * Normalize tool index to avoid splitting words
 * Adjusts the index to land on word boundaries when possible
 * @param {string} content - The content to search within
 * @param {number} index - The target index to normalize
 * @returns {number} Normalized index
 */
export function normalizeToolIndex(content, index) {
  if (!content) return 0

  const clamped = Math.max(0, Math.min(index, content.length))

  if (clamped === 0 || clamped === content.length) return clamped

  const prev = content[clamped - 1]
  const next = content[clamped]

  // If we're already at a boundary, return as-is
  if (!isAsciiWordChar(prev) || !isAsciiWordChar(next)) return clamped

  // Search forward for a boundary character
  for (let i = clamped; i < content.length && i < clamped + MAX_FORWARD_SEARCH_DISTANCE; i += 1) {
    const ch = content[i]
    if (TOOL_BOUNDARY_CHARS.has(ch)) {
      // Add 1 for punctuation to include it in the split
      const adjusted = i + (TOOL_PUNCTUATION_CHARS.has(ch) ? 1 : 0)
      return Math.min(adjusted, content.length)
    }
  }

  return clamped
}

/**
 * Format JSON value for display
 * Handles both string and object inputs, with error handling
 * @param {*} value - Value to format
 * @returns {string} Formatted JSON string
 */
export function formatJsonForDisplay(value) {
  if (value == null) return ''

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Parse form payload from various formats
 * Handles object, string (JSON), and returns null for invalid inputs
 * @param {*} raw - Raw form payload
 * @returns {object|null} Parsed form object or null
 */
export function parseFormPayload(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Copy text to clipboard with fallback for older browsers
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    console.log('Text copied to clipboard')
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

/**
 * Check if a node is within the answer scope
 * @param {Node} node - Node to check
 * @returns {boolean} True if node is in answer scope
 */
export function isNodeInAnswerScope(node) {
  if (!node) return false
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  return Boolean(element?.closest?.('[data-answer-scope="true"]'))
}

/**
 * Get tool calls for a specific step number
 * @param {Array} toolCallHistory - Array of tool call objects
 * @param {number} stepNumber - Step number to filter by
 * @returns {Array} Filtered tool calls
 */
export function getToolCallsForStep(toolCallHistory, stepNumber) {
  return toolCallHistory.filter(item => (typeof item.step === 'number' ? item.step === stepNumber : false))
}

/**
 * Create interleaved content parts from tool call history
 * Splits content into text and tool sections based on tool indices
 * @param {string} content - Main content text
 * @param {Array} toolCallHistory - Array of tool call objects
 * @param {boolean} isDeepResearch - Whether this is deep research mode
 * @returns {Array} Array of parts with type ('text' or 'tools')
 */
export function createInterleavedContent(content, toolCallHistory, isDeepResearch) {
  if (isDeepResearch || !toolCallHistory.length) {
    return [{ type: 'text', content: content || '' }]
  }

  const parts = []
  let lastIndex = 0
  const rawContent = content || ''

  // Group tools by index
  const toolsByIndex = {}
  toolCallHistory.forEach(tool => {
    // Use textIndex if available
    // If missing: default interactive_form to end, others to start
    const rawIndex = tool.textIndex ?? (tool.name === 'interactive_form' ? rawContent.length : 0)
    const idx = normalizeToolIndex(rawContent, rawIndex)
    if (!toolsByIndex[idx]) toolsByIndex[idx] = []
    toolsByIndex[idx].push(tool)
  })

  // Get all unique indices
  const indices = Object.keys(toolsByIndex)
    .map(Number)
    .sort((a, b) => a - b)

  indices.forEach(index => {
    const safeIndex = Math.min(index, rawContent.length)
    if (safeIndex > lastIndex) {
      parts.push({
        type: 'text',
        content: rawContent.substring(lastIndex, safeIndex),
      })
    }
    parts.push({ type: 'tools', items: toolsByIndex[index] })
    lastIndex = Math.max(lastIndex, safeIndex)
  })

  if (lastIndex < rawContent.length) {
    parts.push({ type: 'text', content: rawContent.substring(lastIndex) })
  }

  return parts
}

/**
 * Check if message content has main text
 * @param {*} content - Message content to check
 * @returns {boolean} True if content has main text
 */
export function hasMainTextContent(content) {
  if (typeof content === 'string') return content.trim().length > 0

  if (Array.isArray(content)) {
    return content.some(part => {
      if (typeof part === 'string') return part.trim().length > 0
      if (part?.type === 'text' && typeof part.text === 'string') {
        return part.text.trim().length > 0
      }
      if (part?.text != null) return String(part.text).trim().length > 0
      return false
    })
  }

  if (content && typeof content === 'object' && Array.isArray(content.parts)) {
    return content.parts.some(part =>
      typeof part === 'string'
        ? part.trim().length > 0
        : String(part?.text || '').trim().length > 0,
    )
  }

  return false
}

/**
 * Calculate menu position to avoid viewport edges
 * @param {Rect} selectionRect - Selection rectangle
 * @param {boolean} isMobile - Whether device is mobile
 * @param {object} positioning - Positioning constants
 * @returns {object} {x, y} coordinates
 */
export function calculateMenuPosition(selectionRect, isMobile, positioning) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const {
    mobileWidth,
    desktopWidth,
    mobileHeight,
    desktopHeight,
    mobileTopOffset,
    desktopTopOffset,
    edgePadding,
  } = positioning

  const menuWidth = isMobile ? mobileWidth : desktopWidth
  const menuHeight = isMobile ? mobileHeight : desktopHeight
  const menuTopOffset = isMobile ? mobileTopOffset : desktopTopOffset

  // Center the menu horizontally on the selection
  let x = selectionRect.left + selectionRect.width / 2

  // For desktop: Position above the selection
  let y = selectionRect.top - menuTopOffset

  // For mobile, always place below selection to avoid covering selected text
  if (isMobile) {
    y = selectionRect.bottom + menuTopOffset
  }

  // Ensure menu stays within viewport bounds horizontally
  const menuLeft = x - menuWidth / 2
  const menuRight = x + menuWidth / 2

  if (menuLeft < edgePadding) {
    x = edgePadding + menuWidth / 2
  } else if (menuRight > viewportWidth - edgePadding) {
    x = viewportWidth - edgePadding - menuWidth / 2
  }

  // For desktop: Ensure menu stays within viewport bounds vertically
  if (!isMobile) {
    const actualMenuTop = y - menuHeight
    const actualMenuBottom = y

    if (actualMenuTop < edgePadding) {
      y = selectionRect.bottom + menuTopOffset
    } else if (actualMenuBottom > viewportHeight - edgePadding) {
      y = selectionRect.top - menuTopOffset
    }
  } else {
    // For mobile: Ensure menu stays within viewport bounds vertically
    const menuBottom = y + menuHeight
    if (menuBottom > viewportHeight - edgePadding) {
      y = selectionRect.top - menuTopOffset - menuHeight
    }
  }

  return { x, y }
}
