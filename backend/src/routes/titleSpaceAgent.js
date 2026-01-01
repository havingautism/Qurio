/**
 * Title, Space, and Agent generation route
 * POST /api/title-space-agent
 */

import express from 'express'
import { generateTitleSpaceAndAgent } from '../services/titleSpaceAgentService.js'

const router = express.Router()

/**
 * POST /api/title-space-agent
 * Generate title, select space, and optionally select agent
 *
 * Request body:
 * {
 *   "provider": "gemini" | "openai" | "siliconflow" | "glm" | "modelscope" | "kimi",
 *   "message": "User's first message",
 *   "spacesWithAgents": [{ label, description, agents: [{name, description?}] }],
 *   "apiKey": "API key for the provider",
 *   "baseUrl": "Custom base URL (optional)",
 *   "model": "model-name" (optional)
 * }
 *
 * Response:
 * {
 *   "title": "Generated title",
 *   "spaceLabel": "Selected space label" | null,
 *   "agentName": "Selected agent name" | null
 * }
 */
router.post('/title-space-agent', async (req, res) => {
  try {
    const { provider, message, spacesWithAgents, apiKey, baseUrl, model } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }

    const supportedProviders = ['gemini', 'openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`
      })
    }

    console.log(`[API] generateTitleSpaceAndAgent: provider=${provider}`)

    const result = await generateTitleSpaceAndAgent(provider, message, spacesWithAgents || [], apiKey, baseUrl, model)

    res.json(result)
  } catch (error) {
    console.error('[API] generateTitleSpaceAndAgent error:', error)
    res.status(500).json({
      error: 'Failed to generate title, space, and agent',
      message: error.message
    })
  }
})

export default router
