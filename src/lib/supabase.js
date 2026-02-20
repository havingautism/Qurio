/**
 * Supabase Service (spaces-first)
 *
 * This module encapsulates Supabase access with a small, readable API for
 * spaces and chat artifacts. It assumes the schema defined in supabase/init.sql:
 * - spaces
 * - conversations
 * - conversation_messages
 * - conversation_events
 * - attachments
 * - space_documents
 * - conversation_documents
 *
 * NOTE: The app is local-first and single-user, so no user/owner columns are
 * modeled here. Credentials are read from settings (env/localStorage).
 */

import { loadSettings } from './settings'
export { loadSettings, saveSettings } from './settings'

const DEFAULT_USER_ID = 'default-user'

let backendDbClient = null

const getBackendUrl = () => {
  const settings = loadSettings()
  return settings.backendUrl || 'http://127.0.0.1:3002'
}

const getDbAccessKey = () => {
  const settings = loadSettings()
  return settings.dbAccessKey || ''
}
const resolveProviderId = (overrides = {}) => {
  const settings = loadSettings(overrides)
  return settings.databaseProviderId || settings.databaseProvider || ''
}

const parseOrFilter = raw => {
  if (!raw || typeof raw !== 'string') return []
  const parts = raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const filters = []
  parts.forEach(part => {
    if (part.endsWith('.is.null')) {
      const column = part.replace('.is.null', '')
      filters.push({ op: 'is_null', column })
      return
    }
    const notInMatch = part.match(/^(.+)\.not\.in\.\((.+)\)$/)
    if (notInMatch) {
      const column = notInMatch[1]
      const values = notInMatch[2]
        .split(',')
        .map(v => v.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean)
      filters.push({ op: 'not_in', column, values })
      return
    }
    const eqMatch = part.match(/^(.+)\.eq\.(.+)$/)
    if (eqMatch) {
      filters.push({ op: 'eq', column: eqMatch[1], value: eqMatch[2] })
    }
  })
  return filters
}

class BackendQueryBuilder {
  constructor(providerId, table, action = 'select') {
    this.providerId = providerId
    this.table = table
    this.action = action
    this.columns = null
    this.filters = []
    this.orderBy = []
    this.limitValue = null
    this.rangeValue = null
    this.count = null
    this.singleValue = false
    this.maybeSingleValue = false
    this.values = null
    this.payload = null
    this.onConflict = null
  }

  select(columns = '*', options = {}) {
    this.columns = columns
    if (options?.count) this.count = options.count
    return this
  }

  insert(values) {
    this.action = 'insert'
    this.values = values
    return this
  }

  update(payload) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  upsert(values, options = {}) {
    this.action = 'upsert'
    this.values = values
    this.onConflict = options.onConflict || null
    return this
  }

  eq(column, value) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  gt(column, value) {
    this.filters.push({ op: 'gt', column, value })
    return this
  }

  lt(column, value) {
    this.filters.push({ op: 'lt', column, value })
    return this
  }

  ilike(column, value) {
    this.filters.push({ op: 'ilike', column, value: String(value || '').replace(/%/g, '') })
    return this
  }

  in(column, values) {
    this.filters.push({ op: 'in', column, values: values || [] })
    return this
  }

  // Compatibility with supabase-js: .not(column, operator, value)
  // Currently we support the variant used by the app: .not('id', 'in', '(a,b,c)')
  not(column, operator, value) {
    const op = String(operator || '').trim().toLowerCase()
    if (op === 'in') {
      let values = []
      if (Array.isArray(value)) {
        values = value
      } else if (typeof value === 'string') {
        const raw = value.trim().replace(/^\(/, '').replace(/\)$/, '')
        values = raw
          .split(',')
          .map(v => v.replace(/^"+|"+$/g, '').trim())
          .filter(Boolean)
      } else if (value != null) {
        values = [value]
      }
      this.filters.push({ op: 'not_in', column, values })
      return this
    }
    throw new Error(`Unsupported .not operator: ${operator}`)
  }

  or(raw) {
    const parsed = parseOrFilter(raw)
    if (parsed.length > 0) {
      this.filters.push({ op: 'or', filters: parsed })
    }
    return this
  }

  order(column, options = {}) {
    this.orderBy.push({ column, ascending: options.ascending !== false })
    return this
  }

  limit(value) {
    this.limitValue = value
    return this
  }

  range(from, to) {
    this.rangeValue = { from, to }
    return this
  }

  single() {
    this.singleValue = true
    this.maybeSingleValue = false
    return this
  }

  // Compatibility with supabase-js v2 API usage in service modules.
  maybeSingle() {
    this.singleValue = true
    this.maybeSingleValue = true
    return this
  }

