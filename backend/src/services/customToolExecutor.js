/**
 * Custom Tool Executor
 * Executes user-defined tools (HTTP, MCP, etc.) with security validation
 */

/**
 * Replace template variables in a string
 * Example: "{{city}}" with args.city = "Tokyo" becomes "Tokyo"
 */
function replaceTemplate(template, args) {
  if (typeof template !== 'string') return template

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in args) {
      return encodeURIComponent(String(args[key]))
    }
    return match
  })
}

/**
 * Replace template variables in params object
 */
function replaceTemplates(params, args) {
  const result = {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      result[key] = replaceTemplate(value, args)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Build URL with query parameters
 */
function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, String(value))
    }
  }

  return url.toString()
}

/**
 * Validate domain against whitelist
 */
function validateDomain(url, allowedDomains) {
  if (!allowedDomains || allowedDomains.length === 0) {
    throw new Error('No allowed domains configured for this tool')
  }

  const urlObj = new URL(url)
  const hostname = urlObj.hostname

  const isAllowed = allowedDomains.some(domain => {
    // Exact match
    if (hostname === domain) return true

    // Subdomain match (*.example.com)
    if (domain.startsWith('*.')) {
      const baseDomain = domain.slice(2)
      return hostname.endsWith('.' + baseDomain) || hostname === baseDomain
    }

    return false
  })

  if (!isAllowed) {
    throw new Error(`Domain ${hostname} is not in the allowed list: ${allowedDomains.join(', ')}`)
  }
}

/**
 * Execute HTTP tool with security validation
 */
export async function executeHttpTool(tool, args) {
  const { url, method = 'GET', params = {}, headers = {}, security = {} } = tool.config

  // Default security settings
  const {
    allowedDomains = [],
    maxResponseSize = 1000000, // 1MB default
    timeout = 10000, // 10s default
  } = security

  try {
    // 1. Replace template variables in params
    const finalParams = replaceTemplates(params, args)
    console.log('[CustomTool] Final params:', finalParams)

    // 2. Build final URL
    // First replace templates in the base URL itself (e.g. {{city}})
    let processedUrl = replaceTemplate(url, args)
    // Then append query parameters if method is GET
    const finalUrl = method === 'GET' ? buildUrl(processedUrl, finalParams) : processedUrl

    // 3. Validate domain
    validateDomain(finalUrl, allowedDomains)

    // 4. Prepare request options
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    }

    // Add body for POST/PUT/PATCH
    if (method !== 'GET' && method !== 'HEAD') {
      requestOptions.body = JSON.stringify(finalParams)
    }

    // 5. Execute request
    const response = await fetch(finalUrl, requestOptions)
    clearTimeout(timeoutId)

    // 6. Check response status
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // 7. Read response with size limit
    const text = await response.text()

    if (text.length > maxResponseSize) {
      throw new Error(
        `Response size ${text.length} bytes exceeds limit of ${maxResponseSize} bytes`,
      )
    }

    // 8. Parse JSON if possible
    try {
      return JSON.parse(text)
    } catch {
      // Return as text if not JSON
      return { data: text }
    }
  } catch (error) {
    // Handle timeout
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`)
    }

    // Re-throw other errors
    throw error
  }
}

/**
 * Execute MCP tool
 * Calls a tool from a connected MCP server
 */
export async function executeMcpTool(tool, args) {
  try {
    const { mcpToolManager } = await import('./mcpToolManager.js')

    console.log(`[MCP Tool] Executing ${tool.id} with args:`, JSON.stringify(args, null, 2))

    // Call the MCP tool
    const result = await mcpToolManager.executeMcpTool(tool.id, args)

    // Extract and return content from MCP response
    if (result.content && result.content.length > 0) {
      // Collect all text content
      const textContent = result.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n')

      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(textContent)
        return { data: parsed, raw: textContent }
      } catch {
        // Return as text if not valid JSON
        return { data: textContent }
      }
    }

    // Handle error response
    if (result.isError) {
      throw new Error(`MCP tool error: ${JSON.stringify(result.content)}`)
    }

    // Return empty result if no content
    return { data: null }
  } catch (error) {
    console.error(`[MCP Tool] Execution failed:`, error.message)
    throw error
  }
}

/**
 * Execute custom tool (dispatcher for different tool types)
 */
export async function executeCustomTool(tool, args) {
  switch (tool.type) {
    case 'http':
      return await executeHttpTool(tool, args)
    case 'mcp':
      return await executeMcpTool(tool, args)
    default:
      throw new Error(`Unknown tool type: ${tool.type}`)
  }
}
