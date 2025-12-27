import { getSupabaseClient } from './supabase'

const notesTable = 'home_notes'

export const fetchHomeNote = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(notesTable)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)

  return { data: data?.[0] || null, error }
}

export const upsertHomeNote = async ({ id, content = '' }) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  if (id) {
    const { data, error } = await supabase
      .from(notesTable)
      .update({ content })
      .eq('id', id)
      .select()
      .single()
    return { data, error }
  }

  const { data, error } = await supabase
    .from(notesTable)
    .insert([{ content }])
    .select()
    .single()
  return { data, error }
}