  async execute() {
    if (!this.providerId) {
      return { data: null, error: new Error('Database provider not configured') }
    }
    const response = await fetch(`${getBackendUrl()}/api/db/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getDbAccessKey() ? { 'x-db-access-key': getDbAccessKey() } : {}),
      },
      body: JSON.stringify({
        providerId: this.providerId,
        action: this.action,
        table: this.table,
        columns: this.columns,
        filters: this.filters.length ? this.filters : null,
        order: this.orderBy.length ? this.orderBy : null,
        limit: this.limitValue,
        range: this.rangeValue,
        count: this.count,
        single: this.singleValue,
        maybeSingle: this.maybeSingleValue,
        values: this.values,
        payload: this.payload,
        onConflict: Array.isArray(this.onConflict)
          ? this.onConflict
          : this.onConflict
            ? [String(this.onConflict)]
            : null,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('db-auth-failed'))
    }
    if (!response.ok || payload.error) {
      const normalizedError =
        typeof payload.error === 'string'
          ? payload.error
          : payload.error
            ? JSON.stringify(payload.error)
            : ''
      const normalizedDetail =
        typeof payload.detail === 'string'
          ? payload.detail
          : payload.detail
            ? JSON.stringify(payload.detail)
            : ''
      if (
        this.maybeSingleValue &&
        (normalizedError.includes('PGRST116') ||
          normalizedError.includes('Cannot coerce the result to a single JSON object') ||
          normalizedError.includes('The result contains 0 rows'))
      ) {
        return { data: null, error: null, count: payload.count }
      }
      const errMsg =
        normalizedError ||
        normalizedDetail ||
        (response.ok ? 'Database error' : `HTTP ${response.status}: Database error`)
      return { data: payload.data || null, error: new Error(errMsg) }
    }
    return { data: payload.data ?? null, error: null, count: payload.count }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }
}

class BackendDbClient {
  constructor(providerId) {
    this.providerId = providerId
  }

  from(table) {
    return new BackendQueryBuilder(this.providerId, table)
  }

  rpc(name, params = {}) {
    const builder = new BackendQueryBuilder(this.providerId, null, 'rpc')
    builder.execute = async () => {
      const response = await fetch(`${getBackendUrl()}/api/db/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getDbAccessKey() ? { 'x-db-access-key': getDbAccessKey() } : {}),
        },
        body: JSON.stringify({
          providerId: this.providerId,
          action: 'rpc',
          rpc: { name, params },
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('db-auth-failed'))
      }
      if (!response.ok || payload.error) {
        return { data: payload.data || null, error: new Error(payload.error || 'Database error') }
      }
      return { data: payload.data ?? null, error: null }
    }
    return builder
  }

  get auth() {
    return {
      getSession: async () => ({ data: { session: { user: { id: DEFAULT_USER_ID } } } }),
    }
  }
}

/**
 * Initialize backend DB client (providerId from settings).
 */
export const initSupabase = overrides => {
  const providerId = resolveProviderId(overrides)
  if (!providerId) return null
  backendDbClient = new BackendDbClient(providerId)
  return backendDbClient
}

/**
 * Get cached backend DB client.
 */
export const getSupabaseClient = () => {
  const providerId = resolveProviderId()
  if (!providerId) return null
  if (backendDbClient && backendDbClient.providerId === providerId) return backendDbClient
  return initSupabase()
}

export const getSupabaseClientForProvider = providerId => {
  const trimmed = String(providerId || '').trim()
  if (!trimmed) return getSupabaseClient()
  if (backendDbClient && backendDbClient.providerId === trimmed) return backendDbClient
  return new BackendDbClient(trimmed)
}

/**
 * Quick connectivity/table existence check.
 */
