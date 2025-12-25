import { getSupabaseClient } from './supabase'

const table = 'spaces'

export const listSpaces = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: true })

  return { data: data || [], error }
}

export const createSpace = async ({
  emoji = '',
  label,
  description = '',
  prompt = '',
  temperature = null,
  top_k = null,
}) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!label) return { data: null, error: new Error('Label is required') }

  const { data, error } = await supabase
    .from(table)
    .insert([{ emoji, label, description, prompt, temperature, top_k }])
    .select()
    .single()

  return { data, error }
}

export const updateSpace = async (id, { emoji, label, description, prompt, temperature, top_k }) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!id) return { data: null, error: new Error('Space id is required') }

  const payload = {}
  if (emoji !== undefined) payload.emoji = emoji
  if (label !== undefined) payload.label = label
  if (description !== undefined) payload.description = description
  if (prompt !== undefined) payload.prompt = prompt
  if (temperature !== undefined) payload.temperature = temperature
  if (top_k !== undefined) payload.top_k = top_k

  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()

  return { data, error }
}

export const deleteSpace = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!id) return { success: false, error: new Error('Space id is required') }

  const { error } = await supabase.from(table).delete().eq('id', id)
  return { success: !error, error }
}

export const listSpaceAgents = async spaceId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  if (!spaceId) return { data: [], error: new Error('Space id is required') }

  const { data, error } = await supabase
    .from('space_agents')
    .select('agent_id, sort_order')
    .eq('space_id', spaceId)
    .order('sort_order', { ascending: true })

  return { data: data || [], error }
}

export const updateSpaceAgents = async (spaceId, agentIds = []) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!spaceId) return { success: false, error: new Error('Space id is required') }

  const { error: deleteError } = await supabase
    .from('space_agents')
    .delete()
    .eq('space_id', spaceId)

  if (deleteError) return { success: false, error: deleteError }
  if (!agentIds.length) return { success: true, error: null }

  const rows = agentIds.map((agentId, index) => ({
    space_id: spaceId,
    agent_id: agentId,
    sort_order: index,
  }))

  const { error: insertError } = await supabase.from('space_agents').insert(rows)
  return { success: !insertError, error: insertError }
}
