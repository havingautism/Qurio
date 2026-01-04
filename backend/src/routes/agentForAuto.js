/**
 * Agent for Auto mode generation route
 * POST /api/agent-for-auto
 */

import express from 'express'
import { generateAgentForAuto } from '../services/agentForAutoService.js'

const router = express.Router()

router.post('/agent-for-auto', async (req, res) => {
  try {
    const { provider, message, currentSpace, apiKey, baseUrl, model } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }

    const supportedProviders = ['gemini', 'openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`,
      })
    }

    console.log(`[API] generateAgentForAuto: provider=${provider}`)

    const agentName = await generateAgentForAuto(
      provider,
      message,
      currentSpace,
      apiKey,
      baseUrl,
      model,
    )

    res.json({ agentName })
  } catch (error) {
    console.error('[API] generateAgentForAuto error:', error)
    res.status(500).json({
      error: 'Failed to generate agent for auto',
      message: error.message,
    })
  }
})

export default router
