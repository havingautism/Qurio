// MCP Tool Manager for Qurio
// Manages MCP server connections and converts MCP tools to Qurio tool format

import { MultiServerMCPClient } from '@langchain/mcp-adapters'

/**
 * MCP Tool Manager
 * Handles loading, caching, and managing MCP tools from ModelScope servers
 */
class MCPToolManager {
  constructor() {
    // Store MCP tool definitions by ID
    this.mcpTools = new Map()

    // Store loaded MCP servers
    this.loadedServers = new Set()

    // Store MCP client connections
    this.connections = new Map()
  }

  normalizeServerConfig(name, serverConfig) {
    if (typeof serverConfig === 'string') {
      return {
        name,
        url: serverConfig,
        transport: 'streamable_http',
        headers: {},
        bearerToken: null,
      }
    }

    const url = serverConfig?.url || serverConfig?.serverUrl || serverConfig?.sseUrl
    if (!url) {
      throw new Error(`Missing server URL for ${name}`)
    }

    return {
      name,
      url,
      transport: this.normalizeTransport(serverConfig?.transport),
      headers: serverConfig?.headers || {},
      bearerToken: serverConfig?.bearerToken || serverConfig?.authToken || null,
    }
  }

  normalizeTransport(transport) {
    if (!transport) return 'sse'
    const value = String(transport).toLowerCase()
    if (value === 'http' || value === 'streamable' || value === 'streamable-http') {
      return 'http'
    }
    if (value === 'streamable_http') return 'http'
    return 'sse'
  }

  buildServerConfig({ url, transport, headers, bearerToken }) {
    const authHeaders = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}
    const mergedHeaders = { ...headers, ...authHeaders }

