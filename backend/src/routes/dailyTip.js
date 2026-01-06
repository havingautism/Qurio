/**
 * Daily Tip generation route
 * POST /api/daily-tip
 */

import express from 'express'
import { generateDailyTip } from '../services/dailyTipService.js'

const router = express.Router()

/**
 * POST /api/daily-tip
 * Generate a short, practical tip for today
 *
 * Request body:
 * {
 *   "provider": "gemini" | "openai" | "siliconflow" | "glm" | "modelscope" | "kimi",
 *   "language": "Language code (optional)",
 *   "category": "Tip category (optional)",
 *   "apiKey": "API key for the provider",
 *   "baseUrl": "Custom base URL (optional)",
 *   "model": "model-name" (optional)
 * }
 *
 * Response:
 * {
 *   "tip": "Generated tip text"
 * }
 */
router.post('/daily-tip', async (req, res) => {
  try {
    const { provider, language, category, apiKey, baseUrl, model } = req.body

    if (!provider) {
      return res.status(400).json({ error: 'Missing required field: provider' })
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

    console.log(`[API] generateDailyTip: provider=${provider}`)

    const tip = await generateDailyTip(provider, language, category, apiKey, baseUrl, model)

    res.json({ tip })
  } catch (error) {
    console.error('[API] generateDailyTip error:', error)
    res.status(500).json({
      error: 'Failed to generate daily tip',
      message: error.message,
    })
  }
})

export default router
