/**
 * Title and Space generation route
 * POST /api/title-and-space
 */

import express from 'express'
import { generateTitleAndSpace } from '../services/titleAndSpaceService.js'

const router = express.Router()

router.post('/title-and-space', async (req, res) => {
  try {
    const { provider, message, spaces, apiKey, baseUrl, model } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }

    const supportedProviders = ['gemini', 'openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`
      })
    }

    console.log(`[API] generateTitleAndSpace: provider=${provider}`)

    const result = await generateTitleAndSpace(provider, message, spaces || [], apiKey, baseUrl, model)

    res.json(result)
  } catch (error) {
    console.error('[API] generateTitleAndSpace error:', error)
    res.status(500).json({
      error: 'Failed to generate title and space',
      message: error.message
    })
  }
})

export default router