    return {
      transport,
      url,
      headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
    }
  }

  extractToolSchema(tool) {
    const candidates = [
      tool?.inputSchema,
      tool?.input_schema,
      tool?.parameters,
      tool?.schema,
      tool?.schema?.schema,
    ]
    const raw = candidates.find(item => item && typeof item === 'object')
    if (raw?.type || raw?.properties) return raw

    return {
      type: 'object',
      properties: {},
      required: [],
    }
  }

  normalizeToolResult(result) {
    if (!result) return { content: [] }
    if (result.content && Array.isArray(result.content)) return result

    const text =
      typeof result === 'string'
        ? result
        : typeof result === 'object'
          ? JSON.stringify(result)
          : String(result)

    return {
      content: [{ type: 'text', text }],
    }
  }

  /**
   * Connect to an MCP server
   * @param {string} name - Server name (unique identifier)
   * @param {string|object} serverConfig - Server URL or config
   * @returns {Promise<MultiServerMCPClient>} MCP client
   */
  async connectToServer(name, serverConfig) {
    try {
      const normalizedConfig = this.normalizeServerConfig(name, serverConfig)
      console.log(`[MCP Manager] Connecting to ${name}...`)

      const serverConfigPayload = this.buildServerConfig(normalizedConfig)
      const client = new MultiServerMCPClient({
        mcpServers: {
          [name]: serverConfigPayload,
        },
      })

      // Store the connection
      this.connections.set(name, { client, url: normalizedConfig.url })

      console.log(`[MCP Manager] ✅ Connected to ${name}`)

      return client
    } catch (error) {
      console.error(`[MCP Manager] ❌ Failed to connect to ${name}:`, error.message)
      throw error
    }
  }

  /**
   * Disconnect from an MCP server
   * @param {string} name - Server name
   */
  async disconnectFromServer(name) {
    try {
      const connection = this.connections.get(name)
      if (!connection) return

      if (typeof connection.client.close === 'function') {
        await connection.client.close()
      }
      this.connections.delete(name)

      console.log(`[MCP Manager] ✅ Disconnected from ${name}`)
    } catch (error) {
      console.error(`[MCP Manager] ❌ Failed to disconnect from ${name}:`, error.message)
    }
  }

  /**
   * List tools from a connected MCP server
   * @param {string} name - Server name
   * @returns {Promise<Array>} Array of MCP tools
   */
  async listToolsFromServer(name) {
    try {
      const connection = this.connections.get(name)
      if (!connection) {
        throw new Error(`No connection found: ${name}`)
      }

      if (typeof connection.client.listTools === 'function') {
        const response = await connection.client.listTools(name)
        return response?.tools || response || []
      }

      if (typeof connection.client.getTools === 'function') {
        const tools = await connection.client.getTools()
        return tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: this.extractToolSchema(tool),
        }))
      }

      throw new Error('Unsupported MCP client API: missing listTools/getTools')
    } catch (error) {
      console.error(`[MCP Manager] ??Failed to list tools from ${name}:`, error.message)
      throw error
    }
  }

  /**
   * Call a tool from a connected MCP server
   * @param {string} name - Server name
   * @param {string} toolName - Tool name to call
   * @param {object} args - Tool arguments
   * @returns {Promise<object>} Tool call result
   */
  async callTool(name, toolName, args = {}) {
    try {
      const connection = this.connections.get(name)
      if (!connection) {
        throw new Error(`No connection found: ${name}`)
      }

      console.log(
        `[MCP Manager] Calling tool ${toolName} with args:`,
        JSON.stringify(args, null, 2),
      )

      let response = null
      if (typeof connection.client.callTool === 'function') {
        response = await connection.client.callTool(name, toolName, args)
      } else if (typeof connection.client.invokeTool === 'function') {
        response = await connection.client.invokeTool(name, toolName, args)
      } else if (typeof connection.client.getTools === 'function') {
        const tools = await connection.client.getTools()
        const tool = tools.find(item => item.name === toolName)
        if (!tool) {
          throw new Error(`Tool not found on server ${name}: ${toolName}`)
        }
        if (typeof tool.invoke === 'function') {
          response = await tool.invoke(args)
        } else if (typeof tool.call === 'function') {
          response = await tool.call(args)
        } else {
          throw new Error(`Tool ${toolName} does not support invoke/call`)
        }
      } else {
        throw new Error('Unsupported MCP client API: missing callTool/getTools')
      }

      const normalizedResponse = this.normalizeToolResult(response)

      // Log the response for debugging
      console.log(
        `[MCP Manager] Tool ${toolName} response:`,
        JSON.stringify(normalizedResponse, null, 2),
      )

      if (normalizedResponse.isError) {
        console.error(`[MCP Manager] ??Tool ${toolName} returned error:`, normalizedResponse)
      } else {
        console.log(`[MCP Manager] ??Tool ${toolName} executed successfully`)
      }

      return normalizedResponse
    } catch (error) {
      console.error(`[MCP Manager] ??Failed to call tool ${toolName}:`, error.message)
      throw error
    }
  }

  /**
   * Connect to an MCP server and load its tools
   * @param {string} name - Server name (unique identifier)
   * @param {string|object} serverConfig - Server URL or config
   * @returns {Promise<Array>} Array of Qurio-formatted tools
   */
  async loadMcpServer(name, serverConfig) {
    try {
      console.log(`[MCP Manager] Loading MCP server: ${name}`)

      // Connect to MCP server
      await this.connectToServer(name, serverConfig)

      // Get available tools
      const tools = await this.listToolsFromServer(name)

      console.log(`[MCP Manager] Found ${tools.length} tools from ${name}`)

      // Convert to Qurio tool format
      const qurioTools = tools.map(tool => this.convertToQurioTool(name, tool))

      // Store tools
      for (const tool of qurioTools) {
        this.mcpTools.set(tool.id, tool)
      }

      // Mark server as loaded
      this.loadedServers.add(name)

      console.log(`[MCP Manager] ✅ Loaded ${qurioTools.length} tools from ${name}`)

      return qurioTools
    } catch (error) {
      console.error(`[MCP Manager] ❌ Failed to load server ${name}:`, error.message)
      throw error
    }
  }

  /**
   * Convert MCP tool to Qurio tool format
   * @param {string} serverName - MCP server name
   * @param {object} mcpTool - MCP tool definition
   * @returns {object} Qurio-formatted tool
   */
  convertToQurioTool(serverName, mcpTool) {
    return {
      id: `mcp_${serverName}_${mcpTool.name}`,
      name: mcpTool.name,
      type: 'mcp',
      category: 'mcp',
      description: `[MCP] ${mcpTool.description || 'No description'}`,
      parameters: this.convertParameters(mcpTool.inputSchema),
      config: {
        mcpServer: serverName,
        toolName: mcpTool.name,
      },
      metadata: {
        serverName,
        originalName: mcpTool.name,
        originalDescription: mcpTool.description,
      },
    }
  }

  /**
   * Convert MCP input schema to Qurio parameters format
   * @param {object} inputSchema - MCP tool input schema
   * @returns {object} Qurio parameters format
   */
  convertParameters(inputSchema) {
    if (!inputSchema) {
      return {
        type: 'object',
        properties: {},
      }
    }

    // MCP uses JSON Schema format, convert to our format
    return {
      type: inputSchema.type || 'object',
      properties: inputSchema.properties || {},
      required: inputSchema.required || [],
    }
  }

  /**
   * Get MCP tool by ID
   * @param {string} toolId - Tool ID
   * @returns {object|undefined} Tool definition or undefined
   */
  getMcpTool(toolId) {
    return this.mcpTools.get(toolId)
  }

  /**
   * List all MCP tools
   * @returns {Array} Array of all MCP tools
   */
  listMcpTools() {
    return Array.from(this.mcpTools.values())
  }

  /**
   * List MCP tools by server
   * @param {string} serverName - Server name
   * @returns {Array} Array of tools from the server
   */
  listMcpToolsByServer(serverName) {
    return this.listMcpTools().filter(tool => tool.config.mcpServer === serverName)
  }

  /**
   * Execute an MCP tool
   * @param {string} toolId - Tool ID
   * @param {object} args - Tool arguments
   * @returns {Promise<object>} Tool execution result
   */
  async executeMcpTool(toolId, args = {}) {
    const tool = this.getMcpTool(toolId)

    if (!tool) {
      throw new Error(`MCP tool not found: ${toolId}`)
    }

    console.log(`[MCP Manager] Executing tool: ${toolId}`)

    const result = await this.callTool(tool.config.mcpServer, tool.config.toolName, args)

    return result
  }

  /**
   * Unload an MCP server and its tools
   * @param {string} name - Server name
   */
  async unloadMcpServer(name) {
    console.log(`[MCP Manager] Unloading MCP server: ${name}`)

    // Remove tools from this server
    const toolsToRemove = this.listMcpToolsByServer(name)
    for (const tool of toolsToRemove) {
      this.mcpTools.delete(tool.id)
    }

    // Disconnect from server
    await this.disconnectFromServer(name)

    // Remove from loaded list
    this.loadedServers.delete(name)

    console.log(`[MCP Manager] ✅ Unloaded server: ${name}`)
  }

  /**
   * Fetch tools from a server URL without storing them
   * Used for previewing tools before adding or updating server URL
   * @param {string} serverName - Server name
   * @param {string|object} serverConfig - Server URL or config
   * @returns {Promise<Array>} Array of Qurio-formatted tools
   */
  async fetchToolsFromServerUrl(serverName, serverConfig) {
    let tempClient = null

    try {
      const normalizedConfig = this.normalizeServerConfig(serverName, serverConfig)
      console.log(`[MCP Manager] Fetching tools from ${serverName} at ${normalizedConfig.url}`)

      const serverConfigPayload = this.buildServerConfig(normalizedConfig)
      tempClient = new MultiServerMCPClient({
        mcpServers: {
          [serverName]: serverConfigPayload,
        },
      })

      let tools = []
      if (typeof tempClient.listTools === 'function') {
        const response = await tempClient.listTools(serverName)
        tools = response?.tools || response || []
      } else if (typeof tempClient.getTools === 'function') {
        const adapterTools = await tempClient.getTools()
        tools = adapterTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: this.extractToolSchema(tool),
        }))
      } else {
        throw new Error('Unsupported MCP client API: missing listTools/getTools')
      }

      console.log(`[MCP Manager] Found ${tools.length} tools from ${serverName}`)

      // Convert to Qurio tool format
      const qurioTools = tools.map(tool => this.convertToQurioTool(serverName, tool))

      console.log(`[MCP Manager] ??Fetched ${qurioTools.length} tools from ${serverName}`)

      return qurioTools
    } catch (error) {
      console.error(`[MCP Manager] ??Failed to fetch tools from ${serverName}:`, error.message)
      throw error
    } finally {
      // Clean up temporary connection
      if (tempClient && typeof tempClient.close === 'function') {
        try {
          await tempClient.close()
        } catch (e) {
          console.error('[MCP Manager] Error closing temporary client:', e.message)
        }
      }
    }
  }

  /**
   * Get status of all loaded MCP servers
   * @returns {object} Status information
   */
  getStatus() {
    return {
      loadedServers: Array.from(this.loadedServers),
      totalTools: this.mcpTools.size,
      toolsByServer: {},
    }
  }
}

// Export singleton instance
export const mcpToolManager = new MCPToolManager()
