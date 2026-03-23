import { extractPlainText } from './utils'

const normalizeWhitespace = value =>
  String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const isFormSubmissionText = value => {
  const text = String(value || '').trim()
  return /^\[(?:form submission|form submitted)\]/i.test(text)
}

const extractToolOutputText = tool => {
  if (!tool || typeof tool !== 'object') return ''
  const output = tool?.output
  if (typeof output === 'string') return output.trim()
  if (Array.isArray(output) || (output && typeof output === 'object')) {
    const text = extractPlainText(output).trim()
    if (text) return text
    try {
      return String(output || '').trim()
    } catch {
      return ''
    }
  }
  return ''
}

const extractExpertResponseText = response => {
  if (!response || typeof response !== 'object') return ''

  const directContent = extractPlainText(response?.content).trim()
  if (directContent) return directContent

  const toolHistory = Array.isArray(response?.toolCallHistory) ? response.toolCallHistory : []
  for (let i = toolHistory.length - 1; i >= 0; i -= 1) {
    const tool = toolHistory[i]
    if (String(tool?.name || '') !== 'delegate_task_to_member') continue
    const outputText = extractToolOutputText(tool)
    if (outputText) return outputText
  }

  const thoughtText = extractPlainText(response?.thought).trim()
  if (thoughtText) return thoughtText

  return ''
}

const pickExpertVisibleAnswer = message => {
  const responses = Array.isArray(message?.expertResponses) ? message.expertResponses : []
  if (responses.length === 0) return ''

  const activeAgentId = String(message?.expertActiveAgentId || '').trim()
  const candidates = responses
    .map(response => ({
      response,
      text: extractExpertResponseText(response),
    }))
    .filter(item => item.text)

  if (candidates.length === 0) return ''

  if (activeAgentId) {
    const activeCandidate = candidates.find(
      item => String(item.response?.agentId || '') === activeAgentId,
    )
    if (activeCandidate) return normalizeWhitespace(activeCandidate.text)
  }

  const memberCandidate = candidates.find(
    item => String(item.response?.agentRole || '') === 'member',
  )
  if (memberCandidate) return normalizeWhitespace(memberCandidate.text)

  const doneCandidate = candidates.find(item => String(item.response?.status || '') === 'done')
  if (doneCandidate) return normalizeWhitespace(doneCandidate.text)

  return normalizeWhitespace(candidates[0].text)
}

const looksLikeDelegationPreface = text => {
  const normalized = normalizeWhitespace(text).toLowerCase()
  if (!normalized) return false
  if (normalized.length > 160) return false
  return /委派|派给|为您委派|我将|我会|delegat|expert|专家/.test(normalized)
}

export const resolveTurnSummaryQuestion = ({ messages, fallbackQuestion = '' } = {}) => {
  const fallback = normalizeWhitespace(fallbackQuestion)
  if (fallback) return fallback

  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i]
    if (!msg || (msg.role !== 'user' && msg.role !== 'human')) continue
    const text = normalizeWhitespace(extractPlainText(msg.content))
    if (!text || isFormSubmissionText(text)) continue
    return text
  }
  return ''
}

export const resolveTurnSummaryAnswer = message => {
  if (!message) return ''

  const direct = normalizeWhitespace(extractPlainText(message?.content))
  if (direct && !looksLikeDelegationPreface(direct)) {
    return direct
  }

  if (message?.expertMode && Array.isArray(message?.expertResponses) && message.expertResponses.length) {
    return pickExpertVisibleAnswer(message)
  }

  if (direct) return direct

  return ''
}
