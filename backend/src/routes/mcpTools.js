// MCP Tools API Routes
// User-defined MCP tool management endpoints

import express from 'express'
import { mcpToolManager } from '../services/mcpToolManager.js'

const router = express.Router()

/**
 * GET /api/mcp-tools/servers
 * List all loaded MCP servers
 */
router.get('/servers', (req, res) => {
  try {
    const status = mcpToolManager.getStatus()

    res.json({
      success: true,
      servers: status.loadedServers,
      totalTools: status.totalTools
    })
  } catch (error) {
    console.error('[MCP Tools] List servers error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * POST /api/mcp-tools/servers
 * Load a new MCP server
 * Body: { name: string, url: string, transport?: string, bearerToken?: string, headers?: object }
 */
router.post('/servers', async (req, res) => {
  try {
    const { name, url, transport, bearerToken, headers } = req.body

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name and url'
      })
    }

    const tools = await mcpToolManager.loadMcpServer(name, {
      url,
      transport,
      bearerToken,
      headers
    })

    res.json({
      success: true,
      message: `Loaded ${tools.length} tools from ${name}`,
      server: name,
      toolsLoaded: tools.length,
      tools: tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    })
  } catch (error) {
    console.error('[MCP Tools] Load server error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/mcp-tools/servers/:name/tools
 * List all tools from a specific server
 */
router.get('/servers/:name/tools', (req, res) => {
  try {
    const { name } = req.params
    const tools = mcpToolManager.listMcpToolsByServer(name)

    res.json({
      success: true,
      server: name,
      tools: tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      })),
      total: tools.length
    })
  } catch (error) {
    console.error('[MCP Tools] List server tools error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * DELETE /api/mcp-tools/servers/:name
 * Unload an MCP server
 */
router.delete('/servers/:name', async (req, res) => {
  try {
    const { name } = req.params

    await mcpToolManager.unloadMcpServer(name)

    res.json({
      success: true,
      message: `Unloaded server: ${name}`
    })
  } catch (error) {
    console.error('[MCP Tools] Unload error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/mcp-tools/tools
 * List all MCP tools from all servers
 */
router.get('/tools', (req, res) => {
  try {
    const tools = mcpToolManager.listMcpTools()

    res.json({
      success: true,
      tools: tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
        server: tool.config.mcpServer
      })),
      total: tools.length
    })
  } catch (error) {
    console.error('[MCP Tools] List tools error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/mcp-tools/tool/:toolId
 * Get details of a specific MCP tool
 */
router.get('/tool/:toolId', (req, res) => {
  try {
    const { toolId } = req.params
    const tool = mcpToolManager.getMcpTool(toolId)

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: `Tool not found: ${toolId}`
      })
    }

    res.json({
      success: true,
      tool: {
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
        server: tool.config.mcpServer,
        metadata: tool.metadata
      }
    })
  } catch (error) {
    console.error('[MCP Tools] Get tool error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * POST /api/mcp-tools/fetch
 * Fetch tools from an MCP server URL (temporary connection)
 * Body: { name: string, url: string, transport?: string, bearerToken?: string, headers?: object }
 */
router.post('/fetch', async (req, res) => {
  try {
    const { name, url, transport, bearerToken, headers } = req.body

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name and url'
      })
    }

    const tools = await mcpToolManager.fetchToolsFromServerUrl(name, {
      url,
      transport,
      bearerToken,
      headers
    })

    res.json({
      success: true,
      server: name,
      tools: tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      })),
      total: tools.length
    })
  } catch (error) {
    console.error('[MCP Tools] Fetch tools error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router
