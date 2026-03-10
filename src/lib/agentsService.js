import { getSupabaseClient } from './supabase'
import { annotateSystemAgent, filterVisibleAgents } from './systemAgents'

const table = 'agents'

const toBoolWithDefault = (value, fallback) => {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return fallback
  return Boolean(value)
}

const mapAgent = agent => {
  if (!agent) return agent
  return annotateSystemAgent({
    id: agent.id,
    isDefault: agent.is_default ?? agent.isDefault ?? false,
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    isDeepResearch: agent.is_deep_research ?? agent.isDeepResearch ?? false,
    isHidden: agent.is_hidden ?? agent.isHidden ?? false,
    emoji: agent.emoji,
    avatarType: agent.avatar_type ?? agent.avatarType ?? 'emoji',
    avatarImage: agent.avatar_image ?? agent.avatarImage ?? '',
    avatarShape: agent.avatar_shape ?? agent.avatarShape ?? 'circle',
    bannerMode: agent.banner_mode ?? agent.bannerMode ?? 'none',
    bannerImage: agent.banner_image ?? agent.bannerImage ?? '',
    provider: agent.provider,
    defaultModelProvider: agent.default_model_provider ?? agent.defaultModelProvider ?? '',
    liteModelProvider: agent.lite_model_provider ?? agent.liteModelProvider ?? '',
    defaultModelSource: agent.default_model_source ?? agent.defaultModelSource ?? 'list',
    liteModelSource: agent.lite_model_source ?? agent.liteModelSource ?? 'list',
    useGlobalModelSettings: toBoolWithDefault(
      agent.use_global_model_settings ?? agent.useGlobalModelSettings,
      true,
    ),
    liteModel: agent.lite_model ?? agent.liteModel ?? '',
    defaultModel: agent.default_model ?? agent.defaultModel ?? '',
    responseLanguage: agent.response_language ?? agent.responseLanguage ?? '',
    baseTone: agent.base_tone ?? agent.baseTone ?? '',
    traits: agent.traits ?? '',
    warmth: agent.warmth ?? '',
    enthusiasm: agent.enthusiasm ?? '',
    headings: agent.headings ?? '',
    emojis: agent.emojis ?? '',
    customInstruction: agent.custom_instruction ?? agent.customInstruction ?? '',
    temperature: agent.temperature ?? null,
    topP: agent.top_p ?? agent.topP ?? null,
    frequencyPenalty: agent.frequency_penalty ?? agent.frequencyPenalty ?? null,
    presencePenalty: agent.presence_penalty ?? agent.presencePenalty ?? null,
    toolIds: agent.tool_ids ?? agent.toolIds ?? [],
    skillIds: agent.skill_ids ?? agent.skillIds ?? [],
    createdAt: agent.created_at ?? agent.createdAt ?? null,
    updatedAt: agent.updated_at ?? agent.updatedAt ?? null,
  })
}

export const listAgents = async ({ includeHidden = false } = {}) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: true })

  const mapped = (data || []).map(mapAgent)
  return { data: includeHidden ? mapped : filterVisibleAgents(mapped), error }
}

export const getAgentById = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!id) return { data: null, error: new Error('Agent id is required') }

  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
  return { data: mapAgent(data), error }
}

export const createAgent = async ({
  id,
  name,
  description = '',
  prompt = '',
  isDeepResearch = false,
  emoji = '',
  avatarType = 'emoji',
  avatarImage = '',
  avatarShape = 'circle',
  bannerMode = 'none',
  bannerImage = '',
  isDefault = false,
  isHidden = false,
  provider = '',
  defaultModelProvider = '',
  liteModelProvider = '',
  defaultModelSource = 'list',
  liteModelSource = 'list',
  useGlobalModelSettings = true,
  liteModel = '',
  defaultModel = '',
  responseLanguage = '',
  baseTone = '',
  traits = '',
  warmth = '',
  enthusiasm = '',
  headings = '',
  emojis = '',
  customInstruction = '',
  temperature = null,
  topP = null,
  frequencyPenalty = null,
  presencePenalty = null,
  toolIds = [],
  skillIds = [],
}) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!name) return { data: null, error: new Error('Name is required') }

  const payload = {
    ...(id ? { id } : {}),
    name,
    description,
    prompt,
    is_deep_research: isDeepResearch,
    emoji,
    avatar_type: avatarType,
    avatar_image: avatarImage,
    avatar_shape: avatarShape,
    banner_mode: bannerMode,
    banner_image: bannerImage,
    is_default: isDefault,
    is_hidden: isHidden,
    provider,
    default_model_provider: defaultModelProvider,
    lite_model_provider: liteModelProvider,
    default_model_source: defaultModelSource,
    lite_model_source: liteModelSource,
    use_global_model_settings: useGlobalModelSettings,
    lite_model: liteModel,
    default_model: defaultModel,
    response_language: responseLanguage,
    base_tone: baseTone,
    traits,
    warmth,
    enthusiasm,
    headings,
    emojis,
    custom_instruction: customInstruction,
    temperature,
    top_p: topP,
    frequency_penalty: frequencyPenalty,
    presence_penalty: presencePenalty,
    tool_ids: toolIds,
    skill_ids: skillIds,
  }

  const { data, error } = await supabase.from(table).insert([payload]).select().single()

  return { data: mapAgent(data), error }
}

