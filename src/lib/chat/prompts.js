import { QUERY_CONTEXT_MAX_CHARS, QUERY_HISTORY_MAX_MESSAGES } from './constants'
import { extractPlainText, mapInterfaceLanguageToAnswerLanguage } from './utils'
import { formatMemoryDomainIndex } from './formatters'
import { buildResponseStylePromptFromAgent } from '../settings'

export const buildDocumentQueryPrompt = ({ question, historyForSend, documents }) => {
  const docTitles = (documents || [])
    .map(doc => (typeof doc?.name === 'string' ? doc.name.trim() : ''))
    .filter(Boolean)
  const recentHistory = (historyForSend || [])
    .slice(-QUERY_HISTORY_MAX_MESSAGES)
    .map(msg => {
      const role = msg.role === 'ai' ? 'assistant' : msg.role
      const text = extractPlainText(msg.content)
      return `${role}: ${text}`.trim()
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, QUERY_CONTEXT_MAX_CHARS)

  const docSection = docTitles.length ? `Selected documents:\n- ${docTitles.join('\n- ')}` : ''
  const historySection = recentHistory ? `Recent conversation:\n${recentHistory}` : ''

  return [
    `You generate a single concise vector search query for document retrieval.`,
    `Use the same language as the user's question.`,
    `If no document retrieval is needed, return an empty string for "query".`,
    `Return JSON only: {"query": string}.`,
    '',
    `User question:\n${question}`,
    historySection,
    docSection,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const buildMemoryDomainDecisionPrompt = ({ question, historyForSend, domains }) => {
  const recentHistory = (historyForSend || [])
    .slice(-QUERY_HISTORY_MAX_MESSAGES)
    .map(msg => {
      const role = msg.role === 'ai' ? 'assistant' : msg.role
      const text = extractPlainText(msg.content)
      return `${role}: ${text}`.trim()
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, QUERY_CONTEXT_MAX_CHARS)

  const domainIndex = formatMemoryDomainIndex(domains)

  return [
    `Role: You are a semantic tag matcher.`,
    `Task: Analyze the User Question and determine if it relates to any of the available Memory IDs based on their Tags and Scope.`,
    `Reflect: Does the user's input imply a need to retrieve context about these specific topics?`,
    `Return JSON only: {"need_memory": boolean, "hit_domains": string[]}`,
    `- need_memory: true if ANY tag matches semantically.`,
    `- hit_domains: list of matched IDs (exact string match from list).`,
    '',
    `Available Memory IDs & Tags:\n${domainIndex}`,
    '',
    `User Question:\n${question}`,
    recentHistory ? `Recent Conversation:\n${recentHistory}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const buildAgentPrompt = (agent, settings) => {
  if (!agent) return ''

  const parts = []

  // 1. Agent's base prompt
  const agentPrompt = typeof agent.prompt === 'string' ? agent.prompt.trim() : ''
  if (agentPrompt) {
    parts.push(`## Agent Prompt\n${agentPrompt}`)
  }

  // 2. Personalization settings (agent only)
  const stylePrompt = buildResponseStylePromptFromAgent(agent)
  if (stylePrompt) {
    parts.push(stylePrompt)
  }

  // 3. Language instruction (agent only)
  const languageInstruction = getLanguageInstruction(agent, settings)
  if (languageInstruction) parts.push(`## Language\n${languageInstruction}`)

  return parts.filter(Boolean).join('\n\n')
}

export const getLanguageInstruction = (agent, settings) => {
  if (settings?.followInterfaceLanguage) {
    const mapped = mapInterfaceLanguageToAnswerLanguage(settings.interfaceLanguage)
    return mapped ? `Reply in ${mapped}.` : ''
  }
  const trimmedLanguage =
    typeof (agent?.response_language || agent?.responseLanguage) === 'string'
      ? (agent.response_language || agent.responseLanguage).trim()
      : ''
  return trimmedLanguage ? `Reply in ${trimmedLanguage}.` : ''
}

export const applyLanguageInstructionToText = (text, instruction) => {
  if (!instruction) return text
  const baseText = typeof text === 'string' ? text.trim() : ''
  return baseText ? `${baseText}\n\n${instruction}` : instruction
}

export const buildConversationMessages = (
  historyForSend,
  userMessageForSend,
  selectedAgent,
  settings,
) => {
  const resolvedPrompt = buildAgentPrompt(selectedAgent, settings)
  const conversationMessagesBase = [
    ...(resolvedPrompt ? [{ role: 'system', content: resolvedPrompt }] : []),
    ...historyForSend,
  ]
  return [...conversationMessagesBase, userMessageForSend]
}
