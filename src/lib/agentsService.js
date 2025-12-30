import { getSupabaseClient } from './supabase'

const table = 'agents'

const mapAgent = agent => {
  if (!agent) return agent
  return {
    id: agent.id,
    isDefault: agent.is_default ?? agent.isDefault ?? false,
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    isDeepResearch: agent.is_deep_research ?? agent.isDeepResearch ?? false,
    emoji: agent.emoji,
    provider: agent.provider,
    defaultModelSource: agent.default_model_source ?? agent.defaultModelSource ?? 'list',
    liteModelSource: agent.lite_model_source ?? agent.liteModelSource ?? 'list',
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
    createdAt: agent.created_at ?? agent.createdAt ?? null,
    updatedAt: agent.updated_at ?? agent.updatedAt ?? null,
  }
}

export const listAgents = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: true })

  return { data: (data || []).map(mapAgent), error }
}

export const createAgent = async ({
  name,
  description = '',
  prompt = '',
  isDeepResearch = false,
  emoji = '',
  isDefault = false,
  provider = '',
  defaultModelSource = 'list',
  liteModelSource = 'list',
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
}) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!name) return { data: null, error: new Error('Name is required') }

  const payload = {
    name,
    description,
    prompt,
    is_deep_research: isDeepResearch,
    emoji,
    is_default: isDefault,
    provider,
    default_model_source: defaultModelSource,
    lite_model_source: liteModelSource,
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
  if (payload.isDeepResearch !== undefined)
    updatePayload.is_deep_research = payload.isDeepResearch
  if (payload.emoji !== undefined) updatePayload.emoji = payload.emoji
  if (payload.provider !== undefined) updatePayload.provider = payload.provider
  if (payload.defaultModelSource !== undefined)
    updatePayload.default_model_source = payload.defaultModelSource
  if (payload.liteModelSource !== undefined)
    updatePayload.lite_model_source = payload.liteModelSource
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
  if (payload.temperature !== undefined) updatePayload.temperature = payload.temperature
  if (payload.topP !== undefined) updatePayload.top_p = payload.topP
  if (payload.frequencyPenalty !== undefined)
    updatePayload.frequency_penalty = payload.frequencyPenalty
  if (payload.presencePenalty !== undefined)
    updatePayload.presence_penalty = payload.presencePenalty

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
