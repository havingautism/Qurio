import { getSupabaseClient } from './supabase'

const table = 'conversations'
const CACHE_TTL_MS = 1500
const EXPERT_IDS_CACHE_TTL_MS = 30000
const listCache = new Map()
const inFlight = new Map()
let expertIdsCache = null
let expertIdsInFlight = null
let conversationsChangedTimer = null
let pendingConversationsChangedDetail = null

const getCacheKey = (prefix, params) => {
  try {
    return `${prefix}:${JSON.stringify(params)}`
  } catch {
    return `${prefix}:${String(params)}`
  }
}

const getCached = key => {
  const entry = listCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    listCache.delete(key)
    return null
  }
  return entry.value
}

const setCached = (key, value) => {
  listCache.set(key, { ts: Date.now(), value })
}

const invalidateConversationCaches = () => {
  listCache.clear()
  inFlight.clear()
}

const invalidateExpertConversationIdsCache = () => {
  expertIdsCache = null
}

const _sanitizeInFilterValue = value =>
  String(value || '')
    .replace(/[,()]/g, '')
    .trim()

const listExpertConversationIds = async supabase => {
  if (expertIdsCache && Date.now() - Number(expertIdsCache.ts || 0) <= EXPERT_IDS_CACHE_TTL_MS) {
    return expertIdsCache.value
  }
  if (expertIdsInFlight) return expertIdsInFlight

  const request = (async () => {
    const { data, error } = await supabase
      .from('conversation_events')
      .select('conversation_id')
      .eq('event_type', 'expert_mode_start')

    if (error) return { data: [], error }

    const ids = Array.from(
      new Set(
        (Array.isArray(data) ? data : [])
          .map(row => _sanitizeInFilterValue(row?.conversation_id))
          .filter(Boolean),
      ),
    )
    const result = { data: ids, error: null }
    expertIdsCache = { ts: Date.now(), value: result }
    return result
  })()

  expertIdsInFlight = request
  try {
    return await request
  } finally {
    expertIdsInFlight = null
  }
}

const normalizeScopes = value => {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  return Array.from(new Set(raw.map(item => String(item || '').trim()).filter(Boolean)))
}

const mergeConversationChangedDetail = (base, next) => {
  const left = base && typeof base === 'object' ? base : {}
  const right = next && typeof next === 'object' ? next : {}
  const merged = { ...left, ...right }
  const scopes = normalizeScopes([...(left.scopes || []), ...(right.scopes || [])])
  if (scopes.length > 0) {
    merged.scopes = scopes
  } else {
    delete merged.scopes
  }
  return merged
}

export const conversationEventHasScope = (event, expectedScope) => {
  if (!expectedScope) return true
  const scopes = normalizeScopes(event?.detail?.scopes)
  if (scopes.length === 0) return true
  const expected = normalizeScopes(expectedScope)
  return expected.some(scope => scopes.includes(scope) || scopes.includes('all'))
}

export const notifyConversationsChanged = (optionsOrDelay = 150) => {
  if (typeof window === 'undefined') return
  let delayMs = 150
  let detail = {}

  if (typeof optionsOrDelay === 'number') {
    delayMs = optionsOrDelay
  } else if (optionsOrDelay && typeof optionsOrDelay === 'object') {
    if (typeof optionsOrDelay.delayMs === 'number') {
      delayMs = optionsOrDelay.delayMs
    }
    detail = { ...optionsOrDelay }
    delete detail.delayMs
    const scopes = normalizeScopes(detail.scopes)
    if (scopes.length > 0) {
      detail.scopes = scopes
    } else {
      delete detail.scopes
    }
  }

  pendingConversationsChangedDetail = mergeConversationChangedDetail(
    pendingConversationsChangedDetail,
    detail,
  )
  if (conversationsChangedTimer) return

  conversationsChangedTimer = window.setTimeout(() => {
    const payload = pendingConversationsChangedDetail || {}
    pendingConversationsChangedDetail = null
    conversationsChangedTimer = null
    window.dispatchEvent(
      new CustomEvent('conversations-changed', {
        detail: payload,
      }),
    )
  }, delayMs)
}

export const notifyConversationPatched = patch => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('conversation-patched', {
      detail: patch || {},
    }),
  )
}