export const testConnection = async () => {
  try {
    const providerId = resolveProviderId()
    if (!providerId) {
      return {
        success: false,
        connection: false,
        message: 'Database provider not configured.',
        tables: {},
      }
    }

    const response = await fetch(`${getBackendUrl()}/api/db/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getDbAccessKey() ? { 'x-db-access-key': getDbAccessKey() } : {}),
      },
      body: JSON.stringify({ providerId, action: 'test' }),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('db-auth-failed'))
    }
    if (!response.ok || payload.error) {
      return {
        success: false,
        connection: false,
        message: payload.error || 'Database test failed.',
        tables: {},
      }
    }
    return (
      payload.data || {
        success: true,
        connection: true,
        message: 'Connection successful.',
        tables: {},
      }
    )
  } catch (error) {
    return {
      success: false,
      connection: false,
      message: `Connection failed: ${error.message}`,
      tables: {},
    }
  }
}

// ---------------------------------------------------------------------------
// Spaces CRUD
// ---------------------------------------------------------------------------

const spacesTable = 'spaces'

export const fetchSpaces = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from(spacesTable)
    .select('*')
    .order('created_at', { ascending: true })

  return { data: data || [], error }
}

export const createSpace = async ({ emoji = '', label, description = '' }) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!label) return { data: null, error: new Error('Label is required') }

  const { data, error } = await supabase
    .from(spacesTable)
    .insert([{ emoji, label, description }])
    .select()
    .single()

  return { data, error }
}

export const updateSpace = async (id, { emoji, label, description }) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!id) return { data: null, error: new Error('Space id is required') }

  const updatePayload = {}
  if (emoji !== undefined) updatePayload.emoji = emoji
  if (label !== undefined) updatePayload.label = label
  if (description !== undefined) updatePayload.description = description

  const { data, error } = await supabase
    .from(spacesTable)
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  return { data, error }
}

export const deleteSpace = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!id) return { success: false, error: new Error('Space id is required') }

  const { error } = await supabase.from(spacesTable).delete().eq('id', id)
  return { success: !error, error }
}

// ---------------------------------------------------------------------------
// Conversation stubs (to be fleshed out alongside UI wiring)
// ---------------------------------------------------------------------------

export const createConversation = async payload => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase.from('conversations').insert([payload]).select().single()
  return { data, error }
}

export const deleteConversation = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { success: false, error: new Error('Supabase not configured') }
  if (!id) return { success: false, error: new Error('Conversation id is required') }

  const { error } = await supabase.from('conversations').delete().eq('id', id)
  return { success: !error, error }
}

export const removeConversationFromSpace = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  if (!id) return { data: null, error: new Error('Conversation id is required') }

  const { data, error } = await supabase
    .from('conversations')
    .update({ space_id: null })
    .eq('id', id)
    .select()
    .single()

  return { data, error }
}

export const saveMessage = async message => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from('conversation_messages')
    .insert([message])
    .select()
    .single()
  return { data, error }
}

export const getHistory = async conversationId => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], error: new Error('Supabase not configured') }
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return { data: data || [], error }
}

// export const deleteMessagesAfterTimestamp = async (conversationId, timestamp) => {
//   const supabase = getSupabaseClient();
//   if (!supabase)
//     return { data: null, error: new Error("Supabase not configured") };

//   const { data, error } = await supabase
//     .from("conversation_messages")
//     .delete()
//     .eq("conversation_id", conversationId)
//     .gt("created_at", timestamp);

//   return { data, error };
// };

export const deleteMessageByTimestamp = async (conversationId, timestamp) => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  const { data, error } = await supabase
    .from('conversation_messages')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('created_at', timestamp)

  return { data, error }
}

export const deleteMessageById = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  const { data, error } = await supabase.from('conversation_messages').delete().eq('id', id)

  return { data, error }
}

// ---------------------------------------------------------------------------
// Settings Sync
// ---------------------------------------------------------------------------

export const fetchRemoteSettings = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: null, error: new Error('Supabase not configured') }

  const { data, error } = await supabase.from('user_settings').select('*')
  if (error || !data) return { data: null, error }

  // Convert array [{key: 'k', value: 'v'}] to object {k: v}
  const settings = data.reduce((acc, item) => {
    acc[item.key] = item.value
    return acc
  }, {})

  // Backward compatibility: legacy key fallback.
  if (
    (settings.contextTurns === undefined ||
      settings.contextTurns === null ||
      settings.contextTurns === '') &&
    settings.contextMessageLimit !== undefined
  ) {
    settings.contextTurns = settings.contextMessageLimit
  }

  return { data: settings, error: null }
}

export const saveRemoteSettings = async settings => {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: new Error('Supabase not configured') }

  const normalizeSettingValue = value => {
    if (value === undefined || value === null) return ''
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  }

  // Prepare upsert payload
  // Only save keys that we want to persist remotely (API keys, etc.)
  const KEYS_TO_SYNC = [
    'OpenAICompatibilityKey',
    'OpenAICompatibilityUrl',
    'SiliconFlowKey',
    'GlmKey',
    'DeepSeekKey',
    'VolcengineKey',
    'ModelScopeKey',
    'KimiKey',
    'googleApiKey',
    'tavilyApiKey',
    'searchProvider',
    'backendUrl',
    'serpapiApiKey',
    'NvidiaKey',
    'MinimaxKey',
    'embeddingProvider',
    'embeddingModel',
    'embeddingModelSource',
    'enableLongTermMemory',
    'contextTurns',
    'defaultModel',
    'liteModel',
    'defaultModelProvider',
    'liteModelProvider',
    'defaultModelSource',
    'liteModelSource',
    'userSelfIntro',
    // We do NOT sync Supabase credentials to the DB itself usually, but user might want to?
    // Syncing supabase credentials to the database that requires them to be accessed is paradoxical if you don't have them.
    // But syncing them allows other devices (once connected) to update them? No.
    // Typically we only sync the API keys for models.
  ]

  const updates = KEYS_TO_SYNC.filter(key => settings[key] !== undefined).map(key => ({
    key,
    value: normalizeSettingValue(settings[key]),
    updated_at: new Date().toISOString(),
  }))

  if (updates.length > 0) {
    // user_settings primary key is "key" (no "id"), so SQLite adapter needs explicit conflict column.
    const { error } = await supabase.from('user_settings').upsert(updates, { onConflict: 'key' })
    if (error) return { error }

    // Migration cleanup: remove legacy key after successful upsert.
    if (settings.contextTurns !== undefined || settings.contextMessageLimit !== undefined) {
      await supabase.from('user_settings').delete().eq('key', 'contextMessageLimit')
    }
    return { error: null }
  }

  return { error: null }
}
