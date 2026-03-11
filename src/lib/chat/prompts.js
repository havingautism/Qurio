import { QUERY_CONTEXT_MAX_CHARS, QUERY_HISTORY_MAX_MESSAGES } from './constants'
import { extractPlainText, mapInterfaceLanguageToAnswerLanguage } from './utils'
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
    `You generate one high-precision retrieval query for searching inside the selected documents.`,
    `Use the same language as the user's question.`,
    `Preserve the user's intent type when useful: definition, explanation, comparison, cause, steps, precautions, examples, parameters, or troubleshooting.`,
    `Prefer a short natural-language search query, not a bag of tags.`,
    `Keep the query focused: usually 4 to 12 meaningful words.`,
    `Do not add generic filler such as "best practices", "overview", or "introduction" unless the user explicitly asks for them.`,
    `Include concrete domain terms, aliases, abbreviations, and key nouns from the question when they improve retrieval.`,
    `If the user asks a direct "what is/什么是" question, keep that definition intent in the query.`,
    `If no document retrieval is needed, return an empty string for "query".`,
    `Bad example: {"query":"Java代码 编码 注意事项 最佳实践 规范"}`,
    `Good example: {"query":"Java代码编写时的注意事项和编码规范"}`,
    `Bad example: {"query":"JVM Java虚拟机"}`,
    `Good example: {"query":"什么是JVM Java虚拟机的定义和作用"}`,
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

  const domainObjects = (domains || [])
    .slice(0, 80)
    .map(domain => ({
      domain_key: String(domain?.domain_key || '').trim(),
      aliases: Array.isArray(domain?.aliases)
        ? domain.aliases.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      scope: typeof domain?.scope === 'string' ? domain.scope.trim() : '',
    }))
    .filter(item => item.domain_key)
  const domainJson = JSON.stringify(domainObjects, null, 2)

  return [
    `Role: You are a semantic tag matcher.`,
    `Task: Analyze the User Question and determine if it relates to any available memory domains based on domain_key, aliases, and scope.`,
    `Reflect: Does the user's input imply a need to retrieve context about these specific topics?`,
    `Return JSON only: {"need_memory": boolean, "hit_domains": string[]}`,
    `- need_memory: true if ANY domain is semantically relevant.`,
    `- hit_domains: list of matched domain_key values (exact string match from provided domains).`,
    '',
    `Available Domains (JSON Array):\n${domainJson}`,
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
