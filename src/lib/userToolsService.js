import { getSupabaseClient } from './supabase'

const table = 'user_tools'

export const getUserTools = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  // Get current user ID from session or use default for self-hosted mode
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id || 'default-user'

  if (!userId) return []

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user tools:', error)
    return []
  }

  return data || []
}

export const createUserTool = async toolData => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id || 'default-user'

  const { data, error } = await supabase
    .from(table)
    .insert({
      user_id: userId,
      name: toolData.name,
      description: toolData.description,
      type: toolData.type || 'http',
      config: toolData.config,
      input_schema: toolData.input_schema,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export const updateUserTool = async (id, toolData) => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from(table)
    .update({
      name: toolData.name,
      description: toolData.description,
      config: toolData.config,
      input_schema: toolData.input_schema,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export const deleteUserTool = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.from(table).delete().eq('id', id)

  if (error) throw error
  return true
}
