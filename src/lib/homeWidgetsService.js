import { getSupabaseClient } from './supabase'

const notesTable = 'home_notes'
const shortcutsTable = 'home_shortcuts'

// ============================================================================
// Utilities
// ============================================================================

/**
 * Extract domain from URL for favicon fetching
 * @param {string} url - Full URL
 * @returns {string} - Domain name or empty string
 */
export const extractDomain = url => {
  if (!url) return ''
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return ''
  }
}

/**
 * Get direct favicon URL (domain/favicon.ico)
 * @param {string} url - Full URL
 * @returns {string} - Direct favicon URL or empty string
 */
export const getDirectFaviconUrl = url => {
  const domain = extractDomain(url)
  if (!domain) return ''
  return `https://${domain}/favicon.ico`
}

/**
 * Get fallback favicon URL using Google's favicon service
 * @param {string} url - Full URL
 * @param {number} size - Icon size (default: 64)
 * @returns {string} - Favicon image URL
 */
export const getFaviconFallbackUrl = (url, size = 64) => {
  const domain = extractDomain(url)
  if (!domain) return ''
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`
}

// ============================================================================
// Notes
// ============================================================================

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

  const { data, error } = await supabase.from(notesTable).insert([{ content }]).select().single()
  return { data, error }
}

export const deleteHomeNote = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: new Error('Supabase not configured') }

  const { error } = await supabase.from(notesTable).delete().eq('id', id)
  return { error }
}

// ============================================================================
// Shortcuts
// ============================================================================

export const fetchHomeShortcuts = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(shortcutsTable)
    .select('*')
    .order('position', { ascending: true })

  return { data: data || [], error }
}

export const upsertHomeShortcut = async ({ id, title, url, icon_type = 'lucide', icon_name, icon_url, color, position }) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  const payload = { title, url, icon_type, icon_name, icon_url, color, position }

  if (id) {
    const { data, error } = await supabase
      .from(shortcutsTable)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    return { data, error }
  }

  const { data, error } = await supabase.from(shortcutsTable).insert([payload]).select().single()
  return { data, error }
}

export const deleteHomeShortcut = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: new Error('Supabase not configured') }

  const { error } = await supabase.from(shortcutsTable).delete().eq('id', id)
  return { error }
}

export const reorderHomeShortcuts = async shortcuts => {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: new Error('Supabase not configured') }

  // Update each shortcut's position individually
  const promises = shortcuts.map((shortcut, index) =>
    supabase.from(shortcutsTable).update({ position: index }).eq('id', shortcut.id)
  )

  const results = await Promise.all(promises)
  const error = results.find(r => r.error)?.error
  return { error }
}