export const updateAgent = async (id, payload) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!id) return { data: null, error: new Error('Agent id is required') }

  const updatePayload = {}
  if (payload.name !== undefined) updatePayload.name = payload.name
  if (payload.description !== undefined) updatePayload.description = payload.description
  if (payload.prompt !== undefined) updatePayload.prompt = payload.prompt
  if (payload.isDeepResearch !== undefined) updatePayload.is_deep_research = payload.isDeepResearch
  if (payload.emoji !== undefined) updatePayload.emoji = payload.emoji
  if (payload.avatarType !== undefined) updatePayload.avatar_type = payload.avatarType
  if (payload.avatarImage !== undefined) updatePayload.avatar_image = payload.avatarImage
  if (payload.avatarShape !== undefined) updatePayload.avatar_shape = payload.avatarShape
  if (payload.bannerMode !== undefined) updatePayload.banner_mode = payload.bannerMode
  if (payload.bannerImage !== undefined) updatePayload.banner_image = payload.bannerImage
  if (payload.provider !== undefined) updatePayload.provider = payload.provider
  if (payload.defaultModelProvider !== undefined)
    updatePayload.default_model_provider = payload.defaultModelProvider
  if (payload.liteModelProvider !== undefined)
    updatePayload.lite_model_provider = payload.liteModelProvider
  if (payload.defaultModelSource !== undefined)
    updatePayload.default_model_source = payload.defaultModelSource
  if (payload.liteModelSource !== undefined)
    updatePayload.lite_model_source = payload.liteModelSource
  if (payload.useGlobalModelSettings !== undefined)
    updatePayload.use_global_model_settings = payload.useGlobalModelSettings
  if (payload.liteModel !== undefined) updatePayload.lite_model = payload.liteModel
  if (payload.defaultModel !== undefined) updatePayload.default_model = payload.defaultModel
  if (payload.responseLanguage !== undefined)
    updatePayload.response_language = payload.responseLanguage
  if (payload.baseTone !== undefined) updatePayload.base_tone = payload.baseTone
  if (payload.traits !== undefined) updatePayload.traits = payload.traits
  if (payload.warmth !== undefined) updatePayload.warmth = payload.warmth
  if (payload.enthusiasm !== undefined) updatePayload.enthusiasm = payload.enthusiasm
  if (payload.headings !== undefined) updatePayload.headings = payload.headings
  if (payload.emojis !== undefined) updatePayload.emojis = payload.emojis
  if (payload.customInstruction !== undefined)
    updatePayload.custom_instruction = payload.customInstruction
  if (payload.isDefault !== undefined) updatePayload.is_default = payload.isDefault
  if (payload.isHidden !== undefined) updatePayload.is_hidden = payload.isHidden
  if (payload.temperature !== undefined) updatePayload.temperature = payload.temperature
  if (payload.topP !== undefined) updatePayload.top_p = payload.topP
  if (payload.frequencyPenalty !== undefined)
    updatePayload.frequency_penalty = payload.frequencyPenalty
  if (payload.presencePenalty !== undefined)
    updatePayload.presence_penalty = payload.presencePenalty
  if (payload.toolIds !== undefined) updatePayload.tool_ids = payload.toolIds
  if (payload.skillIds !== undefined) updatePayload.skill_ids = payload.skillIds

  const { data, error } = await supabase
    .from(table)
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  return { data: mapAgent(data), error }
}

export const deleteAgent = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!id) return { success: false, error: new Error('Agent id is required') }

  const { error } = await supabase.from(table).delete().eq('id', id)
  return { success: !error, error }
}
