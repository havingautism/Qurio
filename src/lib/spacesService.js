import { getSupabaseClient } from './supabase'

const table = 'spaces'
const SPACE_AGENTS_CACHE_TTL = 15000
const spaceAgentsCache = new Map()
const spaceAgentsInFlight = new Map()

const getSpaceAgentsCacheKey = spaceId => String(spaceId)

const getSpaceAgentsFromCache = spaceId => {
  const cacheKey = getSpaceAgentsCacheKey(spaceId)
  const cached = spaceAgentsCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.timestamp > SPACE_AGENTS_CACHE_TTL) {
    spaceAgentsCache.delete(cacheKey)
    return null
  }
  return cached
}

const setSpaceAgentsCache = (spaceId, result) => {
  const cacheKey = getSpaceAgentsCacheKey(spaceId)
  spaceAgentsCache.set(cacheKey, { ...result, timestamp: Date.now() })
}

const invalidateSpaceAgentsCache = spaceId => {
  const cacheKey = getSpaceAgentsCacheKey(spaceId)
  spaceAgentsCache.delete(cacheKey)
  spaceAgentsInFlight.delete(cacheKey)
}

export const listSpaces = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: true })

  const mapped = (data || []).map(space => ({
    ...space,
    isDeepResearch: space.is_deep_research ?? space.isDeepResearch ?? false,
  }))

  return { data: mapped, error }
}

export const createSpace = async ({
  emoji = '',
  label,
  description = '',
  isDeepResearch = false,
}) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!label) return { data: null, error: new Error('Label is required') }

  const { data, error } = await supabase
    .from(table)
    .insert([{ emoji, label, description, is_deep_research: isDeepResearch }])
    .select()
    .single()

  return { data, error }
}

export const updateSpace = async (id, { emoji, label, description, isDeepResearch }) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!id) return { data: null, error: new Error('Space id is required') }

  const payload = {}
  if (emoji !== undefined) payload.emoji = emoji
  if (label !== undefined) payload.label = label
  if (description !== undefined) payload.description = description
  if (isDeepResearch !== undefined) payload.is_deep_research = isDeepResearch

  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()

  return { data, error }
}

export const deleteSpace = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!id) return { success: false, error: new Error('Space id is required') }

  const { error } = await supabase.from(table).delete().eq('id', id)
  if (!error) invalidateSpaceAgentsCache(id)
  return { success: !error, error }
}

export const listSpaceAgents = async spaceId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  if (!spaceId) return { data: [], error: new Error('Space id is required') }

  const cached = getSpaceAgentsFromCache(spaceId)
  if (cached) {
    return { data: cached.data || [], error: cached.error || null }
  }

  const cacheKey = getSpaceAgentsCacheKey(spaceId)
  if (spaceAgentsInFlight.has(cacheKey)) {
    return spaceAgentsInFlight.get(cacheKey)
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from('space_agents')
      .select('agent_id, sort_order, is_primary')
      .eq('space_id', spaceId)
      .order('sort_order', { ascending: true })

    const result = { data: data || [], error }
    if (!error) {
      setSpaceAgentsCache(spaceId, result)
    }
    return result
  })()

  spaceAgentsInFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    spaceAgentsInFlight.delete(cacheKey)
  }
}

export const updateSpaceAgents = async (spaceId, agentIds = [], primaryAgentId = null) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!spaceId) return { success: false, error: new Error('Space id is required') }

  const { data: existingSpaces, error: spaceLookupError } = await supabase
    .from('spaces')
    .select('id')
    .eq('id', spaceId)
    .limit(1)
  if (spaceLookupError) return { success: false, error: spaceLookupError }
  if (!existingSpaces || existingSpaces.length === 0) {
    await supabase.from('space_agents').delete().eq('space_id', spaceId)
    invalidateSpaceAgentsCache(spaceId)
    return { success: false, error: new Error('Space not found') }
  }

  const normalizedAgentIds = (agentIds || []).filter(Boolean)
  if (!normalizedAgentIds.length) {
    const { error: deleteError } = await supabase
      .from('space_agents')
      .delete()
      .eq('space_id', spaceId)

    if (deleteError) return { success: false, error: deleteError }
    invalidateSpaceAgentsCache(spaceId)
    // Notify ChatInterface to reload space agents
    window.dispatchEvent(new CustomEvent('space-agents-changed', { detail: { spaceId } }))
    return { success: true, error: null }
  }

  const { data: existingAgents, error: agentLookupError } = await supabase
    .from('agents')
    .select('id')
    .in('id', normalizedAgentIds)

  if (agentLookupError) return { success: false, error: agentLookupError }

  const existingIds = new Set((existingAgents || []).map(row => String(row.id)))
  const validAgentIds = normalizedAgentIds.filter(id => existingIds.has(String(id)))

  const { error: deleteError } = await supabase
    .from('space_agents')
    .delete()
    .eq('space_id', spaceId)

  if (deleteError) return { success: false, error: deleteError }
  if (!validAgentIds.length) {
    invalidateSpaceAgentsCache(spaceId)
    // Notify ChatInterface to reload space agents
    window.dispatchEvent(new CustomEvent('space-agents-changed', { detail: { spaceId } }))
    return { success: true, error: null }
  }

  const rows = validAgentIds.map((agentId, index) => ({
    space_id: spaceId,
    agent_id: agentId,
    sort_order: index,
    is_primary: primaryAgentId ? String(agentId) === String(primaryAgentId) : false,
  }))

  const { error: insertError } = await supabase.from('space_agents').insert(rows)
  invalidateSpaceAgentsCache(spaceId)
  // Notify ChatInterface to reload space agents
  if (!insertError) {
    window.dispatchEvent(new CustomEvent('space-agents-changed', { detail: { spaceId } }))
  }
  return { success: !insertError, error: insertError }
}
