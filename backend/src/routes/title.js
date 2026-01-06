/**
 * Title generation route
 * POST /api/title
 */

import express from 'express'
import { generateTitle } from '../services/titleService.js'

const router = express.Router()

/**
 * POST /api/title
 * Generate a title for a conversation based on the first user message
 *
 * Request body:
 * {
 *   "provider": "gemini" | "openai" | "siliconflow" | "glm" | "modelscope" | "kimi",
 *   "message": "User's first message",
 *   "apiKey": "API key for the provider",
 *   "baseUrl": "Custom base URL (optional)",
 *   "model": "model-name" (optional)
 * }
 *
 * Response:
 * {
 *   "title": "Generated title",
 *   "emojis": ["🙂","✨"]
 * }
 */
router.post('/title', async (req, res) => {
  try {
    const { provider, message, apiKey, baseUrl, model } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }

    const supportedProviders = [
      'gemini',
      'openai',
      'siliconflow',
      'glm',
      'modelscope',
      'kimi',
      'nvidia',
    ]
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`,
      })
    }

    console.log(`[API] generateTitle: provider=${provider}`)

    const result = await generateTitle(provider, message, apiKey, baseUrl, model)

    res.json({
      title: result?.title || 'New Conversation',
      emojis: Array.isArray(result?.emojis) ? result.emojis : [],
    })
  } catch (error) {
    console.error('[API] generateTitle error:', error)
    res.status(500).json({
      error: 'Failed to generate title',
      message: error.message,
    })
  }
})

export default router
