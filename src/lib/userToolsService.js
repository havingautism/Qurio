import { getSupabaseClient } from './supabase'

const table = 'user_tools'

export const getUserTools = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  // Get current user ID from session or use default for self-hosted mode
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id || 'default-user'

  if (!userId) return []

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user tools:', error)
    return []
  }

  return data || []
}

export const createUserTool = async toolData => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id || 'default-user'

  const { data, error } = await supabase
    .from(table)
    .insert({
      user_id: userId,
      name: toolData.name,
      description: toolData.description,
      type: toolData.type || 'http',
      config: toolData.config,
      input_schema: toolData.input_schema,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export const updateUserTool = async (id, toolData) => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from(table)
    .update({
      name: toolData.name,
      description: toolData.description,
      config: toolData.config,
      input_schema: toolData.input_schema,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export const deleteUserTool = async id => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.from(table).delete().eq('id', id)

  if (error) throw error
  return true
}

/**
 * Sync MCP tools from server - intelligently merge with existing tools
 * @param {string} serverName - MCP server name
 * @param {string} serverUrl - Server URL
 * @param {Array} newTools - Array of new tool definitions from server (with id, name, description, parameters)
 * @param {object} options - Optional MCP config overrides
 * @returns {Promise<object>} Sync result with stats
 */
export const syncMcpTools = async (serverName, serverUrl, newTools, options = {}) => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id || 'default-user'

  // Get existing tools from this server
  const { data: existingTools, error: fetchError } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'mcp')

  if (fetchError) throw fetchError

  const serverTools = existingTools.filter(tool => tool.config?.serverName === serverName)

  // Track sync stats
  const stats = {
    updated: 0,
    added: 0,
    deleted: 0,
    unchanged: 0
  }

  // Create maps for easy comparison (use tool.name as key)
  const existingToolMap = new Map()
  for (const tool of serverTools) {
    existingToolMap.set(tool.name, tool)
  }

  const newToolMap = new Map()
  for (const tool of newTools) {
    newToolMap.set(tool.name, tool)
  }

  // 1. Update existing tools or add new ones
  for (const [toolName, newTool] of newToolMap) {
    const existingTool = existingToolMap.get(toolName)

    if (existingTool) {
      // Update existing tool (URL + latest config)
      const updatedConfig = {
        ...existingTool.config,
        serverUrl: serverUrl,
        transport: options.transport || existingTool.config?.transport,
        bearerToken: options.bearerToken || existingTool.config?.bearerToken,
        headers: options.headers || existingTool.config?.headers,
        toolId: newTool.id,
        description: newTool.description,
        parameters: newTool.parameters
      }

      await supabase
        .from(table)
        .update({
          description: newTool.description,
          config: updatedConfig,
          input_schema: newTool.parameters
        })
        .eq('id', existingTool.id)

      stats.updated++
    } else {
      // Add new tool
      await supabase
        .from(table)
        .insert({
          user_id: userId,
          name: newTool.name,
          description: newTool.description,
          type: 'mcp',
          config: {
            serverName: serverName,
            serverUrl: serverUrl,
            transport: options.transport,
            bearerToken: options.bearerToken,
            headers: options.headers,
            toolId: newTool.id,
            toolName: newTool.name
          },
          input_schema: newTool.parameters
        })

      stats.added++
    }
  }

  // Note: We don't delete old tools - user may want to keep them

  return {
    success: true,
    serverName,
    ...stats
  }
}

/**
 * Update MCP server URL for all tools that belong to the server
 * @param {string} serverName - MCP server name
 * @param {string} newUrl - New server URL
 */
export const updateMcpServerUrl = async (serverName, newUrl) => {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id || 'default-user'

  // Get all tools from this server
  const { data: tools, error: fetchError } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'mcp')

  if (fetchError) throw fetchError

  // Filter tools by server name and update their config
  const toolsToUpdate = tools.filter(tool => tool.config?.serverName === serverName)

  for (const tool of toolsToUpdate) {
    const updatedConfig = {
      ...tool.config,
      serverUrl: newUrl
    }

    const { error: updateError } = await supabase
      .from(table)
      .update({ config: updatedConfig })
      .eq('id', tool.id)

    if (updateError) throw updateError
  }

  return { success: true, updatedCount: toolsToUpdate.length }
}
