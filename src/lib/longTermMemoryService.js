import { getSupabaseClient } from './supabase'

const MEMORY_STORAGE_KEY = 'longTermMemoryDomainsV1'
const MEMORY_DOMAIN_TABLE = 'memory_domains'
const MEMORY_SUMMARY_TABLE = 'memory_summaries'
const CACHE_TTL_MS = 0 // Disabled cache for immediate updates
const SUMMARY_MAX_CHARS = 800

let memoryCache = { domains: [], fetchedAt: 0 }

const normalizeText = value => String(value || '').trim()

const normalizeAliases = aliases => {
  if (typeof aliases === 'string' && aliases.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(aliases)
      if (Array.isArray(parsed)) return parsed.map(item => normalizeText(item)).filter(Boolean)
    } catch (e) {
      // Not valid JSON array, treat as single string
    }
  }

  // Handle object/dictionary style aliases (keys/values)
  if (aliases && typeof aliases === 'object' && !Array.isArray(aliases)) {
    try {
      return Object.entries(aliases)
        .flatMap(([k, v]) => [k, v])
        .map(item => normalizeText(item))
        .filter(Boolean)
    } catch (e) {
      // Fallback
    }
  }

  if (!Array.isArray(aliases)) return aliases ? [normalizeText(aliases)].filter(Boolean) : []
  return aliases.map(item => normalizeText(item)).filter(Boolean)
}

const truncateSummary = text => {
  const trimmed = normalizeText(text)
  if (!trimmed) return ''
  if (trimmed.length <= SUMMARY_MAX_CHARS) return trimmed
  return `${trimmed.slice(0, SUMMARY_MAX_CHARS)}...`
}

const loadLocalMemoryState = () => {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveLocalMemoryState = domains => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(domains || []))
}

const updateLocalCache = domains => {
  memoryCache = { domains: domains || [], fetchedAt: Date.now() }
  saveLocalMemoryState(domains || [])
}

export const getMemoryDomains = async () => {
  const now = Date.now()
  if (memoryCache.domains && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.domains
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    const local = loadLocalMemoryState()
    memoryCache = { domains: local, fetchedAt: now }
    return local
  }

  const { data: domains, error } = await supabase
    .from(MEMORY_DOMAIN_TABLE)
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch memory domains:', error)
    const local = loadLocalMemoryState()
    memoryCache = { domains: local, fetchedAt: now }
    return local
  }

  if (!domains || domains.length === 0) {
    memoryCache = { domains: [], fetchedAt: now }
    saveLocalMemoryState([])
    return []
  }

  const domainIds = domains.map(domain => domain.id)
  const { data: summaries, error: summariesError } = await supabase
    .from(MEMORY_SUMMARY_TABLE)
    .select('*')
    .in('domain_id', domainIds)

  if (summariesError) {
    console.error('Failed to fetch memory summaries:', summariesError)
  }

  const latestSummaryMap = new Map()
  for (const summary of summaries || []) {
    if (!latestSummaryMap.has(summary.domain_id)) {
      latestSummaryMap.set(summary.domain_id, summary)
    }
  }

  const enriched = domains.map(domain => ({
    ...domain,
    latest_summary: latestSummaryMap.get(domain.id) || null,
  }))

  updateLocalCache(enriched)
  return enriched
}

const deleteMemoryDomainLocal = domainKey => {
  const trimmedKey = normalizeText(domainKey)
  if (!trimmedKey) return
  const nextDomains = (memoryCache.domains || []).filter(
    domain => normalizeText(domain.domain_key) !== trimmedKey,
  )
  updateLocalCache(nextDomains)
}

export const deleteMemoryDomain = async domainKey => {
  const trimmedKey = normalizeText(domainKey)
  if (!trimmedKey) return { cleared: false }

  const supabase = getSupabaseClient()
  if (supabase) {
    const { error } = await supabase.from(MEMORY_DOMAIN_TABLE).delete().eq('domain_key', trimmedKey)
    if (error) {
      console.error('Failed to delete memory domain:', error)
    }
  }

  deleteMemoryDomainLocal(trimmedKey)
  return { cleared: true }
}

