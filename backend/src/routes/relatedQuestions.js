/**
 * Related Questions generation route
 * POST /api/related-questions
 */

import express from 'express'
import { generateRelatedQuestions } from '../services/relatedQuestionsService.js'

const router = express.Router()

router.post('/related-questions', async (req, res) => {
  try {
    const { provider, messages, apiKey, baseUrl, model } = req.body

    if (!provider || !messages) {
      return res.status(400).json({ error: 'Missing required fields: provider, messages' })
    }

    const supportedProviders = [
      'gemini',
      'openai',
      'openai_compatibility',
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

    console.log(`[API] generateRelatedQuestions: provider=${provider}`)

    const questions = await generateRelatedQuestions(provider, messages, apiKey, baseUrl, model)

    res.json({ questions })
  } catch (error) {
    console.error('[API] generateRelatedQuestions error:', error)
    res.status(500).json({
      error: 'Failed to generate related questions',
      message: error.message,
    })
  }
})

export default router
