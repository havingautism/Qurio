/**
 * Lazy-loading wrapper for longTermMemoryService.
 *
 * Importing longTermMemoryService synchronously at module level can trigger
 * rspack/rsbuild "factory is undefined" HMR race conditions during dev startup.
 * This helper defers the import until the first actual call, which avoids the
 * race window entirely.
 */

let _module = null

const load = () => {
  if (!_module) {
    _module = import('./longTermMemoryService')
  }
  return _module
}

export const getMemoryDomains = async (...args) => {
  const m = await load()
  return m.getMemoryDomains(...args)
}

export const upsertMemoryDomainSummary = async (...args) => {
  const m = await load()
  return m.upsertMemoryDomainSummary(...args)
}

export const deleteMemoryDomain = async (...args) => {
  const m = await load()
  return m.deleteMemoryDomain(...args)
}

export const ensureLongTermMemoryIndex = async (...args) => {
  const m = await load()
  return m.ensureLongTermMemoryIndex(...args)
}

export const formatMemorySummariesAppendText = async (...args) => {
  const m = await load()
  return m.formatMemorySummariesAppendText(...args)
}
