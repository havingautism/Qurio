import { getSupabaseClient } from './supabase'

const table = 'conversations'

export const listConversations = async (options = {}) => {
  const {
    limit = 10,
    cursor = null,
    page = null,
    search = null, // Add search support
    sortBy = 'created_at',
    ascending = false,
  } = options
  const supabase = getSupabaseClient()
  if (!supabase)
    return {
      data: [],
      error: new Error('Supabase not configured'),
      nextCursor: null,
      hasMore: false,
      count: 0,
    }

  // Build query
  let query = supabase
    .from(table)
    .select('id,title,created_at,space_id,api_provider,is_favorited', {
      count: 'exact',
    })
    .order(sortBy, { ascending })

  // Handle Search
  if (search && search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  // Handle Pagination
  if (page !== null) {
    // Page-based pagination (0-indexed internally for range)
    // If user passes page=1 (1-indexed), range is (0, 9) for limit 10
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)
  } else if (cursor) {
    // Cursor-based pagination (Legacy/Infinite Scroll)
    // NOTE: Combining search + infinite scroll/cursor is complex if sorted by created_at.
    // For now, we assume search is mostly used with page pagination (LibraryView).
    // If sidebar needs search, it might need page pagination or standard limit without cursor if searching.
    query = query.limit(limit)
    if (sortBy === 'created_at') {
      if (ascending) {
        query = query.gt('created_at', cursor)
      } else {
        query = query.lt('created_at', cursor)
      }
    } else if (sortBy === 'title') {
      if (ascending) {
        query = query.gt('title', cursor)
      } else {
        query = query.lt('title', cursor)
      }
    }
  } else {
    // No cursor, no page -> just limit (Initial fetch or default)
    query = query.limit(limit)
  }

  const { data, error, count } = await query

  // Determine next cursor and if there's more data (for infinite scroll compatibility)
  const hasMore = data && data.length === limit
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1][sortBy] : null

  return {
    data: data || [],
    error,
    nextCursor,
    hasMore,
    count: count || 0,
  }
}

export const listBookmarkedConversations = async (options = {}) => {
  const { limit = 10, cursor = null, sortBy = 'created_at', ascending = false } = options
  const supabase = getSupabaseClient()
  if (!supabase)
    return {
      data: [],
      error: new Error('Supabase not configured'),
      nextCursor: null,
      hasMore: false,
    }

  // Build query with cursor support and is_favorited filter
  let query = supabase
    .from(table)
    .select('id,title,created_at,space_id,api_provider,is_favorited')
    .eq('is_favorited', true)
    .order(sortBy, { ascending })
    .limit(limit)

  // Apply cursor filter based on sort direction
  if (cursor) {
    if (sortBy === 'created_at') {
      // For created_at sorting
      if (ascending) {
        query = query.gt('created_at', cursor)
      } else {
        query = query.lt('created_at', cursor)
      }
    } else if (sortBy === 'title') {
      // For title sorting
      if (ascending) {
        query = query.gt('title', cursor)
      } else {
        query = query.lt('title', cursor)
      }
    }
  }

  const { data, error } = await query

  // Determine next cursor and if there's more data
  const hasMore = data && data.length === limit
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1][sortBy] : null

  return {
    data: data || [],
    error,
    nextCursor,
    hasMore,
  }
}

export const getConversation = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from(table)
    .select('id,title,created_at,space_id,api_provider,is_favorited')
    .eq('id', id)
    .single()
  return { data, error }
}

export const createConversation = async payload => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase.from(table).insert([payload]).select().single()
  return { data, error }
}

export const listConversationsBySpace = async (spaceId, options = {}) => {
  const { limit = 10, cursor = null } = options
  const supabase = getSupabaseClient()
  if (!supabase)
    return {
      data: [],
      error: new Error('Supabase not configured'),
      nextCursor: null,
      hasMore: false,
    }

  // Build query with cursor support
  // Uses composite index: idx_conversations_space_created (space_id, created_at DESC)
  let query = supabase
    .from(table)
    .select('id,title,created_at,space_id,is_favorited')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Apply cursor filter for pagination
  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data, error } = await query

  // Determine next cursor and if there's more data
  const hasMore = data && data.length === limit
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].created_at : null

  return {
    data: data || [],
    error,
    nextCursor,
    hasMore,
  }
}

export const listMessages = async conversationId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return { data: data || [], error }
}

export const updateConversation = async (id, payload) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()
  return { data, error }
}

export const addMessage = async message => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from('conversation_messages')
    .insert([message])
    .select()
    .single()
  return { data, error }
}

export const toggleFavorite = async (id, isFavorited) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from(table)
    .update({ is_favorited: isFavorited })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}