export const listConversations = async (options = {}) => {
  const cacheKey = getCacheKey('listConversations', options)
  const cached = getCached(cacheKey)
  if (cached) return cached
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)
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
  const { data: expertIds, error: expertIdsError } = await listExpertConversationIds(supabase)
  if (expertIdsError) {
    console.warn('Failed to load expert conversation ids for listConversations:', expertIdsError)
  }

  let query = supabase
    .from(table)
    .select(
      'id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id,scrapbook_id',
      {
        count: 'exact',
      },
    )
    .isNull('scrapbook_id')
    .order(sortBy, { ascending })
  // Handle Search
  if (search && search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  // 1. Exclude expert IDs
  if (!expertIdsError && Array.isArray(expertIds) && expertIds.length > 0) {
    const normalizedExpertIds = expertIds.map(_sanitizeInFilterValue).filter(Boolean)
    if (normalizedExpertIds.length > 0) {
      query = query.not('id', 'in', `(${normalizedExpertIds.join(',')})`)
    }
  }


  // 2. Exclude specific spaces (like Deep Research)
  if (Array.isArray(excludeSpaceIds) && excludeSpaceIds.length > 0) {
    const normalized = excludeSpaceIds.map(String).filter(Boolean)
    if (normalized.length > 0) {
      // Must use OR so we keep null space_ids AND don't override the previous .not operator
      // We also wrap this in an explicit AND filter in Supabase postgREST if needed,
      // but standard .or() appends to the query via AND by default in newer Supabase clients.
      query = query.or(`space_id.is.null,space_id.not.in.(${normalized.join(',')})`)
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

  const request = (async () => {
    const { data, error, count } = await query

    // Determine next cursor and if there's more data (for infinite scroll compatibility)
    const hasMore = data && data.length === limit
    const nextCursor = hasMore && data.length > 0 ? data[data.length - 1][sortBy] : null

    const result = {
      data: data || [],
      error,
      nextCursor,
      hasMore,
      count: count || 0,
    }
    if (!error) {
      setCached(cacheKey, result)
    }
    return result
  })()

  inFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    inFlight.delete(cacheKey)
  }
}

export const listBookmarkedConversations = async (options = {}) => {
  const cacheKey = getCacheKey('listBookmarkedConversations', options)
  const cached = getCached(cacheKey)
  if (cached) return cached
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)
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
    .select(
      'id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id,scrapbook_id',
    )
    .eq('is_favorited', true)
    .isNull('scrapbook_id')
    .order(sortBy, { ascending })
    .limit(limit)

  if (Array.isArray(excludeSpaceIds) && excludeSpaceIds.length > 0) {
    const normalized = excludeSpaceIds.map(String).filter(Boolean)
    if (normalized.length > 0) {
      query = query.or(`space_id.is.null,space_id.not.in.(${normalized.join(',')})`)
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

  const request = (async () => {
    const { data, error } = await query

    // Determine next cursor and if there's more data
    const hasMore = data && data.length === limit
    const nextCursor = hasMore && data.length > 0 ? data[data.length - 1][sortBy] : null

    const result = {
      data: data || [],
      error,
      nextCursor,
      hasMore,
    }
    if (!error) {
      setCached(cacheKey, result)
    }
    return result
  })()

  inFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    inFlight.delete(cacheKey)
  }
}

export const getConversation = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from(table)
    .select(
      'id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id,agent_selection_mode,scrapbook_id',
    )
    .eq('id', id)
    .single()
  return { data, error }
}

export const getConversationByScrapbookId = async scrapbookId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!scrapbookId) return { data: null, error: null }
  
  const { data, error } = await supabase
    .from(table)
    .select(
      'id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id,agent_selection_mode,scrapbook_id'
    )
    .eq('scrapbook_id', scrapbookId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    
  return { data, error }
}

export const isExpertConversation = async conversationId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { isExpert: false, error: new Error('Supabase not configured') }
  if (!conversationId) return { isExpert: false, error: null }

  const { data, error } = await supabase
    .from('conversation_events')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('event_type', 'expert_mode_start')
    .limit(1)

  if (error) return { isExpert: false, error }
  return { isExpert: Array.isArray(data) && data.length > 0, error: null }
}

