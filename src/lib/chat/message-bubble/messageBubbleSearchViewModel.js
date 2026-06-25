const parseToolArguments = rawArguments => {
  if (!rawArguments) return null
  if (typeof rawArguments === 'object') return rawArguments
  if (typeof rawArguments !== 'string') return null

  try {
    const parsed = JSON.parse(rawArguments)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function resolveMessageSearchBackends({
  isExpertMessage,
  activeExpertResponse,
  mergedMessage,
  toolCallHistory,
}) {
  const explicitBackends = isExpertMessage
    ? activeExpertResponse?.searchBackends
    : mergedMessage?.searchBackends
  if (Array.isArray(explicitBackends) && explicitBackends.length > 0) {
    return explicitBackends.map(item => String(item)).filter(Boolean)
  }

  const explicitBackend = isExpertMessage
    ? activeExpertResponse?.searchBackend
    : mergedMessage?.searchBackend
  if (typeof explicitBackend === 'string' && explicitBackend) {
    return [explicitBackend]
  }

  for (const item of toolCallHistory || []) {
    if (!item || (item.name !== 'web_search' && item.name !== 'search_news')) continue
    const parsed = parseToolArguments(item.arguments)
    if (!parsed) continue
    if (Array.isArray(parsed.backends) && parsed.backends.length > 0) {
      return parsed.backends.map(value => String(value)).filter(Boolean)
    }
    if (parsed.backend) return [String(parsed.backend)]
  }

  return []
}

export function resolveSearchBackendForTool(tool, resolvedSearchBackends = []) {
  if (!tool) return null

  const isWebSearch = tool.name === 'web_search' || tool.name === 'search_news'
  const isImageSearch =
    tool.name === 'duckduckgo_image_search' ||
    tool.name === 'google_image_search' ||
    tool.name === 'bing_image_search' ||
    tool.name === 'serpapi_image_search'
  const isVideoSearch = tool.name === 'duckduckgo_video_search' || tool.name === 'search_youtube'

  if (!isWebSearch && !isImageSearch && !isVideoSearch) return null

  if (isImageSearch) {
    if (tool.name.includes('google')) return 'google'
    if (tool.name.includes('bing')) return 'bing'
    if (tool.name.includes('duckduckgo')) return 'duckduckgo'
  }

  if (isVideoSearch) {
    if (tool.name === 'search_youtube') return 'youtube'
    if (tool.name.includes('duckduckgo')) return 'duckduckgo'
  }

  const parsed = parseToolArguments(tool.arguments)
  if (parsed) {
    if (typeof parsed.engine === 'string' && parsed.engine) {
      if (parsed.engine.includes('google')) return 'google'
      if (parsed.engine.includes('bing')) return 'bing'
      if (parsed.engine.includes('yahoo')) return 'yahoo'
    }
    if (typeof parsed.backend === 'string' && parsed.backend) return parsed.backend
    if (Array.isArray(parsed.backends) && parsed.backends.length > 0) {
      return String(parsed.backends[0])
    }
  }

  if (resolvedSearchBackends.length > 0) return resolvedSearchBackends[0]
  return null
}

export function getToolArgumentsForDisplayWithResolvedBackends(tool, resolvedSearchBackends = []) {
  if (!tool || !tool.arguments) return tool?.arguments
  if (tool.name !== 'web_search' && tool.name !== 'search_news') return tool.arguments
  if (resolvedSearchBackends.length === 0) return tool.arguments

  if (typeof tool.arguments === 'object') {
    if (tool.arguments.backend || tool.arguments.backends) return tool.arguments
    return resolvedSearchBackends.length > 1
      ? {
          ...tool.arguments,
          backend: resolvedSearchBackends[0],
          backends: resolvedSearchBackends,
        }
      : { ...tool.arguments, backend: resolvedSearchBackends[0] }
  }

  if (typeof tool.arguments === 'string') {
    try {
      const parsed = JSON.parse(tool.arguments)
      if (!parsed || typeof parsed !== 'object') return tool.arguments
      if (parsed.backend || parsed.backends) return tool.arguments
      return JSON.stringify(
        resolvedSearchBackends.length > 1
          ? { ...parsed, backend: resolvedSearchBackends[0], backends: resolvedSearchBackends }
          : { ...parsed, backend: resolvedSearchBackends[0] },
      )
    } catch {
      return tool.arguments
    }
  }

  return tool.arguments
}

export function getToolDisplayNameWithDetails(tool, t, translationKeys = {}) {
  if (!tool) return ''

  const baseName = translationKeys[tool.name] ? t(translationKeys[tool.name]) : tool.name
  const parsedArguments = parseToolArguments(tool.arguments)

  const getFileName = filePath => {
    if (!filePath || typeof filePath !== 'string') return ''
    const normalized = filePath.replace(/\\/g, '/')
    const segments = normalized.split('/').filter(Boolean)
    return segments[segments.length - 1] || filePath
  }

  let detail = ''
  if (tool.name === 'execute_skill_script' || tool.name === 'get_skill_script') {
    detail = getFileName(parsedArguments?.script_path)
  } else if (tool.name === 'install_skill_dependency') {
    detail =
      typeof parsedArguments?.package_name === 'string' ? parsedArguments.package_name.trim() : ''
  }

  return detail ? `${baseName} (${detail})` : baseName
}
