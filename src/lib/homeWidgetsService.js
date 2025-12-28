import { getSupabaseClient } from './supabase'

const notesTable = 'home_notes'

export const fetchHomeNotes = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(notesTable)
    .select('*')
    .order('updated_at', { ascending: false })

  return { data: data || [], error }
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

  /* ... existing upsertHomeNote code ... */
  const { data, error } = await supabase.from(notesTable).insert([{ content }]).select().single()
  return { data, error }
}

export const deleteHomeNote = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: new Error('Supabase not configured') }

  const { error } = await supabase.from(notesTable).delete().eq('id', id)
  return { error }
}