export const upsertMemoryDomainSummary = async ({
  domainKey,
  summary,
  aliases = [],
  scope = '',
  evidence = '',
  append = false,
}) => {
  const trimmedKey = normalizeText(domainKey).toLowerCase()
  const trimmedSummary = truncateSummary(summary)
  const resolvedAliases = normalizeAliases(aliases)
  const resolvedScope = normalizeText(scope)
  const resolvedEvidence = normalizeText(evidence)
  const updatedAt = new Date().toISOString()

  if (!trimmedKey || !trimmedSummary) {
    return { updated: false, error: 'Domain key and summary are required' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    // Local storage fallback logic
    const domains = loadLocalMemoryState()
    const index = domains.findIndex(d => d.domain_key === trimmedKey)

    let updatedSummary = trimmedSummary
    if (append && index !== -1) {
      updatedSummary = truncateSummary(`${domains[index].summary}\n${trimmedSummary}`)
    }

    const entry = {
      domain_key: trimmedKey,
      summary: updatedSummary,
      aliases:
        resolvedAliases.length > 0 ? resolvedAliases : index !== -1 ? domains[index].aliases : [],
      scope: resolvedScope || (index !== -1 ? domains[index].scope : ''),
      updated_at: updatedAt,
    }

    if (index !== -1) {
      domains[index] = entry
    } else {
      domains.push(entry)
    }
    updateLocalCache(domains)
    return { updated: true, domain: entry }
  }

  try {
    // 1. Ensure domain exists
    const { data: existing, error: existingError } = await supabase
      .from(MEMORY_DOMAIN_TABLE)
      .select('*, memory_summaries(summary)')
      .eq('domain_key', trimmedKey)
      .maybeSingle()

    if (existingError) {
      console.error('Failed to load memory domain:', existingError)
    }

    if (existing?.id) {
      const { data: updatedDomain, error: updateError } = await supabase
        .from(MEMORY_DOMAIN_TABLE)
        .update({
          aliases: resolvedAliases.length > 0 ? resolvedAliases : existing.aliases,
          scope: resolvedScope || existing.scope,
          updated_at: updatedAt,
        })
        .eq('id', existing.id)
        .select()
        .maybeSingle()

      if (updateError) {
        console.error('Failed to update memory domain:', updateError)
      }

      let finalSummary = trimmedSummary
      if (append) {
        const oldSummary = Array.isArray(existing.memory_summaries)
          ? existing.memory_summaries[0]?.summary
          : existing.memory_summaries?.summary || ''
        if (oldSummary) {
          finalSummary = truncateSummary(`${oldSummary}\n${trimmedSummary}`)
        }
      }

      const { data: summaryRecord, error: summaryError } = await supabase
        .from(MEMORY_SUMMARY_TABLE)
        .upsert(
          [
            {
              domain_id: existing.id,
              summary: finalSummary,
              evidence: resolvedEvidence || null,
              updated_at: updatedAt,
            },
          ],
          { onConflict: 'domain_id' },
        )
        .select()
        .maybeSingle()

      if (summaryError) {
        console.error('Failed to insert memory summary:', summaryError)
      }

      memoryCache = { domains: [], fetchedAt: 0 }
      console.log(`[Memory] Upserted domain: ${trimmedKey}`)
      await getMemoryDomains()
      return { updated: true, domain: updatedDomain || existing, summary: summaryRecord }
    }

    const { data: insertedDomain, error: insertError } = await supabase
      .from(MEMORY_DOMAIN_TABLE)
      .insert([
        {
          domain_key: trimmedKey,
          aliases: resolvedAliases,
          scope: resolvedScope,
          updated_at: updatedAt,
        },
      ])
      .select()
      .maybeSingle()

    if (insertError) {
      console.error('Failed to insert memory domain:', insertError)
    }

    if (insertedDomain?.id) {
      const { data: summaryRecord, error: summaryError } = await supabase
        .from(MEMORY_SUMMARY_TABLE)
        .upsert(
          [
            {
              domain_id: insertedDomain.id,
              summary: trimmedSummary,
              evidence: resolvedEvidence || null,
              updated_at: updatedAt,
            },
          ],
          { onConflict: 'domain_id' },
        )
        .select()
        .maybeSingle()

      if (summaryError) {
        console.error('Failed to insert memory summary:', summaryError)
      }

      memoryCache = { domains: [], fetchedAt: 0 }
      console.log(`[Memory] Upserted domain: ${trimmedKey}`)
      await getMemoryDomains()
      return { updated: true, domain: insertedDomain, summary: summaryRecord }
    }
    return { updated: false, error: 'Failed' }
  } catch (err) {
    console.error('Unexpected error in upsertMemoryDomainSummary:', err)
    return { updated: false, error: err.message }
  }
}

export const ensureLongTermMemoryIndex = async ({ text }) => {
  const trimmed = normalizeText(text)
  if (!trimmed) {
    await deleteMemoryDomain('profile')
    return { updated: false, cleared: true }
  }

  const payload = {
    domainKey: 'profile',
    scope: 'User background, preferences, and long-term context.',
    summary: trimmed,
    aliases: ['profile', 'preferences', 'background'],
  }

  const result = await upsertMemoryDomainSummary(payload)
  return { updated: !!result.updated, cleared: false, record: result }
}

export const formatMemorySummariesAppendText = domains => {
  if (!Array.isArray(domains) || domains.length === 0) return ''
  const lines = domains
    .map(domain => {
      const summary = normalizeText(domain?.latest_summary?.summary || domain?.summary)
      if (!summary) return null
      const label = normalizeText(domain?.domain_key || domain?.domainKey || 'domain')
      return `- ${label}: ${summary}`
    })
    .filter(Boolean)
  if (lines.length === 0) return ''

  return [
    '# User profile memory (preferences & background):',
    ...lines,
    '',
    'Note: Treat this as user preferences/background, not external factual sources.',
  ].join('\n')
}
