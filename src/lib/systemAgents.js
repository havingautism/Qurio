import {
  DEEP_RESEARCH_AGENT_DESCRIPTION,
  DEEP_RESEARCH_AGENT_NAME,
  DEEP_RESEARCH_AGENT_PROMPT,
  DEEP_RESEARCH_EMOJI,
  DEEP_RESEARCH_PROFILE,
} from './deepResearchDefaults'

export const DEFAULT_AGENT_ID = '11111111-1111-1111-1111-111111111111'
export const DEEP_RESEARCH_AGENT_ID = '22222222-2222-2222-2222-222222222222'
export const SCRAPBOOK_AGENT_ID = '33333333-3333-3333-3333-333333333333'

export const DEFAULT_AGENT_NAME = 'Default Agent'
export const DEFAULT_AGENT_DESCRIPTION = 'Fallback agent (non-editable).'
export const SCRAPBOOK_AGENT_NAME = 'Scrapbook Agent'
export const SCRAPBOOK_AGENT_DESCRIPTION = 'Hidden system agent for Scrapbook generation settings.'
export const SCRAPBOOK_AGENT_EMOJI = '📒'

export const isDefaultSystemAgent = agent => String(agent?.id || '') === DEFAULT_AGENT_ID
export const isDeepResearchSystemAgent = agent =>
  String(agent?.id || '') === DEEP_RESEARCH_AGENT_ID
export const isScrapbookSystemAgent = agent => String(agent?.id || '') === SCRAPBOOK_AGENT_ID

export const filterVisibleAgents = agents => (agents || []).filter(agent => !agent?.isHidden)

export const annotateSystemAgent = agent => {
  if (!agent) return agent
  const isDefault = isDefaultSystemAgent(agent)
  const isDeepResearch = isDeepResearchSystemAgent(agent)
  const isScrapbook = isScrapbookSystemAgent(agent)
  return {
    ...agent,
    isDefault,
    isDeepResearch,
    isDeepResearchSystem: isDeepResearch,
    isScrapbookSystem: isScrapbook,
  }
}

export const buildDefaultSystemAgentPayload = settings => ({
  id: DEFAULT_AGENT_ID,
  name: DEFAULT_AGENT_NAME,
  description: DEFAULT_AGENT_DESCRIPTION,
  prompt: settings?.systemPrompt || '',
  emoji: '',
  isDefault: true,
  isHidden: false,
  provider: 'gemini',
  defaultModelProvider: 'gemini',
  liteModelProvider: 'gemini',
  liteModel: '',
  defaultModel: '',
  responseLanguage: settings?.llmAnswerLanguage || '',
  baseTone: settings?.baseTone || '',
  traits: settings?.traits || '',
  warmth: settings?.warmth || '',
  enthusiasm: settings?.enthusiasm || '',
  headings: settings?.headings || '',
  emojis: settings?.emojis || '',
  customInstruction: settings?.customInstruction || '',
  temperature: null,
  topP: null,
  frequencyPenalty: null,
  presencePenalty: null,
})

export const buildDeepResearchSystemAgentPayload = settings => ({
  id: DEEP_RESEARCH_AGENT_ID,
  name: DEEP_RESEARCH_AGENT_NAME,
  description: DEEP_RESEARCH_AGENT_DESCRIPTION,
  prompt: DEEP_RESEARCH_AGENT_PROMPT,
  emoji: DEEP_RESEARCH_EMOJI,
  isDefault: false,
  isDeepResearch: true,
  isHidden: false,
  provider: 'gemini',
  defaultModelProvider: 'gemini',
  liteModelProvider: 'gemini',
  liteModel: '',
  defaultModel: '',
  responseLanguage: settings?.llmAnswerLanguage || '',
  baseTone: DEEP_RESEARCH_PROFILE.baseTone,
  traits: DEEP_RESEARCH_PROFILE.traits,
  warmth: DEEP_RESEARCH_PROFILE.warmth,
  enthusiasm: DEEP_RESEARCH_PROFILE.enthusiasm,
  headings: DEEP_RESEARCH_PROFILE.headings,
  emojis: DEEP_RESEARCH_PROFILE.emojis,
  customInstruction: settings?.customInstruction || '',
  temperature: null,
  topP: null,
  frequencyPenalty: null,
  presencePenalty: null,
})

export const buildScrapbookSystemAgentPayload = settings => ({
  id: SCRAPBOOK_AGENT_ID,
  name: SCRAPBOOK_AGENT_NAME,
  description: SCRAPBOOK_AGENT_DESCRIPTION,
  prompt: '',
  emoji: SCRAPBOOK_AGENT_EMOJI,
  isDefault: false,
  isDeepResearch: false,
  isHidden: false,
  provider: settings?.defaultModelProvider || 'gemini',
  defaultModelProvider: settings?.defaultModelProvider || 'gemini',
  liteModelProvider: settings?.liteModelProvider || settings?.defaultModelProvider || 'gemini',
  defaultModelSource: 'list',
  liteModelSource: 'list',
  useGlobalModelSettings: true,
  liteModel: settings?.liteModel || '',
  defaultModel: settings?.defaultModel || '',
  responseLanguage: settings?.llmAnswerLanguage || '',
  baseTone: settings?.baseTone || 'technical',
  traits: settings?.traits || 'default',
  warmth: settings?.warmth || 'default',
  enthusiasm: settings?.enthusiasm || 'default',
  headings: settings?.headings || 'default',
  emojis: settings?.emojis || 'default',
  customInstruction: settings?.customInstruction || '',
  temperature: null,
  topP: null,
  frequencyPenalty: null,
  presencePenalty: null,
})
