import { resolveProviderConfigWithCredentials } from './modelConfig'
import { getLanguageInstruction, applyLanguageInstructionToText } from './prompts'
import { listSpaceAgents } from '../spacesService'

/**
 * Builds a list of available agents for each space
 * Used for AI auto-selection of space and agent
 */
export const buildSpaceAgentOptions = async (spaces, agents) => {
  if (!Array.isArray(spaces) || spaces.length === 0) return []
  const agentMap = new Map((agents || []).map(agent => [String(agent.id), agent]))
  const results = await Promise.all(
    spaces.map(async space => {
      if (!space?.id) return null
      try {
        const { data } = await listSpaceAgents(space.id)
        const seen = new Set()
        const agentEntries = (data || [])
          .map(item => agentMap.get(String(item.agent_id)))
          .filter(Boolean)
          .filter(agent => {
            const key = String(agent.id)
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map(agent => ({
            name: agent.name,
            description: typeof agent.description === 'string' ? agent.description.trim() : '',
          }))
        return {
          label: space.label,
          description: typeof space.description === 'string' ? space.description.trim() : '',
          agents: agentEntries,
        }
      } catch (error) {
        console.error('Failed to load space agents:', error)
        return {
          label: space.label,
          description: typeof space.description === 'string' ? space.description.trim() : '',
          agents: [],
        }
      }
    }),
  )
  return results.filter(Boolean)
}

/**
 * Resolves an agent name returned by AI to a real agent object within a specific space
 */
export const resolveAgentForSpace = (agentName, space, spaceAgents, agents) => {
  if (!space) return null
  const spaceEntry = (spaceAgents || []).find(item => {
    return item.label === space.label
  })
  if (!agentName) return null
  const normalizedName =
    typeof agentName === 'string' ? agentName.split(' - ')[0].trim() : agentName
  const allowedNames = new Set((spaceEntry?.agents || []).map(agent => agent.name).filter(Boolean))
  if (!allowedNames.has(normalizedName)) return null
  const lowerName = normalizedName.toLowerCase()
  return (agents || []).find(agent => (agent.name || '').trim().toLowerCase() === lowerName) || null
}

export const getSpaceDefaultAgent = async (space, agents) => {
  if (!space?.id) return null
  try {
    const { data } = await listSpaceAgents(space.id)
    const primaryAgentId = data?.find(item => item.is_primary)?.agent_id || null
    if (!primaryAgentId) return null
    return (agents || []).find(agent => String(agent.id) === String(primaryAgentId)) || null
  } catch (error) {
    console.error('Failed to get space default agent:', error)
    return null
  }
}

export const resolveFallbackAgent = async (space, agents) => {
  const spaceDefault = await getSpaceDefaultAgent(space, agents)
  if (spaceDefault) return spaceDefault
  return (agents || []).find(agent => agent.isDefault) || null
}

/**
 * Preselects title, space, and agent for auto mode before the first request.
 * Uses AI to intelligently select the most appropriate title, space, and agent based on the user's message.
 * @param {string} firstMessage - Raw user text
 * @param {Object} settings - User settings and API configuration
 * @param {Array} spaces - Available spaces for auto-selection
 * @param {Array} agents - Available agents for auto-selection
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @returns {Promise<{ title: string, space: Object|null, agent: Object|null, emojis: string[] }>}
 */
export const preselectTitleSpaceAndAgentForAuto = async (
  firstMessage,
  settings,
  spaces,
  agents,
  selectedAgent = null,
) => {
  // Use selected agent if available, otherwise use global default agent for preselection
  // Global default agent always exists (cannot be deleted)
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForPreselection = selectedAgent || fallbackAgent
  const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
    agentForPreselection,
    settings,
    'generateTitleAndSpace',
    fallbackAgent,
  )
  const languageInstruction = getLanguageInstruction(agentForPreselection, settings)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  const spaceAgents = await buildSpaceAgentOptions(spaces, agents)
  if (spaceAgents.length && provider.generateTitleSpaceAndAgent) {
    const { title, spaceLabel, agentName, emojis } = await provider.generateTitleSpaceAndAgent(
      promptText,
      spaceAgents,
      credentials.apiKey,
      credentials.baseUrl,
      modelConfig.model,
    )
    const normalizedSpaceLabel =
      typeof spaceLabel === 'string' ? spaceLabel.split(' - ')[0].trim() : spaceLabel
    const selectedSpace = (spaces || []).find(s => s.label === normalizedSpaceLabel) || null
    const agentCandidate =
      selectedSpace && agentName
        ? resolveAgentForSpace(agentName, selectedSpace, spaceAgents, agents)
        : null
    return { title, space: selectedSpace, agent: agentCandidate, emojis: emojis || [] }
  }

  const { title, space, emojis } = await provider.generateTitleAndSpace(
    promptText,
    spaces || [],
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
  )
  return { title, space: space || null, agent: null, emojis: emojis || [] }
}

/**
 * Preselects a title for manual space before the first request.
 * @param {string} firstMessage - Raw user text
 * @param {Object} settings - User settings and API configuration
 * @param {Object} selectedAgent - Currently selected agent (optional)
 * @returns {Promise<{title: string, emojis: string[]}>}
 */
export const preselectTitleForManual = async (
  firstMessage,
  settings,
  selectedAgent = null,
  agents = [],
) => {
  // Use selected agent if available, otherwise use global default agent for title generation
  // Global default agent always exists (cannot be deleted)
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForTitle = selectedAgent || fallbackAgent
  const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
    agentForTitle,
    settings,
    'generateTitle',
    fallbackAgent,
  )
  const languageInstruction = getLanguageInstruction(agentForTitle, settings)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  const result = await provider.generateTitle(
    promptText,
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
  )
  return {
    title: result?.title || 'New Conversation',
    emojis: Array.isArray(result?.emojis) ? result.emojis : [],
  }
}

export const normalizeDeepResearchTitle = (title, settings) => {
  const raw = typeof title === 'string' ? title.trim() : ''
  const cleaned = raw.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
  const languageHint = String(settings?.llmAnswerLanguage || '').toLowerCase()
  const isChinese =
    settings?.interfaceLanguage === 'zh' ||
    languageHint.includes('chinese') ||
    languageHint.includes('中文') ||
    /[\u4e00-\u9fff]/.test(cleaned)

  if (!cleaned) {
    return isChinese ? '深入研究报告' : 'Deep Research Report'
  }

  if (isChinese) {
    return cleaned.endsWith('报告') ? cleaned : `${cleaned}报告`
  }

  return /report$/i.test(cleaned) ? cleaned : `${cleaned} Report`
}

export const preselectTitleForDeepResearch = async (
  firstMessage,
  settings,
  selectedAgent = null,
  agents = [],
) => {
  const fallbackAgent = agents?.find(agent => agent.isDefault)
  const agentForTitle = selectedAgent || fallbackAgent
  const { modelConfig, provider, credentials } = resolveProviderConfigWithCredentials(
    agentForTitle,
    settings,
    'generateTitle',
    fallbackAgent,
  )
  const languageInstruction = getLanguageInstruction(agentForTitle, settings)
  const promptText = applyLanguageInstructionToText(firstMessage, languageInstruction)
  const result = await provider.generateTitle(
    promptText,
    credentials.apiKey,
    credentials.baseUrl,
    modelConfig.model,
  )
  return {
    title: normalizeDeepResearchTitle(result?.title || '', settings),
    emojis: Array.isArray(result?.emojis) ? result.emojis : [],
  }
}