export const createConversation = async payload => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase.from(table).insert([payload]).select().single()
  if (!error) {
    invalidateConversationCaches()
  }
  return { data, error }
}

export const listConversationsBySpace = async (spaceId, options = {}) => {
  const cacheKey = getCacheKey('listConversationsBySpace', { spaceId, ...options })
  const cached = getCached(cacheKey)
  if (cached) return cached
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)
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
    .select(
      'id,title,title_emojis,created_at,updated_at,space_id,is_favorited,last_agent_id,scrapbook_id',
      {
        count: 'exact',
      },
    )
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

  const request = (async () => {
    const { data, error, count } = await query

    const hasMore = data && data.length === limit
    let nextCursor = null
    if (!page && hasMore && data.length > 0) {
      nextCursor = data[data.length - 1][sortBy]
    }

    const result = {
      data: data || [],
      error,
      nextCursor,
      hasMore,
      count: count || 0,
    }
    if (!error) {
      setCached(cacheKey, result)
    }
    return result
  })()

  inFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    inFlight.delete(cacheKey)
  }
}

export const listExpertConversations = async (options = {}) => {
  const cacheKey = getCacheKey('listExpertConversations', options)
  const cached = getCached(cacheKey)
  if (cached) return cached
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)

  const { limit = 10, cursor = null, page = null, search = null } = options
  const supabase = getSupabaseClient()
  if (!supabase)
    return {
      data: [],
      error: new Error('Supabase not configured'),
      nextCursor: null,
      hasMore: false,
      count: 0,
    }

  let eventsQuery = supabase
    .from('conversation_events')
    .select('conversation_id,created_at', { count: 'exact' })
    .eq('event_type', 'expert_mode_start')
    .order('created_at', { ascending: false })

  if (page !== null) {
    const from = (page - 1) * limit
    const to = from + limit - 1
    eventsQuery = eventsQuery.range(from, to)
  } else {
    eventsQuery = eventsQuery.limit(limit)
    if (cursor) {
      eventsQuery = eventsQuery.lt('created_at', cursor)
    }
  }

  const request = (async () => {
    const { data: eventRows, error: eventsError, count } = await eventsQuery
    if (eventsError) {
      return {
        data: [],
        error: eventsError,
        nextCursor: null,
        hasMore: false,
        count: 0,
      }
    }

    const rows = Array.isArray(eventRows) ? eventRows : []
    const uniqueConversationIds = []
    const seen = new Set()
    rows.forEach(row => {
      const id = row?.conversation_id ? String(row.conversation_id) : ''
      if (!id || seen.has(id)) return
      seen.add(id)
      uniqueConversationIds.push(id)
    })

    if (uniqueConversationIds.length === 0) {
      return {
        data: [],
        error: null,
        nextCursor: null,
        hasMore: false,
        count: count || 0,
      }
    }

    let convQuery = supabase
      .from(table)
      .select(
        'id,title,title_emojis,created_at,updated_at,space_id,api_provider,is_favorited,last_agent_id,scrapbook_id',
      )
      .in('id', uniqueConversationIds)
      .isNull('scrapbook_id')

    if (search && search.trim()) {
      convQuery = convQuery.ilike('title', `%${search.trim()}%`)
    }

    const { data: conversations, error: convError } = await convQuery
    if (convError) {
      return {
        data: [],
        error: convError,
        nextCursor: null,
        hasMore: false,
        count: count || 0,
      }
    }

    const conversationById = new Map((conversations || []).map(item => [String(item.id), item]))
    const orderedConversations = uniqueConversationIds
      .map(id => conversationById.get(id))
      .filter(Boolean)

    const hasMore = rows.length === limit
    const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1]?.created_at || null : null

    const result = {
      data: orderedConversations,
      error: null,
      nextCursor,
      hasMore,
      count: count || 0,
    }
    setCached(cacheKey, result)
    return result
  })()

  inFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    inFlight.delete(cacheKey)
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
  if (!error) {
    invalidateConversationCaches()
  }
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
  if (!error && eventType === 'expert_mode_start') {
    invalidateExpertConversationIdsCache()
  }
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
  if (!error) {
    invalidateConversationCaches()
  }
  return { data, error }
}
