import { extractJsonObject, safeJsonParse } from './utils'
import { getModelConfigForAgent } from './modelConfig'
import { getProvider } from '../providers'
import { buildMemoryDomainDecisionPrompt, buildDocumentQueryPrompt } from './prompts'

export const parseDocumentQueryResponse = content => {
  const raw = extractJsonObject(content)
  if (!raw) return content.replace(/^"+|"+$/g, '').trim()
  const parsed = safeJsonParse(raw)
  if (!parsed) return content.replace(/^"+|"+$/g, '').trim()

  try {
    if (typeof parsed?.query === 'string') return parsed.query.trim()
    if (Array.isArray(parsed?.queries)) return parsed.queries.filter(Boolean).join(' ')
  } catch {
    return content.replace(/^"+|"+$/g, '').trim()
  }
  return content.replace(/^"+|"+$/g, '').trim()
}

export const parseMemoryDomainDecisionResponse = content => {
  const raw = extractJsonObject(content)
  if (!raw) return { needMemory: false, hitDomains: [] }
  const parsed = safeJsonParse(raw)
  if (!parsed) return { needMemory: false, hitDomains: [] }

  try {
    const needMemory = Boolean(parsed?.need_memory ?? parsed?.needMemory)
    const hitDomainsRaw = Array.isArray(parsed?.hit_domains ?? parsed?.hitDomains)
      ? (parsed.hit_domains ?? parsed.hitDomains)
      : []
    const hitDomains = hitDomainsRaw.map(item => String(item || '').trim()).filter(Boolean)
    return { needMemory, hitDomains }
  } catch {
    return { needMemory: false, hitDomains: [] }
  }
}

export const fallbackMemoryDecision = (question, domains) => {
  const trimmedQuestion = String(question || '').toLowerCase()
  if (!Array.isArray(domains) || domains.length === 0) {
    return { needMemory: false, hitDomains: [] }
  }
  const usePersonalContext = /(\bmy\b|\bmine\b|\bme\b|\bwe\b|\bi\b|我的|我们|我在|我想)/i.test(
    trimmedQuestion,
  )
  if (!usePersonalContext) {
    return { needMemory: false, hitDomains: [] }
  }

  const matched = domains
    .filter(domain => {
      const key = String(domain?.domain_key || '').toLowerCase()
      const aliases = Array.isArray(domain?.aliases)
        ? domain.aliases.map(item => String(item || '').toLowerCase())
        : []
      const tokens = [key, ...aliases].filter(Boolean)
      return tokens.some(token => token && trimmedQuestion.includes(token))
    })
    .map(domain => String(domain.domain_key || '').trim())
    .filter(Boolean)

  if (matched.length > 0) {
    return { needMemory: true, hitDomains: matched }
  }

  return {
    needMemory: false,
    hitDomains: [],
  }
}

export const selectMemoryDomains = async ({
  question,
  historyForSend,
  domains,
  settings,
  selectedAgent,
  agents,
}) => {
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForQuery = selectedAgent || fallbackAgent
  const modelConfig = getModelConfigForAgent(
    agentForQuery,
    settings,
    'generateMemoryQuery',
    fallbackAgent,
  )
  if (!modelConfig?.model || !modelConfig?.provider) {
    return fallbackMemoryDecision(question, domains)
  }
  const provider = getProvider(modelConfig.provider)
  if (!provider?.streamChatCompletion) {
    return fallbackMemoryDecision(question, domains)
  }
  const credentials = provider.getCredentials(settings)
  if (!credentials?.apiKey) {
    return fallbackMemoryDecision(question, domains)
  }

  const prompt = buildMemoryDomainDecisionPrompt({ question, historyForSend, domains })
  const messages = [
    {
      role: 'system',
      content:
        'You are a precise JSON extractor. Output ONLY valid JSON with DOUBLE QUOTES. Keys: need_memory (boolean), hit_domains (string[]).',
    },
    { role: 'user', content: prompt },
  ]

  let fullContent = ''
  try {
    await provider.streamChatCompletion({
      ...credentials,
      model: modelConfig.model,
      messages,
      temperature: 0.2,
      responseFormat: modelConfig.provider !== 'gemini' ? { type: 'json_object' } : undefined,
      onChunk: chunk => {
        if (typeof chunk === 'object' && chunk?.type === 'text' && chunk.content) {
          fullContent += chunk.content
        } else if (typeof chunk === 'string') {
          fullContent += chunk
        }
      },
      onFinish: result => {
        if (result?.content) fullContent = result.content
      },
    })
  } catch (error) {
    console.error('Lite model memory decision failed:', error)
    return fallbackMemoryDecision(question, domains)
  }

  return parseMemoryDomainDecisionResponse(fullContent)
}

export const selectDocumentQuery = async ({
  question,
  historyForSend,
  documents,
  settings,
  selectedAgent,
  agents,
}) => {
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForQuery = selectedAgent || fallbackAgent
  const modelConfig = getModelConfigForAgent(
    agentForQuery,
    settings,
    'generateDocumentQuery',
    fallbackAgent,
  )
  if (!modelConfig?.model || !modelConfig?.provider) {
    return String(question || '').trim()
  }
  const provider = getProvider(modelConfig.provider)
  if (!provider?.streamChatCompletion) {
    return String(question || '').trim()
  }
  const credentials = provider.getCredentials(settings)
  if (!credentials?.apiKey) {
    return String(question || '').trim()
  }

  const prompt = buildDocumentQueryPrompt({ question, historyForSend, documents })
  const messages = [
    {
      role: 'system',
      content:
        'You are a retrieval query planner. Output only JSON with a "query" string. No markdown.',
    },
    { role: 'user', content: prompt },
  ]

  let fullContent = ''
  try {
    await provider.streamChatCompletion({
      ...credentials,
      model: modelConfig.model,
      messages,
      temperature: 0.2,
      responseFormat: modelConfig.provider !== 'gemini' ? { type: 'json_object' } : undefined,
      onChunk: chunk => {
        if (typeof chunk === 'object' && chunk?.type === 'text' && chunk.content) {
          fullContent += chunk.content
        } else if (typeof chunk === 'string') {
          fullContent += chunk
        }
      },
      onFinish: result => {
        if (result?.content) fullContent = result.content
      },
    })
  } catch (error) {
    console.error('Lite model document query selection failed:', error)
    return String(question || '').trim()
  }

  const resolved = parseDocumentQueryResponse(fullContent)
  return resolved || String(question || '').trim()
}
