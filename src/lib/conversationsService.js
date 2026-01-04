import { getSupabaseClient } from './supabase'

const table = 'conversations'

export const listConversations = async (options = {}) => {
  const {
    limit = 10,
    cursor = null,
    page = null,
    search = null, // Add search support
    excludeSpaceIds = [],
    sortBy = 'updated_at',
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
    .select(
      'id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id',
      {
      count: 'exact',
      },
    )
    .order(sortBy, { ascending })

  // Handle Search
  if (search && search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  if (Array.isArray(excludeSpaceIds) && excludeSpaceIds.length > 0) {
    const normalized = excludeSpaceIds.map(String).filter(Boolean)
    if (normalized.length > 0) {
      const filter = `(${normalized.map(id => `"${id}"`).join(',')})`
      query = query.not('space_id', 'in', filter)
    }
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
    // NOTE: Combining search + infinite scroll/cursor is complex if sorted by updated_at.
    // For now, we assume search is mostly used with page pagination (LibraryView).
    // If sidebar needs search, it might need page pagination or standard limit without cursor if searching.
    query = query.limit(limit)
    if (sortBy === 'updated_at') {
      if (ascending) {
        query = query.gt('updated_at', cursor)
      } else {
        query = query.lt('updated_at', cursor)
      }
    } else if (sortBy === 'created_at') {
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
  const {
    limit = 10,
    cursor = null,
    sortBy = 'updated_at',
    ascending = false,
    excludeSpaceIds = [],
  } = options
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
    .select('id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id')
    .eq('is_favorited', true)
    .order(sortBy, { ascending })
    .limit(limit)

  if (Array.isArray(excludeSpaceIds) && excludeSpaceIds.length > 0) {
    const normalized = excludeSpaceIds.map(String).filter(Boolean)
    if (normalized.length > 0) {
      const filter = `(${normalized.map(id => `"${id}"`).join(',')})`
      query = query.not('space_id', 'in', filter)
    }
  }

  // Apply cursor filter based on sort direction
  if (cursor) {
    if (sortBy === 'updated_at') {
      if (ascending) {
        query = query.gt('updated_at', cursor)
      } else {
        query = query.lt('updated_at', cursor)
      }
    } else if (sortBy === 'created_at') {
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
    .select('id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id')
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
  const {
    limit = 10,
    cursor = null,
    page = null,
    search = null,
    sortBy = 'updated_at',
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

  // Build query with cursor or page-based pagination
  let query = supabase
    .from(table)
    .select('id,title,title_emojis,created_at,updated_at,space_id,is_favorited,last_agent_id', {
      count: 'exact',
    })
    .eq('space_id', spaceId)
    .order(sortBy, { ascending })
    .limit(limit)

  if (search && search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  if (page !== null) {
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)
  } else if (cursor) {
    if (sortBy === 'updated_at') {
      query = ascending ? query.gt('updated_at', cursor) : query.lt('updated_at', cursor)
    } else if (sortBy === 'created_at') {
      query = ascending ? query.gt('created_at', cursor) : query.lt('created_at', cursor)
    } else if (sortBy === 'title') {
      query = ascending ? query.gt('title', cursor) : query.lt('title', cursor)
    }
  }

  const { data, error, count } = await query

  const hasMore = data && data.length === limit
  let nextCursor = null
  if (!page && hasMore && data.length > 0) {
    nextCursor = data[data.length - 1][sortBy]
  }

  return {
    data: data || [],
    error,
    nextCursor,
    hasMore,
    count: count || 0,
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

export const updateMessageById = async (id, payload) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from('conversation_messages')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const addConversationEvent = async (conversationId, eventType, payload = null) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!conversationId) return { data: null, error: new Error('Conversation id is required') }
  if (!eventType) return { data: null, error: new Error('Event type is required') }
  const { data, error } = await supabase
    .from('conversation_events')
    .insert([
      {
        conversation_id: conversationId,
        event_type: eventType,
        payload,
        created_at: new Date().toISOString(),
      },
    ])
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
