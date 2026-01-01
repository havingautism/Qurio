/**
 * Research Plan generation route
 * POST /api/research-plan
 */

import express from 'express'
import { generateResearchPlan } from '../services/researchPlanService.js'

const router = express.Router()

/**
 * POST /api/research-plan
 * Generate a structured deep research plan
 *
 * Request body:
 * {
 *   "provider": "gemini" | "openai" | "siliconflow" | "glm" | "modelscope" | "kimi",
 *   "message": "User message about research",
 *   "apiKey": "API key for the provider",
 *   "baseUrl": "Custom base URL (optional)",
 *   "model": "model-name" (optional)
 * }
 *
 * Response:
 * {
 *   "plan": "JSON string of the research plan"
 * }
 */
router.post('/research-plan', async (req, res) => {
  try {
    const { provider, message, apiKey, baseUrl, model } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }

    const supportedProviders = ['gemini', 'openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`
      })
    }

    console.log(`[API] generateResearchPlan: provider=${provider}`)

    const plan = await generateResearchPlan(provider, message, apiKey, baseUrl, model)

    res.json({ plan })
  } catch (error) {
    console.error('[API] generateResearchPlan error:', error)
    res.status(500).json({
      error: 'Failed to generate research plan',
      message: error.message
    })
  }
})

export default router
